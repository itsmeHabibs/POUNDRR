// File: app/(tabs)/profile/settings/notifications.tsx
// Updates:
// - Removed top-level import of 'expo-notifications' to avoid module-not-found compile error.
// - Added safe dynamic loader (via eval import) so the screen works even if the package isn't installed.
// - All rules preserved: no top-level firebase/auth, Firestore OK, uses useAuthUid, strict-friendly TS.

import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';

import { db } from '@/firebase';
import { useAuthUid } from '@/hooks/useAuthUid';

import {
  Timestamp,
  collection,
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';

type PrefsDoc = {
  pushEnabled?: boolean;
  fightAlerts?: boolean;
  eventReminders?: boolean;
  marketingPush?: boolean;
  expoPushToken?: string | null;
  platform?: 'ios' | 'android' | 'web';
  updatedAt?: Timestamp | any;
  createdAt?: Timestamp | any;
};

const RED = '#f70000';
const CARD_BG = 'rgba(0,0,0,0.82)';
const BORDER = 'rgba(255,255,255,0.14)';

// Safe optional loader for expo-notifications.
// Avoids compile-time module resolution by using eval-based dynamic import.
async function tryLoadNotifications(): Promise<any | null> {
  try {
    // eslint-disable-next-line no-eval
    const mod = await (eval('import("expo-notifications")') as Promise<any>);
    return mod ?? null;
  } catch {
    return null;
  }
}

export default function NotificationSettingsScreen(): React.ReactElement {
  const router = useRouter();
  const { uid, error: authErr } = useAuthUid();

  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);

  // prefs state
  const [pushEnabled, setPushEnabled] = useState<boolean>(false);
  const [fightAlerts, setFightAlerts] = useState<boolean>(true);
  const [eventReminders, setEventReminders] = useState<boolean>(true);
  const [marketingPush, setMarketingPush] = useState<boolean>(false);
  const [expoPushToken, setExpoPushToken] = useState<string | null>(null);

  const isWeb = Platform.OS === 'web';
  const prefsRef = useMemo(() => (uid ? doc(db, 'users', uid, 'private', 'notificationPrefs') : null), [uid]);

  // Load prefs
  useEffect(() => {
    (async () => {
      if (!uid || !prefsRef) {
        setLoading(false);
        return;
      }
      try {
        const snap = await getDoc(prefsRef);
        if (snap.exists()) {
          const data = (snap.data() as PrefsDoc) ?? {};
          setPushEnabled(Boolean(data.pushEnabled));
          setFightAlerts(data.fightAlerts ?? true);
          setEventReminders(data.eventReminders ?? true);
          setMarketingPush(data.marketingPush ?? false);
          setExpoPushToken(data.expoPushToken ?? null);
        } else {
          // Seed defaults (lazy)
          await setDoc(
            prefsRef,
            {
              pushEnabled: false,
              fightAlerts: true,
              eventReminders: true,
              marketingPush: false,
              platform: (Platform.OS as 'ios' | 'android' | 'web') ?? 'web',
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            } as PrefsDoc,
            { merge: true }
          );
        }
      } catch (e) {
        console.warn('[notifications] load error:', e);
      } finally {
        setLoading(false);
      }
    })();
  }, [uid, prefsRef]);

  const persist = useCallback(
    async (patch: Partial<PrefsDoc>): Promise<void> => {
      if (!prefsRef) return;
      try {
        setSaving(true);
        await updateDoc(prefsRef, { ...patch, updatedAt: serverTimestamp() });
      } catch (e) {
        // If doc doesn't exist yet, fallback to setDoc merge
        try {
          await setDoc(prefsRef, { ...patch, updatedAt: serverTimestamp() }, { merge: true });
        } catch (e2) {
          console.warn('[notifications] persist error:', e2);
          Alert.alert('Error', 'Could not save preferences.');
        }
      } finally {
        setSaving(false);
      }
    },
    [prefsRef]
  );

  const registerForPush = useCallback(async (): Promise<string | null> => {
    if (isWeb) {
      Alert.alert('Not supported', 'Push notifications are not supported on web.');
      return null;
    }
    const Notifications = await tryLoadNotifications();
    if (!Notifications) {
      Alert.alert(
        'Not available',
        'Push requires the optional dependency "expo-notifications". Add it to your project to enable.'
      );
      return null;
    }
    try {
      const settings = await Notifications.getPermissionsAsync();
      let status = settings?.status;
      if (status !== 'granted') {
        const req = await Notifications.requestPermissionsAsync();
        status = req?.status;
      }
      if (status !== 'granted') {
        Alert.alert('Permission denied', 'Enable notifications in Settings to receive alerts.');
        return null;
      }
      const tokenResp = await Notifications.getExpoPushTokenAsync();
      const token = tokenResp?.data as string | undefined;
      return token ?? null;
    } catch (e) {
      console.warn('[notifications] register error:', e);
      Alert.alert('Error', 'Could not enable push notifications.');
      return null;
    }
  }, [isWeb]);

  const linkTokenToUser = useCallback(
    async (token: string | null): Promise<void> => {
      if (!uid || !prefsRef) return;
      // Save on user doc
      await persist({
        expoPushToken: token,
        platform: (Platform.OS as 'ios' | 'android' | 'web') ?? 'web',
        pushEnabled: Boolean(token),
      });

      // Optionally keep a reverse index in a collection for sending
      try {
        if (token) {
          const ref = doc(collection(db, 'pushTokens'), token);
          await setDoc(
            ref,
            {
              uid,
              platform: Platform.OS,
              updatedAt: serverTimestamp(),
              createdAt: serverTimestamp(),
            },
            { merge: true }
          );
        }
      } catch (e) {
        console.warn('[notifications] pushTokens index error:', e);
      }
    },
    [uid, prefsRef, persist]
  );

  const onTogglePush = useCallback(async () => {
    if (!uid) {
      Alert.alert('Sign in required', 'Please log in to manage notifications.');
      router.push('/login');
      return;
    }
    if (isWeb) {
      Alert.alert('Not supported', 'Push notifications are not supported on web.');
      return;
    }
    if (!pushEnabled) {
      // Turning ON
      const token = await registerForPush();
      if (token) {
        setExpoPushToken(token);
        setPushEnabled(true);
        await linkTokenToUser(token);
      }
    } else {
      // Turning OFF
      setExpoPushToken(null);
      setPushEnabled(false);
      await linkTokenToUser(null);
    }
  }, [uid, isWeb, pushEnabled, registerForPush, linkTokenToUser, router]);

  const onToggleFightAlerts = useCallback(
    async (v: boolean) => {
      setFightAlerts(v);
      await persist({ fightAlerts: v });
    },
    [persist]
  );

  const onToggleEventReminders = useCallback(
    async (v: boolean) => {
      setEventReminders(v);
      await persist({ eventReminders: v });
    },
    [persist]
  );

  const onToggleMarketing = useCallback(
    async (v: boolean) => {
      setMarketingPush(v);
      await persist({ marketingPush: v });
    },
    [persist]
  );

  const testPush = useCallback(async () => {
    if (isWeb) {
      Alert.alert('Not supported', 'Not available on web.');
      return;
    }
    const Notifications = await tryLoadNotifications();
    if (!Notifications) {
      Alert.alert(
        'Not available',
        'Test push requires the optional dependency "expo-notifications".'
      );
      return;
    }
    // Fire a local notification to verify UI is wired.
    try {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: 'Poundrr',
          body: 'This is a test notification 🔔',
          data: { type: 'test' },
        },
        trigger: { seconds: 1 },
      });
      Alert.alert('Scheduled', 'Test notification will appear in a second.');
    } catch (e) {
      console.warn('[notifications] test push error:', e);
      Alert.alert('Error', 'Could not schedule test notification.');
    }
  }, [isWeb]);

  // Signed-out / error states
  if (authErr) {
    return (
      <SafeAreaView style={styles.center}>
        <Text style={styles.muted}>Auth error: {authErr}</Text>
      </SafeAreaView>
    );
  }
  if (!uid) {
    return (
      <SafeAreaView style={styles.center}>
        <Text style={styles.muted}>You’re signed out. Please log in to manage notifications.</Text>
        <Pressable
          onPress={() => router.replace('/login')}
          style={({ pressed }) => [styles.btnPrimary, pressed && { opacity: 0.9 }]}
        >
          <Text style={styles.btnPrimaryText}>Go to Login</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.center}>
        <ActivityIndicator color="#fff" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: 24, gap: 14 }}>
        <Text style={styles.screenTitle}>Notifications</Text>

        <View style={styles.card}>
          <Row
            title="Push notifications"
            subtitle={isWeb ? 'Not supported on web' : expoPushToken ? `Enabled` : 'Turn on to receive alerts'}
            control={
              <Switch
                value={pushEnabled}
                onValueChange={onTogglePush}
                disabled={isWeb || saving}
                trackColor={{ true: RED, false: '#444' } as any}
                thumbColor="#fff"
              />
            }
          />
          <View style={styles.divider} />

          <Row
            title="Fight alerts"
            subtitle="Score updates, highlights, and results"
            disabled={!pushEnabled}
            control={
              <Switch
                value={fightAlerts}
                onValueChange={onToggleFightAlerts}
                disabled={!pushEnabled || saving}
                trackColor={{ true: RED, false: '#444' } as any}
                thumbColor="#fff"
              />
            }
          />

          <Row
            title="Event reminders"
            subtitle="Get a reminder before events you follow"
            disabled={!pushEnabled}
            control={
              <Switch
                value={eventReminders}
                onValueChange={onToggleEventReminders}
                disabled={!pushEnabled || saving}
                trackColor={{ true: RED, false: '#444' } as any}
                thumbColor="#fff"
              />
            }
          />

          <Row
            title="Marketing"
            subtitle="Occasional promos and features"
            disabled={!pushEnabled}
            control={
              <Switch
                value={marketingPush}
                onValueChange={onToggleMarketing}
                disabled={!pushEnabled || saving}
                trackColor={{ true: RED, false: '#444' } as any}
                thumbColor="#fff"
              />
            }
          />

          <View style={{ height: 6 }} />
          <Pressable
            onPress={testPush}
            disabled={!pushEnabled}
            style={({ pressed }) => [
              styles.btn,
              (pressed || !pushEnabled) && { opacity: 0.9 },
            ]}
          >
            <Text style={styles.btnText}>Send test notification</Text>
          </Pressable>

          {saving && (
            <View style={{ marginTop: 10 }}>
              <ActivityIndicator color="#fff" />
            </View>
          )}
        </View>

        <View style={styles.card}>
          <Text style={styles.lead}>
            Tip: You can fine-tune notification styles from your device’s system settings as well.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

