// File: app/(modals)/wallet-topup.tsx
// Rules: no top-level firebase/auth; Firestore/Storage OK at module scope; default export; strict-friendly TS.

import { useLocalSearchParams, useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { app, db } from '@/firebase';
import { useAuthUid } from '@/hooks/useAuthUid';

import {
  addDoc,
  collection,
  doc,
  onSnapshot,
  serverTimestamp,
  Timestamp,
  updateDoc,
} from 'firebase/firestore';

type Params = {
  amount?: string | string[];     // e.g. "9.99" (AUD)
  returnTo?: string | string[];   // route to go to after success/close
};

type TopupStatus = 'pending' | 'processing' | 'succeeded' | 'failed' | 'cancelled';

type WalletTopupDoc = {
  ownerUid: string;
  amountCents: number;
  currency: 'AUD';
  status: TopupStatus;
  provider?: 'stripe' | 'checkout' | 'pay' | string;
  checkoutUrl?: string | null;
  createdAt: Timestamp | any; // serverTimestamp FieldValue on create
  updatedAt: Timestamp | any; // serverTimestamp FieldValue on updates
  errorCode?: string | null;
  errorMessage?: string | null;
};

const RED = '#f70000';
const CARD_BG = 'rgba(0,0,0,0.82)';
const BORDER = 'rgba(255,255,255,0.14)';

function toSingle(v?: string | string[] | null): string | undefined {
  if (v == null) return undefined;
  return Array.isArray(v) ? v[0] : v;
}

function dollarsToCents(input: string): number | null {
  const clean = input.replace(/[^\d.]/g, '');
  if (!clean) return null;
  const n = Number(clean);
  if (!isFinite(n)) return null;
  return Math.round(n * 100);
}

export default function WalletTopupModal(): React.ReactElement {
  const router = useRouter();
  const params = useLocalSearchParams<Params>();
  const { uid } = useAuthUid();

  const returnTo = useMemo(() => toSingle(params.returnTo), [params.returnTo]);

  // amount
  const [amountStr, setAmountStr] = useState<string>(() => toSingle(params.amount) ?? '');
  const amountCents = useMemo<number | null>(() => dollarsToCents(amountStr), [amountStr]);

  const [creating, setCreating] = useState<boolean>(false);
  const [opening, setOpening] = useState<boolean>(false);
  const [topupId, setTopupId] = useState<string | null>(null);
  const [status, setStatus] = useState<TopupStatus | null>(null);
  const [checkoutUrl, setCheckoutUrl] = useState<string | null>(null);
  const openedOnce = useRef<boolean>(false);

  const canSubmit = !!uid && !!amountCents && amountCents >= 100 && !creating && !opening;

  // Subscribe to the topup doc to react to backend updates
  useEffect(() => {
    if (!topupId) return;
    const ref = doc(db, 'walletTopups', topupId);
    const unsub = onSnapshot(
      ref,
      (snap) => {
        if (!snap.exists()) return;
        const d = snap.data() as Partial<WalletTopupDoc>;
        if (typeof d.status === 'string') setStatus(d.status as TopupStatus);
        if (typeof d.checkoutUrl === 'string') setCheckoutUrl(d.checkoutUrl);
      },
      (err) => console.warn('[wallet-topup] onSnapshot error:', err)
    );
    return () => unsub();
  }, [topupId]);

  // If we receive checkoutUrl from backend and haven't opened it yet, open the browser
  useEffect(() => {
    (async () => {
      if (!checkoutUrl) return;
      if (openedOnce.current) return;
      openedOnce.current = true;
      try {
        setOpening(true);
        await WebBrowser.openBrowserAsync(checkoutUrl);
        // After returning from browser, we rely on the webhook/backend to update status.
        // Users can tap "I've paid" to refresh, but onSnapshot will usually update soon.
      } catch (e) {
        console.warn('[wallet-topup] web open error:', e);
      } finally {
        setOpening(false);
      }
    })();
  }, [checkoutUrl]);

  // When status becomes succeeded, show success modal
  useEffect(() => {
    if (status === 'succeeded' && topupId && amountCents != null) {
      router.replace({
        pathname: '/(modals)/order-success',
        params: {
          orderId: topupId,
          title: 'Wallet top-up',
          amount: `A$${(amountCents / 100).toFixed(2)}`,
          eta: 'Available immediately',
          note: 'Your wallet balance has been updated.',
          returnTo: returnTo ?? '/(tabs)',
          viewPath: returnTo ?? '/(tabs)',
        },
      });
    }
  }, [status, topupId, amountCents, router, returnTo]);

  const handleClose = useCallback(() => {
    if (returnTo) router.replace(returnTo);
    else router.back();
  }, [returnTo, router]);

  const startTopup = useCallback(async () => {
    if (!uid) {
      Alert.alert('Sign in required', 'Please log in to top up your wallet.');
      return;
    }
    if (amountCents == null || amountCents < 100) {
      Alert.alert('Enter amount', 'Minimum top-up is A$1.00.');
      return;
    }

    try {
      setCreating(true);

      // 1) Create the intent doc
      const ref = await addDoc(collection(db, 'walletTopups'), {
        ownerUid: uid,
        amountCents,
        currency: 'AUD',
        status: 'pending',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      } as WalletTopupDoc);
      setTopupId(ref.id);

      // 2) Try to call a backend function to create a checkout session (optional)
      try {
        const { getFunctions, httpsCallable } = await import('firebase/functions');
        const functions = getFunctions(app);
        const createTopup = httpsCallable(functions, 'createWalletTopup'); // implement this in your backend
        const resp = await createTopup({ topupId: ref.id });
        const url = (resp?.data as any)?.checkoutUrl as string | undefined;
        if (url) {
          // Optimistically set into doc (backend may also write it)
          setCheckoutUrl(url);
          await updateDoc(ref, { checkoutUrl: url, updatedAt: serverTimestamp() });
        }
      } catch (e) {
        // If functions aren’t set up yet, this is fine — your backend can populate checkoutUrl later.
        console.warn('[wallet-topup] optional function call failed or not configured:', e);
      }
    } catch (e: unknown) {
      console.warn('[wallet-topup] create error:', e);
      const msg = (e as { message?: string })?.message ?? 'Could not start top-up.';
      Alert.alert('Error', msg);
    } finally {
      setCreating(false);
    }
  }, [uid, amountCents]);

  const presets = [5, 10, 25, 50];

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.select({ ios: 'padding', android: undefined })}
    >
      <SafeAreaView style={styles.root}>
        <View style={styles.card}>
          <Text style={styles.heading}>Top up wallet</Text>
          <Text style={styles.body}>Choose an amount in A$ (AUD).</Text>

          {/* Presets */}
          <View style={styles.pillsWrap}>
            {presets.map((p) => {
              const sel = amountStr && Number(amountStr) === p;
              return (
                <Pressable
                  key={p}
                  onPress={() => setAmountStr(String(p))}
                  style={({ pressed }) => [
                    styles.pill,
                    sel && styles.pillSelected,
                    pressed && { opacity: 0.9 },
                  ]}
                >
                  <Text style={[styles.pillText, sel && styles.pillTextSelected]}>A${p}</Text>
                </Pressable>
              );
            })}
          </View>

          {/* Custom amount */}
          <Text style={[styles.label, { marginTop: 16 }]}>Custom amount</Text>
          <View style={styles.amountRow}>
            <View style={styles.currencyBadge}>
              <Text style={styles.currencyText}>A$</Text>
            </View>
            <TextInput
              style={styles.amountInput}
              placeholder="0.00"
              placeholderTextColor="#9ca3af"
              keyboardType="decimal-pad"
              value={amountStr}
              onChangeText={setAmountStr}
            />
          </View>
          <Text style={styles.helper}>Minimum A$1.00</Text>

          {/* Actions */}
          <View style={styles.actions}>
            <Pressable
              onPress={startTopup}
              disabled={!canSubmit}
              style={({ pressed }) => [
                styles.btnPrimary,
                (pressed || !canSubmit) && { opacity: 0.9 },
              ]}
            >
              {creating ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.btnPrimaryText}>Continue to Pay</Text>
              )}
            </Pressable>

            <Pressable
              onPress={handleClose}
              style={({ pressed }) => [styles.btnGhost, pressed && { opacity: 0.85 }]}
            >
              <Text style={styles.btnGhostText}>Cancel</Text>
            </Pressable>
          </View>

          {/* If intent exists, show status + actions */}
          {topupId && (
            <View style={styles.intentBox}>
              <Text style={styles.intentTitle}>Top-up in progress</Text>
              <Row label="Reference" value={topupId} />
              <Row
                label="Amount"
                value={
                  amountCents != null
                    ? `A$${(amountCents / 100).toFixed(2)}`
                    : '-'
                }
              />
              <Row label="Status" value={status ?? 'pending'} />
              {!!checkoutUrl && (
                <Pressable
                  onPress={() => checkoutUrl && WebBrowser.openBrowserAsync(checkoutUrl)}
                  style={({ pressed }) => [
                    styles.btnLink,
                    pressed && { opacity: 0.8 },
                  ]}
                >
                  <Text style={styles.btnLinkText}>Open payment link</Text>
                </Pressable>
              )}
              <Text style={[styles.helper, { marginTop: 8 }]}>
                After you complete payment, this will update automatically.
              </Text>
            </View>
          )}
        </View>
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}

