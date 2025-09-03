// File: app/(tabs)/profile/settings/privacy.tsx
// Rules followed:
// - No top-level imports from 'firebase/auth'.
// - Firestore at module scope is OK; Functions are called only inside handlers.
// - Uses useAuthUid(); no hooks at module scope.
// - Default export a React component; strict-friendly TS.

import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';

import { app, db } from '@/firebase';
import { useAuthUid } from '@/hooks/useAuthUid';

import {
  Timestamp,
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';

type Audience = 'everyone' | 'followers' | 'no_one';

type PrivacyDoc = {
  profileVisible?: boolean;        // if false, profile is private
  allowMessages?: Audience;
  allowMentions?: Audience;
  showActivityStatus?: boolean;    // "last active" signal
  personalizedAds?: boolean;
  searchableByEmail?: boolean;
  searchableByPhone?: boolean;
  createdAt?: Timestamp | any;
  updatedAt?: Timestamp | any;
};

const RED = '#f70000';
const CARD_BG = 'rgba(0,0,0,0.82)';
const BORDER = 'rgba(255,255,255,0.14)';

export default function PrivacySettingsScreen(): React.ReactElement {
  const router = useRouter();
  const { uid, error: authErr } = useAuthUid();

  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);

  // Local state mirrors PrivacyDoc
  const [profileVisible, setProfileVisible] = useState<boolean>(true);
  const [allowMessages, setAllowMessages] = useState<Audience>('everyone');
  const [allowMentions, setAllowMentions] = useState<Audience>('everyone');
  const [showActivityStatus, setShowActivityStatus] = useState<boolean>(true);
  const [personalizedAds, setPersonalizedAds] = useState<boolean>(true);
  const [searchableByEmail, setSearchableByEmail] = useState<boolean>(true);
  const [searchableByPhone, setSearchableByPhone] = useState<boolean>(false);

  const ref = useMemo(
    () => (uid ? doc(db, 'users', uid, 'private', 'privacy') : null),
    [uid]
  );

  // Load existing preferences (or seed defaults)
  useEffect(() => {
    (async () => {
      if (!uid || !ref) {
        setLoading(false);
        return;
      }
      try {
        const snap = await getDoc(ref);
        if (snap.exists()) {
          const d = (snap.data() as PrivacyDoc) ?? {};
          setProfileVisible(d.profileVisible ?? true);
          setAllowMessages((d.allowMessages as Audience) ?? 'everyone');
          setAllowMentions((d.allowMentions as Audience) ?? 'everyone');
          setShowActivityStatus(d.showActivityStatus ?? true);
          setPersonalizedAds(d.personalizedAds ?? true);
          setSearchableByEmail(d.searchableByEmail ?? true);
          setSearchableByPhone(d.searchableByPhone ?? false);
        } else {
          // Seed defaults
          await setDoc(
            ref,
            {
              profileVisible: true,
              allowMessages: 'everyone',
              allowMentions: 'everyone',
              showActivityStatus: true,
              personalizedAds: true,
              searchableByEmail: true,
              searchableByPhone: false,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            } as PrivacyDoc,
            { merge: true }
          );
        }
      } catch (e) {
        console.warn('[privacy] load error:', e);
      } finally {
        setLoading(false);
      }
    })();
  }, [uid, ref]);

  const persist = useCallback(
    async (patch: Partial<PrivacyDoc>): Promise<void> => {
      if (!ref) return;
      try {
        setSaving(true);
        await updateDoc(ref, { ...patch, updatedAt: serverTimestamp() });
      } catch (e) {
        try {
          await setDoc(ref, { ...patch, updatedAt: serverTimestamp() }, { merge: true });
        } catch (e2) {
          console.warn('[privacy] persist error:', e2);
          Alert.alert('Error', 'Could not save privacy settings.');
        }
      } finally {
        setSaving(false);
      }
    },
    [ref]
  );

  // Actions that involve backend (data export / deletion)
  const requestDataExport = useCallback(async () => {
    if (!uid) {
      Alert.alert('Sign in required', 'Please log in to request your data.');
      router.push('/login');
      return;
    }
    try {
      const { getFunctions, httpsCallable } = await import('firebase/functions');
      const functions = getFunctions(app);
      const createExport = httpsCallable(functions, 'createUserDataExport'); // implement in backend
      await createExport({});
      Alert.alert(
        'Export requested',
        'We’re preparing your data. You’ll receive a link via email when it’s ready.'
      );
    } catch (e) {
      console.warn('[privacy] export error:', e);
      Alert.alert('Error', 'Could not request data export.');
    }
  }, [uid, router]);

  const requestDeletion = useCallback(async () => {
    if (!uid) {
      Alert.alert('Sign in required', 'Please log in to request deletion.');
      router.push('/login');
      return;
    }
    Alert.alert(
      'Request account deletion',
      'This will start the account deletion process. You may need to verify by email.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Continue',
          style: 'destructive',
          onPress: async () => {
            try {
              const { getFunctions, httpsCallable } = await import('firebase/functions');
              const functions = getFunctions(app);
              const reqDelete = httpsCallable(functions, 'requestAccountDeletion'); // implement in backend
              await reqDelete({});
              Alert.alert('Requested', 'We’ve received your request. Check your email for the next steps.');
            } catch (e) {
              console.warn('[privacy] deletion request error:', e);
              Alert.alert('Error', 'Could not request account deletion.');
            }
          },
        },
      ]
    );
  }, [uid, router]);

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
        <Text style={styles.muted}>You’re signed out. Please log in to manage privacy.</Text>
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
        <Text style={styles.screenTitle}>Privacy</Text>

        {/* Profile visibility */}
        <View style={styles.card}>
          <Text style={styles.sectionHeader}>Profile visibility</Text>
          <View style={styles.divider} />
          <Row
            title="Public profile"
            subtitle="If off, only approved followers can view your profile."
            control={
              <Switch
                value={profileVisible}
                onValueChange={(v) => {
                  setProfileVisible(v);
                  void persist({ profileVisible: v });
                }}
                trackColor={{ true: RED, false: '#444' } as any}
                thumbColor="#fff"
              />
            }
          />
        </View>

        {/* Messaging */}
        <View style={styles.card}>
          <Text style={styles.sectionHeader}>Messages</Text>
          <View style={styles.divider} />
          <Text style={styles.lead}>Who can message you</Text>
          <Segment
            value={allowMessages}
            options={[
              { key: 'everyone', label: 'Everyone' },
              { key: 'followers', label: 'Followers' },
              { key: 'no_one', label: 'No one' },
            ]}
            onChange={(val) => {
              setAllowMessages(val);
              void persist({ allowMessages: val });
            }}
          />
        </View>

        {/* Mentions & tags */}
        <View style={styles.card}>
          <Text style={styles.sectionHeader}>Mentions & tags</Text>
          <View style={styles.divider} />
          <Text style={styles.lead}>Who can @mention you</Text>
          <Segment
            value={allowMentions}
            options={[
              { key: 'everyone', label: 'Everyone' },
              { key: 'followers', label: 'Followers' },
              { key: 'no_one', label: 'No one' },
            ]}
            onChange={(val) => {
              setAllowMentions(val);
              void persist({ allowMentions: val });
            }}
          />
        </View>

        {/* Discovery */}
        <View style={styles.card}>
          <Text style={styles.sectionHeader}>Discovery</Text>
          <View style={styles.divider} />
          <Row
            title="Searchable by email"
            subtitle="Allow others to find you using your email."
            control={
              <Switch
                value={searchableByEmail}
                onValueChange={(v) => {
                  setSearchableByEmail(v);
                  void persist({ searchableByEmail: v });
                }}
                trackColor={{ true: RED, false: '#444' } as any}
                thumbColor="#fff"
              />
            }
          />
          <Row
            title="Searchable by phone"
            subtitle="Allow others to find you using your phone number."
            control={
              <Switch
                value={searchableByPhone}
                onValueChange={(v) => {
                  setSearchableByPhone(v);
                  void persist({ searchableByPhone: v });
                }}
                trackColor={{ true: RED, false: '#444' } as any}
                thumbColor="#fff"
              />
            }
          />
        </View>

        {/* Activity status & ads */}
        <View style={styles.card}>
          <Text style={styles.sectionHeader}>Signals</Text>
          <View style={styles.divider} />
          <Row
            title="Show activity status"
            subtitle="Let followers see when you were last active."
            control={
              <Switch
                value={showActivityStatus}
                onValueChange={(v) => {
                  setShowActivityStatus(v);
                  void persist({ showActivityStatus: v });
                }}
                trackColor={{ true: RED, false: '#444' } as any}
                thumbColor="#fff"
              />
            }
          />
          <Row
            title="Personalized ads"
            subtitle="Use your activity to personalize ads."
            control={
              <Switch
                value={personalizedAds}
                onValueChange={(v) => {
                  setPersonalizedAds(v);
                  void persist({ personalizedAds: v });
                }}
                trackColor={{ true: RED, false: '#444' } as any}
                thumbColor="#fff"
              />
            }
          />
          {saving && (
            <View style={{ marginTop: 8 }}>
              <ActivityIndicator color="#fff" />
            </View>
          )}
        </View>

        {/* Data controls */}
        <View style={styles.card}>
          <Text style={styles.sectionHeader}>Your data</Text>
          <View style={styles.divider} />
          <Text style={styles.lead}>Download a copy of your data or request deletion.</Text>
          <View style={{ height: 8 }} />
          <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap' }}>
            <Pressable onPress={requestDataExport} style={({ pressed }) => [styles.btn, pressed && { opacity: 0.95 }]}>
              <Text style={styles.btnText}>Request data export</Text>
            </Pressable>
            <Pressable
              onPress={requestDeletion}
              style={({ pressed }) => [styles.btnDanger, pressed && { opacity: 0.9 }]}
            >
              <Text style={styles.btnDangerText}>Request account deletion</Text>
            </Pressable>
          </View>
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
}: {
  title: string;
  subtitle?: string;
  control: React.ReactElement;
}): React.ReactElement {
  return (
    <View style={styles.row}>
      <View style={{ flex: 1 }}>
        <Text style={styles.rowTitle}>{title}</Text>
        {!!subtitle && <Text style={styles.rowSubtitle}>{subtitle}</Text>}
      </View>
      {control}
    </View>
  );
}