/* ---------- small components ---------- */
function Row({
  title,
  subtitle,
  control,
  disabled,
}: {
  title: string;
  subtitle?: string;
  control: React.ReactElement;
  disabled?: boolean;
}): React.ReactElement {
  return (
    <View style={[styles.row, disabled && { opacity: 0.6 }]}>
      <View style={{ flex: 1 }}>
        <Text style={styles.rowTitle}>{title}</Text>
        {!!subtitle && <Text style={styles.rowSubtitle}>{subtitle}</Text>}
      </View>
      {control}
    </View>
  );
}

/* ---------- styles ---------- */
const styles = StyleSheet.create({
  center: {
    flex: 1,
    backgroundColor: 'black',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  screenTitle: {
    fontFamily: 'Inter_700Bold',
    color: '#fff',
    fontSize: 22,
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  lead: {
    fontFamily: 'Inter_400Regular',
    color: '#e5e7eb',
    fontSize: 13,
  },
  card: {
    backgroundColor: CARD_BG,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderTopWidth: 3,
    borderTopColor: RED,
  },
  row: {
    paddingVertical: 10,
    paddingHorizontal: 4,
    flexDirection: 'row',
    alignItems: 'center',
  },
  rowTitle: {
    fontFamily: 'Inter_700Bold',
    color: '#fff',
    fontSize: 16,
  },
  rowSubtitle: {
    marginTop: 3,
    fontFamily: 'Inter_400Regular',
    color: '#9ca3af',
    fontSize: 12,
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.12)',
    marginVertical: 10,
  },
  btn: {
    marginTop: 6,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderColor: BORDER,
    borderWidth: 1,
    alignItems: 'center',
  },
  btnText: {
    fontFamily: 'Inter_700Bold',
    color: '#e5e7eb',
    fontSize: 14,
  },
  muted: {
    fontFamily: 'Inter_400Regular',
    color: '#cbd5e1',
    fontSize: 13,
    textAlign: 'center',
  },
  btnPrimary: {
    backgroundColor: RED,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 10,
    alignItems: 'center',
  },
  btnPrimaryText: {
    fontFamily: 'Inter_700Bold',
    color: '#fff',
    fontSize: 16,
    letterSpacing: 0.6,
  },
});