function Row({ label, value }: { label: string; value: string }): React.ReactElement {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue} numberOfLines={2}>
        {value}
      </Text>
    </View>
  );
}

/* ---------- styles ---------- */
const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.9)', // modal backdrop
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  card: {
    width: '100%',
    maxWidth: 460,
    backgroundColor: CARD_BG,
    borderRadius: 16,
    paddingHorizontal: 18,
    paddingVertical: 18,
    borderTopWidth: 4,
    borderTopColor: RED,
  },
  heading: {
    fontFamily: 'Inter_700Bold',
    color: '#fff',
    fontSize: 20,
    letterSpacing: 0.6,
  },
  body: {
    marginTop: 4,
    fontFamily: 'Inter_400Regular',
    color: '#e5e7eb',
    fontSize: 14,
  },
  label: {
    fontFamily: 'Inter_700Bold',
    color: '#cbd5e1',
    fontSize: 12,
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  pillsWrap: {
    marginTop: 12,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  pill: {
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  pillSelected: {
    borderColor: '#fff',
    backgroundColor: 'rgba(247,0,0,0.16)',
  },
  pillText: {
    fontFamily: 'Inter_700Bold',
    color: '#e5e7eb',
    fontSize: 12,
  },
  pillTextSelected: {
    color: '#fff',
  },
  amountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  currencyBadge: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  currencyText: {
    fontFamily: 'Inter_700Bold',
    color: '#e5e7eb',
    fontSize: 12,
    letterSpacing: 0.4,
  },
  amountInput: {
    flex: 1,
    backgroundColor: '#161616',
    borderColor: '#333',
    borderWidth: 1.5,
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    color: '#eee',
    fontFamily: 'Inter_700Bold',
    fontSize: 16,
  },
  helper: {
    marginTop: 6,
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    color: '#9ca3af',
  },
  actions: {
    marginTop: 14,
    gap: 10,
  },
  btnPrimary: {
    width: '100%',
    backgroundColor: RED,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  btnPrimaryText: {
    fontFamily: 'Inter_700Bold',
    color: '#fff',
    fontSize: 16,
    letterSpacing: 0.8,
  },
  btnGhost: {
    width: '100%',
    paddingVertical: 12,
    borderRadius: 10,
    borderColor: '#444',
    borderWidth: 1,
    alignItems: 'center',
  },
  btnGhostText: {
    fontFamily: 'Inter_700Bold',
    color: '#fff',
    fontSize: 14,
  },
  row: {
    width: '100%',
    flexDirection: 'row',
    gap: 10,
    alignItems: 'flex-start',
  },
  rowLabel: {
    width: 88,
    fontFamily: 'Inter_700Bold',
    color: '#cbd5e1',
    fontSize: 12,
  },
  rowValue: {
    flex: 1,
    fontFamily: 'Inter_400Regular',
    color: '#fff',
    fontSize: 13,
  },
  intentBox: {
    marginTop: 14,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.12)',
    paddingTop: 12,
    gap: 6,
  },
  intentTitle: {
    fontFamily: 'Inter_700Bold',
    color: '#fff',
    fontSize: 14,
  },
  btnLink: {
    alignSelf: 'flex-start',
    paddingVertical: 8,
    paddingHorizontal: 8,
  },
  btnLinkText: {
    fontFamily: 'Inter_700Bold',
    color: '#cbd5e1',
    fontSize: 13,
    textDecorationLine: 'underline',
  },
});
