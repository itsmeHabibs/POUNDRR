// File: app/(tabs)/profile/settings/integrations.tsx
// Rules followed:
// - No top-level imports from 'firebase/auth' (not needed here).
// - Firestore is safe at module scope; Functions are imported dynamically inside handlers.
// - Uses useAuthUid() for the current user; no hooks at module scope.
// - Strict-friendly TS; default export component.

import { useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { app, db } from '@/firebase';
import { useAuthUid } from '@/hooks/useAuthUid';

import {
  Timestamp,
  doc,
  onSnapshot,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore';

type ProviderKey = 'instagram' | 'tiktok' | 'youtube' | 'stripe' | 'x';

type ProviderStatus = {
  connected?: boolean;
  username?: string | null;
  accountId?: string | null;
  info?: string | null;          // e.g., "Charges enabled", "Channel XYZ"
  url?: string | null;           // Manage URL if backend provides one
  updatedAt?: Timestamp | any;   // serverTimestamp on updates
};

type IntegrationsDoc = Partial<Record<ProviderKey, ProviderStatus>> & {
  updatedAt?: Timestamp | any;
};

const RED = '#f70000';
const CARD_BG = 'rgba(0,0,0,0.82)';
const BORDER = 'rgba(255,255,255,0.14)';

const PROVIDERS: { key: ProviderKey; title: string; hint?: string }[] = [
  { key: 'stripe', title: 'Stripe Connect', hint: 'Required for payouts' },
  { key: 'instagram', title: 'Instagram' },
  { key: 'tiktok', title: 'TikTok' },
  { key: 'youtube', title: 'YouTube' },
  { key: 'x', title: 'X (Twitter)' },
];

export default function IntegrationsScreen(): React.ReactElement {
  const router = useRouter();
  const { uid, error: authErr } = useAuthUid();

  const [loading, setLoading] = useState<boolean>(true);
  const [integrations, setIntegrations] = useState<IntegrationsDoc>({});
  const [busy, setBusy] = useState<Partial<Record<ProviderKey, boolean>>>({});

  // Reference for the user's integrations doc
  const ref = useMemo(() => (uid ? doc(db, 'users', uid, 'private', 'integrations') : null), [uid]);

  // Live subscribe to the integrations doc
  useEffect(() => {
    if (!ref) {
      setIntegrations({});
      setLoading(false);
      return;
    }
    const unsub = onSnapshot(
      ref,
      (snap) => {
        if (snap.exists()) setIntegrations((snap.data() as IntegrationsDoc) ?? {});
        else setIntegrations({});
        setLoading(false);
      },
      (err) => {
        console.warn('[integrations] onSnapshot error:', err);
        setLoading(false);
      }
    );
    return () => unsub();
  }, [ref]);

  const ensureDoc = useCallback(async () => {
    if (!ref) return;
    try {
      // Create the doc if not present so the UI can flip instantly
      await setDoc(ref, { updatedAt: serverTimestamp() }, { merge: true });
    } catch (e) {
      console.warn('[integrations] ensureDoc error:', e);
    }
  }, [ref]);

  const handleConnect = useCallback(
    async (provider: ProviderKey) => {
      if (!uid) {
        Alert.alert('Sign in required', 'Please log in to connect integrations.');
        router.push('/login');
        return;
      }
      if (!ref) return;

      try {
        setBusy((b) => ({ ...b, [provider]: true }));
        await ensureDoc();

        // Ask backend to create an OAuth/Connect link for this provider
        const { getFunctions, httpsCallable } = await import('firebase/functions');
        const functions = getFunctions(app);
        const createIntegrationLink = httpsCallable(functions, 'createIntegrationLink'); // implement this in your backend
        const resp = await createIntegrationLink({ provider });
        const url = (resp?.data as any)?.url as string | undefined;

        if (!url) {
          Alert.alert('Not available', 'Integration link is not configured.');
          return;
        }

        await WebBrowser.openBrowserAsync(url);
        // After returning from the browser, the backend should have updated the doc via webhook/callback.
        // We rely on onSnapshot above to reflect the new state.
      } catch (e) {
        console.warn('[integrations] connect error:', e);
        Alert.alert('Error', 'Could not start connection flow.');
      } finally {
        setBusy((b) => ({ ...b, [provider]: false }));
      }
    },
    [uid, ref, router, ensureDoc]
  );

  const handleDisconnect = useCallback(
    async (provider: ProviderKey) => {
      if (!uid) {
        Alert.alert('Sign in required', 'Please log in to manage integrations.');
        router.push('/login');
        return;
      }
      if (!ref) return;

      Alert.alert(
        'Disconnect',
        `Disconnect ${providerLabel(provider)} from your account?`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Disconnect',
            style: 'destructive',
            onPress: async () => {
              try {
                setBusy((b) => ({ ...b, [provider]: true }));
                const { getFunctions, httpsCallable } = await import('firebase/functions');
                const functions = getFunctions(app);
                const disconnectIntegration = httpsCallable(functions, 'disconnectIntegration'); // implement in backend
                await disconnectIntegration({ provider });
                // Backend should reflect the change in Firestore; the listener will update UI.
              } catch (e) {
                console.warn('[integrations] disconnect error:', e);
                Alert.alert('Error', 'Could not disconnect. Try again later.');
              } finally {
                setBusy((b) => ({ ...b, [provider]: false }));
              }
            },
          },
        ]
      );
    },
    [uid, ref, router]
  );

  const handleManage = useCallback(async (provider: ProviderKey) => {
    const url =
      integrations?.[provider]?.url ??
      (provider === 'stripe' ? 'https://dashboard.stripe.com' : undefined);
    if (!url) {
      Alert.alert('Not available', 'No management link is available yet.');
      return;
    }
    try {
      await WebBrowser.openBrowserAsync(url);
    } catch (e) {
      console.warn('[integrations] manage open error:', e);
    }
  }, [integrations]);

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
        <Text style={styles.muted}>You’re signed out. Please log in to manage integrations.</Text>
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
        <Text style={styles.screenTitle}>Integrations</Text>

        <View style={styles.card}>
          <Text style={styles.lead}>
            Connect your accounts to unlock sharing, analytics, and payouts.
          </Text>
        </View>

        {PROVIDERS.map((p) => {
          const status = integrations?.[p.key];
          const connected = Boolean(status?.connected);
          const busyNow = Boolean(busy[p.key]);
          const sub = makeSubtitle(p.key, status);
          return (
            <View key={p.key} style={styles.card}>
              <View style={styles.rowTop}>
                <Text style={styles.rowTitle}>{p.title}</Text>
                <StatusBadge connected={connected} />
              </View>

              {!!(sub || p.hint) && (
                <Text style={styles.rowSubtitle}>
                  {[sub, p.hint].filter(Boolean).join(' • ')}
                </Text>
              )}

              <View style={styles.actionsRow}>
                {connected ? (
                  <>
                    <Pressable
                      onPress={() => handleManage(p.key)}
                      style={({ pressed }) => [styles.btn, pressed && { opacity: 0.95 }]}
                    >
                      <Text style={styles.btnText}>Manage</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => handleDisconnect(p.key)}
                      disabled={busyNow}
                      style={({ pressed }) => [styles.btnDanger, (pressed || busyNow) && { opacity: 0.9 }]}
                    >
                      <Text style={styles.btnDangerText}>{busyNow ? 'Disconnecting…' : 'Disconnect'}</Text>
                    </Pressable>
                  </>
                ) : (
                  <Pressable
                    onPress={() => handleConnect(p.key)}
                    disabled={busyNow}
                    style={({ pressed }) => [styles.btnPrimary, (pressed || busyNow) && { opacity: 0.9 }]}
                  >
                    <Text style={styles.btnPrimaryText}>{busyNow ? 'Opening…' : 'Connect'}</Text>
                  </Pressable>
                )}
              </View>
            </View>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}

/* ---------- helpers ---------- */
function providerLabel(p: ProviderKey): string {
  switch (p) {
    case 'x':
      return 'X (Twitter)';
    case 'stripe':
      return 'Stripe Connect';
    default:
      return p[0].toUpperCase() + p.slice(1);
  }
}

function makeSubtitle(p: ProviderKey, s?: ProviderStatus): string | undefined {
  if (!s) return undefined;
  const bits: string[] = [];
  if (s.username) bits.push(`@${s.username}`);
  if (s.accountId && p === 'stripe') bits.push(s.accountId);
  if (s.info) bits.push(s.info);
  return bits.length ? bits.join(' • ') : undefined;
}

function StatusBadge({ connected }: { connected: boolean }): React.ReactElement {
  const color = connected ? 'rgba(34,197,94,0.9)' : 'rgba(148,163,184,0.9)';
  const bg = connected ? 'rgba(34,197,94,0.16)' : 'rgba(148,163,184,0.16)';
  const label = connected ? 'Connected' : 'Not connected';
  return (
    <View style={[styles.badge, { borderColor: color, backgroundColor: bg }]}>
      <Text style={styles.badgeText}>{label}</Text>
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
  muted: {
    fontFamily: 'Inter_400Regular',
    color: '#cbd5e1',
    fontSize: 13,
    textAlign: 'center',
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
  rowTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  rowTitle: {
    fontFamily: 'Inter_700Bold',
    color: '#fff',
    fontSize: 16,
  },
  rowSubtitle: {
    marginTop: 6,
    fontFamily: 'Inter_400Regular',
    color: '#9ca3af',
    fontSize: 12,
  },
  actionsRow: {
    marginTop: 12,
    gap: 10,
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
  },
  badgeText: {
    fontFamily: 'Inter_700Bold',
    color: '#fff',
    fontSize: 12,
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
});
