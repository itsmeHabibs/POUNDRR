// File: app/(tabs)/profile/settings/payments.tsx
// Rules followed:
// - No top-level imports from 'firebase/auth'.
// - Firestore at module scope is OK; Functions are used only inside handlers.
// - Uses useAuthUid(); no hooks at module scope.
// - Default export a React component; strict-friendly TS; list perf flags in FlatList.

import { useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { app, db } from '@/firebase';
import { useAuthUid } from '@/hooks/useAuthUid';

import {
  QueryDocumentSnapshot,
  Timestamp,
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  startAfter,
  where,
} from 'firebase/firestore';

type WalletDoc = {
  balanceCents?: number;
  currency?: string; // e.g., "AUD"
  updatedAt?: Timestamp | any;
};

type OrderStatus = 'paid' | 'refunded' | 'failed' | 'pending' | 'cancelled';
type OrderDoc = {
  buyerUid?: string;
  orderId?: string;
  type?: 'ticket' | 'topup' | 'subscription' | 'merch' | 'other';
  eventTitle?: string | null;
  itemsCount?: number | null;
  posterUrl?: string | null; // not displayed here but you can add later
  totalCents?: number | null;
  currency?: string | null;
  status?: OrderStatus;
  createdAt?: Timestamp | null;
};

type OrderRow = OrderDoc & { id: string };

const RED = '#f70000';
const CARD_BG = 'rgba(0,0,0,0.82)';
const BORDER = 'rgba(255,255,255,0.14)';
const PAGE_SIZE = 20;

/* ---------- helpers ---------- */
function fmtMoney(cents?: number | null, currency: string = 'AUD'): string {
  if (typeof cents !== 'number') return '-';
  const v = (cents / 100).toFixed(2);
  const prefix = currency === 'AUD' ? 'A$' : `${currency} `;
  return `${prefix}${v}`;
}

function fmtDate(ts?: Timestamp | null): string {
  if (!ts) return '';
  try {
    const d = ts.toDate();
    return `${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  } catch {
    return '';
  }
}

/* ---------- screen ---------- */
export default function PaymentsSettingsScreen(): React.ReactElement {
  const router = useRouter();
  const { uid, error: authErr } = useAuthUid();

  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);

  // Wallet
  const [wallet, setWallet] = useState<WalletDoc | null>(null);

  // Orders/history
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [cursor, setCursor] = useState<QueryDocumentSnapshot | null>(null);
  const [hasMore, setHasMore] = useState<boolean>(true);
  const [loadingMore, setLoadingMore] = useState<boolean>(false);

  const walletRef = useMemo(() => (uid ? doc(db, 'users', uid, 'private', 'wallet') : null), [uid]);

  const baseOrdersQuery = useMemo(() => {
    if (!uid) return null;
    return query(
      collection(db, 'orders'),
      where('buyerUid', '==', uid),
      orderBy('createdAt', 'desc'),
      limit(PAGE_SIZE)
    );
  }, [uid]);

  const loadWallet = useCallback(async (): Promise<void> => {
    if (!walletRef) {
      setWallet(null);
      return;
    }
    try {
      const snap = await getDoc(walletRef);
      setWallet(snap.exists() ? ((snap.data() as WalletDoc) ?? null) : null);
    } catch (e) {
      console.warn('[payments] loadWallet error:', e);
      setWallet(null);
    }
  }, [walletRef]);

  const loadOrdersInitial = useCallback(async (): Promise<void> => {
    if (!baseOrdersQuery) {
      setOrders([]);
      setCursor(null);
      setHasMore(false);
      return;
    }
    try {
      const snap = await getDocs(baseOrdersQuery);
      const rows: OrderRow[] = snap.docs.map((d) => ({ id: d.id, ...(d.data() as OrderDoc) }));
      setOrders(rows);
      const last = snap.docs[snap.docs.length - 1] ?? null;
      setCursor(last);
      setHasMore(Boolean(last) && snap.docs.length === PAGE_SIZE);
    } catch (e) {
      console.warn('[payments] loadOrders initial error:', e);
      setOrders([]);
      setCursor(null);
      setHasMore(false);
    }
  }, [baseOrdersQuery]);

  const loadOrdersMore = useCallback(async (): Promise<void> => {
    if (!uid || !cursor || !hasMore || loadingMore) return;
    setLoadingMore(true);
    try {
      const qMore = query(
        collection(db, 'orders'),
        where('buyerUid', '==', uid),
        orderBy('createdAt', 'desc'),
        startAfter(cursor),
        limit(PAGE_SIZE)
      );
      const snap = await getDocs(qMore);
      const more: OrderRow[] = snap.docs.map((d) => ({ id: d.id, ...(d.data() as OrderDoc) }));
      setOrders((prev) => [...prev, ...more]);
      const last = snap.docs[snap.docs.length - 1] ?? null;
      setCursor(last);
      setHasMore(Boolean(last) && snap.docs.length === PAGE_SIZE);
    } catch (e) {
      console.warn('[payments] loadOrders more error:', e);
      setHasMore(false);
    } finally {
      setLoadingMore(false);
    }
  }, [uid, cursor, hasMore, loadingMore]);

  const loadAll = useCallback(async (): Promise<void> => {
    setLoading(true);
    await Promise.all([loadWallet(), loadOrdersInitial()]);
    setLoading(false);
  }, [loadWallet, loadOrdersInitial]);

  useEffect(() => {
    if (uid === null) return; // wait for auth to resolve
    void loadAll();
  }, [uid, loadAll]);

  const onRefresh = useCallback(async (): Promise<void> => {
    setRefreshing(true);
    try {
      await loadAll();
    } finally {
      setRefreshing(false);
    }
  }, [loadAll]);

  const openWalletTopup = useCallback(() => {
    router.push({
      pathname: '/(modals)/wallet-topup',
      params: { returnTo: '/profile/settings/payments' },
    });
  }, [router]);

  const openBillingPortal = useCallback(async () => {
    try {
      // Open a Stripe Customer Portal (backend must implement this).
      const { getFunctions, httpsCallable } = await import('firebase/functions');
      const functions = getFunctions(app);
      const createBillingPortal = httpsCallable(functions, 'createBillingPortal'); // implement in your backend
      const resp = await createBillingPortal({});
      const url = (resp?.data as any)?.url as string | undefined;
      if (!url) {
        console.warn('[payments] no portal url');
        return;
      }
      await WebBrowser.openBrowserAsync(url);
    } catch (e) {
      console.warn('[payments] billing portal error:', e);
    }
  }, []);

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
        <Text style={styles.muted}>You’re signed out. Please log in to manage payments.</Text>
        <Pressable
          onPress={() => router.replace('/login')}
          style={({ pressed }) => [styles.btnPrimary, pressed && { opacity: 0.9 }]}
        >
          <Text style={styles.btnPrimaryText}>Go to Login</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  if (loading && !refreshing) {
    return (
      <SafeAreaView style={styles.center}>
        <ActivityIndicator color="#fff" />
      </SafeAreaView>
    );
  }

  const balanceLabel = fmtMoney(wallet?.balanceCents ?? 0, wallet?.currency ?? 'AUD');
  const updatedAtLabel = wallet?.updatedAt ? fmtDate(wallet.updatedAt as Timestamp) : undefined;

  return (
    <SafeAreaView style={{ flex: 1 }}>
      <ScrollView
        contentContainerStyle={{ padding: 14, paddingBottom: 24, gap: 14 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#fff" />}
      >
        <Text style={styles.screenTitle}>Payments</Text>

        {/* Wallet */}
        <View style={styles.card}>
          <Text style={styles.sectionHeader}>Wallet</Text>
          <View style={styles.divider} />

          <View style={styles.walletRow}>
            <Text style={styles.walletBalance}>{balanceLabel}</Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Pressable onPress={onRefresh} style={({ pressed }) => [styles.btn, pressed && { opacity: 0.95 }]}>
                <Text style={styles.btnText}>Refresh</Text>
              </Pressable>
              <Pressable onPress={openWalletTopup} style={({ pressed }) => [styles.btnPrimary, pressed && { opacity: 0.95 }]}>
                <Text style={styles.btnPrimaryText}>Top up</Text>
              </Pressable>
            </View>
          </View>

          {!!updatedAtLabel && <Text style={styles.metaMuted}>Updated {updatedAtLabel}</Text>}
        </View>

        {/* Payment methods (Stripe Customer Portal) */}
        <View style={styles.card}>
          <Text style={styles.sectionHeader}>Payment methods</Text>
          <View style={styles.divider} />

          <Text style={styles.lead}>Manage your saved cards and billing details in the secure portal.</Text>
          <View style={{ height: 8 }} />
          <Pressable onPress={openBillingPortal} style={({ pressed }) => [styles.btn, pressed && { opacity: 0.95 }]}>
            <Text style={styles.btnText}>Open billing portal</Text>
          </Pressable>
        </View>

        {/* Purchase history */}
        <View style={styles.card}>
          <Text style={styles.sectionHeader}>Purchase history</Text>
          <View style={styles.divider} />

          {orders.length === 0 ? (
            <Text style={styles.muted}>No purchases yet.</Text>
          ) : (
            <FlatList
              data={orders}
              keyExtractor={(it) => it.id}
              renderItem={({ item }) => <OrderRowItem row={item} />}
              scrollEnabled={false}
              contentContainerStyle={{ gap: 10 }}
              removeClippedSubviews
              windowSize={5}
              maxToRenderPerBatch={10}
              initialNumToRender={10}
              ListFooterComponent={
                hasMore ? (
                  <View style={{ marginTop: 6 }}>
                    <Pressable
                      onPress={() => void loadOrdersMore()}
                      disabled={loadingMore}
                      style={({ pressed }) => [styles.btn, (pressed || loadingMore) && { opacity: 0.9 }]}
                    >
                      {loadingMore ? (
                        <ActivityIndicator color="#fff" />
                      ) : (
                        <Text style={styles.btnText}>Load more</Text>
                      )}
                    </Pressable>
                  </View>
                ) : null
              }
            />
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

/* ---------- small components ---------- */
function StatusBadge({ status }: { status?: OrderStatus }): React.ReactElement {
  const label = status ?? 'pending';
  const map: Record<OrderStatus, { bg: string; border: string }> = {
    paid: { bg: 'rgba(34,197,94,0.16)', border: 'rgba(34,197,94,0.9)' },
    refunded: { bg: 'rgba(59,130,246,0.16)', border: 'rgba(59,130,246,0.9)' },
    failed: { bg: 'rgba(239,68,68,0.16)', border: 'rgba(239,68,68,0.9)' },
    pending: { bg: 'rgba(250,204,21,0.16)', border: 'rgba(250,204,21,0.9)' },
    cancelled: { bg: 'rgba(148,163,184,0.16)', border: 'rgba(148,163,184,0.9)' },
  };
  const c = map[label] ?? map.pending;
  return (
    <View style={[styles.badge, { backgroundColor: c.bg, borderColor: c.border }]}>
      <Text style={styles.badgeText} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

function OrderRowItem({ row }: { row: OrderRow }): React.ReactElement {
  const title =
    row.type === 'ticket'
      ? row.eventTitle || 'Ticket'
      : row.type === 'topup'
      ? 'Wallet top-up'
      : row.type === 'subscription'
      ? 'Subscription'
      : row.type === 'merch'
      ? 'Merchandise'
      : 'Order';

  const subtitleBits = [
    row.itemsCount ? `${row.itemsCount} item${row.itemsCount > 1 ? 's' : ''}` : undefined,
    row.createdAt ? fmtDate(row.createdAt) : undefined,
  ].filter(Boolean);

  const totalLabel = fmtMoney(row.totalCents ?? null, row.currency ?? 'AUD');

  return (
    <View style={styles.orderRow}>
      <View style={{ flex: 1 }}>
        <Text style={styles.rowTitle}>{title}</Text>
        {!!subtitleBits.length && <Text style={styles.rowSubtitle}>{subtitleBits.join(' • ')}</Text>}
        {!!row.orderId && <Text style={styles.metaMuted}>#{row.orderId}</Text>}
      </View>
      <View style={{ alignItems: 'flex-end', gap: 6 }}>
        <Text style={styles.amount}>{totalLabel}</Text>
        <StatusBadge status={row.status} />
      </View>
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
  // Wallet
  walletRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  walletBalance: {
    fontFamily: 'Inter_700Bold',
    color: '#fff',
    fontSize: 24,
    letterSpacing: 0.4,
  },
  metaMuted: {
    marginTop: 6,
    fontFamily: 'Inter_400Regular',
    color: '#9ca3af',
    fontSize: 12,
  },
  // Orders
  orderRow: {
    paddingVertical: 12,
    paddingHorizontal: 4,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(0,0,0,0.25)',
    flexDirection: 'row',
    gap: 10,
  },
  rowTitle: {
    fontFamily: 'Inter_700Bold',
    color: '#fff',
    fontSize: 14,
  },
  rowSubtitle: {
    marginTop: 3,
    fontFamily: 'Inter_400Regular',
    color: '#9ca3af',
    fontSize: 12,
  },
  amount: {
    fontFamily: 'Inter_700Bold',
    color: '#fff',
    fontSize: 14,
  },
  // Buttons / badges
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
  muted: {
    fontFamily: 'Inter_400Regular',
    color: '#cbd5e1',
    fontSize: 13,
    textAlign: 'center',
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
    textTransform: 'capitalize',
  },
});