function Segment<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { key: T; label: string }[];
  onChange: (val: T) => void;
}): React.ReactElement {
  return (
    <View style={styles.segmentWrap}>
      {options.map((opt) => {
        const active = opt.key === value;
        return (
          <Pressable
            key={opt.key}
            onPress={() => onChange(opt.key)}
            style={({ pressed }) => [
              styles.segment,
              active && styles.segmentActive,
              pressed && { opacity: 0.95 },
            ]}
          >
            <Text style={[styles.segmentText, active && styles.segmentTextActive]}>{opt.label}</Text>
          </Pressable>
        );
      })}
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
  sectionHeader: {
    fontFamily: 'Inter_700Bold',
    color: '#fff',
    fontSize: 16,
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
  divider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.12)',
    marginVertical: 10,
  },
  row: {
    paddingVertical: 10,
    paddingHorizontal: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
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
  segmentWrap: {
    marginTop: 10,
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  segment: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  segmentActive: {
    borderColor: '#fff',
    backgroundColor: 'rgba(247,0,0,0.16)',
  },
  segmentText: {
    fontFamily: 'Inter_700Bold',
    color: '#e5e7eb',
    fontSize: 12,
  },
  segmentTextActive: {
    color: '#fff',
  },
  btn: {
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
  btnDanger: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.9)',
    backgroundColor: 'rgba(239,68,68,0.16)',
    alignItems: 'center',
  },
  btnDangerText: {
    fontFamily: 'Inter_700Bold',
    color: '#fff',
    fontSize: 14,
  },
  muted: {
    fontFamily: 'Inter_400Regular',
    color: '#cbd5e1',
    fontSize: 13,
    textAlign: 'center',
  },
});
