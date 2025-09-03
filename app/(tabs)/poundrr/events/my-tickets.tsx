// File: app/(tabs)/poundrr/events/my-tickets.tsx
// Rules: Firestore at module scope OK; never import firebase/auth at top-level;
// use useAuthUid() inside the component; strict-friendly TS.

import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { db } from '@/firebase';
import { useAuthUid } from '@/hooks/useAuthUid';
import {
  QueryDocumentSnapshot,
  Timestamp,
  collection,
  getDocs,
  limit,
  orderBy,
  query,
  startAfter,
  where,
} from 'firebase/firestore';

type TicketStatus = 'valid' | 'used' | 'refunded' | 'cancelled' | 'expired' | 'pending';

type TicketDoc = {
  ownerUid?: string;
  eventId?: string;
  eventTitle?: string;
  eventStart?: Timestamp;
  venueName?: string;
  address?: string;
  city?: string;
  country?: string;
  tier?: string | null;
  seat?: string | null;
  quantity?: number | null;
  code?: string | null;           // human-readable code
  barcodeData?: string | null;    // raw barcode/QR payload if you store it
  priceCents?: number | null;
  currency?: string | null;       // e.g., "AUD"
  status?: TicketStatus;
  posterUrl?: string | null;
  orderId?: string | null;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
};

type TicketRow = TicketDoc & { id: string };

const RED = '#f70000';
const CARD_BG = 'rgba(0,0,0,0.70)';
const BORDER = 'rgba(255,255,255,0.14)';
const PAGE_SIZE = 12;

function fmtDate(ts?: Timestamp): string | null {
  if (!ts) return null;
  try {
    const d = ts.toDate();
    return `${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  } catch {
    return null;
  }
}

function centsToAUDLabel(cents?: number | null): string | null {
  if (cents == null) return null;
  const amt = (cents / 100).toFixed(2);
  return `A$${amt}`;
}

export default function MyTicketsScreen(): React.ReactElement {
  const router = useRouter();
  const { uid, error: authErr } = useAuthUid();

  const [rows, setRows] = useState<TicketRow[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [loadingMore, setLoadingMore] = useState<boolean>(false);
  const [cursor, setCursor] = useState<QueryDocumentSnapshot | null>(null);
  const [hasMore, setHasMore] = useState<boolean>(true);

  const baseQuery = useMemo(() => {
    if (!uid) return null;
    return query(
      collection(db, 'tickets'),
      where('ownerUid', '==', uid),
      orderBy('createdAt', 'desc'),
      limit(PAGE_SIZE)
    );
  }, [uid]);

  const loadInitial = useCallback(async (): Promise<void> => {
    if (!baseQuery) {
      setRows([]);
      setCursor(null);
      setHasMore(false);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const snap = await getDocs(baseQuery);
      const nextRows: TicketRow[] = snap.docs.map((d) => ({ id: d.id, ...(d.data() as TicketDoc) }));
      setRows(nextRows);
      const last = snap.docs[snap.docs.length - 1] ?? null;
      setCursor(last);
      setHasMore(Boolean(last) && snap.docs.length === PAGE_SIZE);
    } catch (e) {
      console.warn('[my-tickets] initial load error:', e);
      setRows([]);
      setCursor(null);
      setHasMore(false);
    } finally {
      setLoading(false);
    }
  }, [baseQuery]);

  const loadMore = useCallback(async (): Promise<void> => {
    if (!uid || !cursor || !hasMore || loadingMore) return;
    setLoadingMore(true);
    try {
      const snap = await getDocs(
        query(
          collection(db, 'tickets'),
          where('ownerUid', '==', uid),
          orderBy('createdAt', 'desc'),
          startAfter(cursor),
          limit(PAGE_SIZE)
        )
      );
      const moreRows: TicketRow[] = snap.docs.map((d) => ({ id: d.id, ...(d.data() as TicketDoc) }));
      setRows((prev) => [...prev, ...moreRows]);
      const last = snap.docs[snap.docs.length - 1] ?? null;
      setCursor(last);
      setHasMore(Boolean(last) && snap.docs.length === PAGE_SIZE);
    } catch (e) {
      console.warn('[my-tickets] load more error:', e);
      setHasMore(false);
    } finally {
      setLoadingMore(false);
    }
  }, [uid, cursor, hasMore, loadingMore]);

  const onRefresh = useCallback(async (): Promise<void> => {
    setRefreshing(true);
    try {
      await loadInitial();
    } finally {
      setRefreshing(false);
    }
  }, [loadInitial]);

  useEffect(() => {
    // Load when uid is known
    if (uid === null) return; // wait for auth state
    void loadInitial();
  }, [uid, loadInitial]);

  const renderItem = useCallback(
    ({ item }: { item: TicketRow }) => (
      <TicketCard
        row={item}
        onViewEvent={() => item.eventId && router.push(`/poundrr/events/${item.eventId}`)}
      />
    ),
    [router]
  );

  const keyExtractor = useCallback((it: TicketRow) => it.id, []);

  // Signed-out or auth error states
  if (authErr) {
    return (
      <View style={styles.center}>
        <Text style={styles.muted}>Auth error: {authErr}</Text>
      </View>
    );
  }
  if (!uid) {
    return (
      <View style={styles.center}>
        <Text style={styles.muted}>You’re signed out. Please log in to view your tickets.</Text>
        <Pressable
          onPress={() => router.replace('/login')}
          style={({ pressed }) => [styles.btnPrimary, pressed && { opacity: 0.9 }]}
        >
          <Text style={styles.btnPrimaryText}>Go to Login</Text>
        </Pressable>
      </View>
    );
  }

  if (loading && rows.length === 0) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#fff" />
      </View>
    );
  }

  if (!loading && rows.length === 0) {
    return (
      <View style={styles.center}>
        <Text style={styles.muted}>No tickets yet.</Text>
        <Text style={[styles.muted, { marginTop: 6 }]}>
          Grab tickets from the Events tab and they’ll appear here.
        </Text>
      </View>
    );
  }

  return (
    <FlatList
      data={rows}
      keyExtractor={keyExtractor}
      renderItem={renderItem}
      contentContainerStyle={{ paddingBottom: 24, paddingTop: 8, gap: 12 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#fff" />}
      onEndReachedThreshold={0.4}
      onEndReached={() => {
        if (!loading && !refreshing) void loadMore();
      }}
      ListFooterComponent={
        loadingMore ? (
          <View style={{ paddingVertical: 14 }}>
            <ActivityIndicator color="#fff" />
          </View>
        ) : null
      }
      removeClippedSubviews
      windowSize={7}
      maxToRenderPerBatch={12}
      initialNumToRender={12}
    />
  );
}

function StatusBadge({ status }: { status?: TicketStatus }): React.ReactElement {
  const label = status ?? 'valid';
  const stylesMap: Record<TicketStatus, { bg: string; border: string }> = {
    valid: { bg: 'rgba(34,197,94,0.16)', border: 'rgba(34,197,94,0.8)' },
    used: { bg: 'rgba(148,163,184,0.16)', border: 'rgba(148,163,184,0.8)' },
    refunded: { bg: 'rgba(59,130,246,0.16)', border: 'rgba(59,130,246,0.8)' },
    cancelled: { bg: 'rgba(239,68,68,0.16)', border: 'rgba(239,68,68,0.9)' },
    expired: { bg: 'rgba(148,163,184,0.16)', border: 'rgba(148,163,184,0.8)' },
    pending: { bg: 'rgba(250,204,21,0.16)', border: 'rgba(250,204,21,0.9)' },
  };
  const cfg = stylesMap[label] ?? stylesMap.valid;
  return (
    <View style={[ticketStyles.badge, { backgroundColor: cfg.bg, borderColor: cfg.border }]}>
      <Text style={ticketStyles.badgeText}>{label}</Text>
    </View>
  );
}

function TicketCard({
  row,
  onViewEvent,
}: {
  row: TicketRow;
  onViewEvent: () => void;
}): React.ReactElement {
  const when = fmtDate(row.eventStart) ?? 'TBA';
  const venueLine = [row.venueName, row.address].filter(Boolean).join(' • ');
  const cityLine = [row.city, row.country].filter(Boolean).join(', ');
  const totalLabel = centsToAUDLabel(row.priceCents ?? null);

  return (
    <View style={styles.card}>
      {/* Poster */}
      {row.posterUrl ? (
        <Image source={{ uri: row.posterUrl }} style={ticketStyles.poster} resizeMode="cover" />
      ) : (
        <View style={[ticketStyles.poster, { alignItems: 'center', justifyContent: 'center', backgroundColor: '#0f0f0f' }]}>
          <Text style={styles.posterFallback}>EVENT</Text>
        </View>
      )}

      {/* Content */}
      <View style={{ paddingHorizontal: 12, paddingVertical: 12 }}>
        <View style={ticketStyles.headerRow}>
          <Text style={styles.title} numberOfLines={2}>
            {row.eventTitle ?? 'Event'}
          </Text>
          <StatusBadge status={row.status} />
        </View>

        <Text style={styles.metaLine} numberOfLines={1}>
          <Text style={styles.metaLabel}>When: </Text>
          <Text style={styles.metaValue}>{when}</Text>
        </Text>

        {!!venueLine && (
          <Text style={styles.metaLine} numberOfLines={1}>
            <Text style={styles.metaLabel}>Where: </Text>
            <Text style={styles.metaValue}>{venueLine}</Text>
          </Text>
        )}

        {!!cityLine && (
          <Text style={styles.metaLine} numberOfLines={1}>
            <Text style={styles.metaLabel}>Location: </Text>
            <Text style={styles.metaValue}>{cityLine}</Text>
          </Text>
        )}

        <View style={ticketStyles.detailsRow}>
          {!!row.tier && (
            <View style={ticketStyles.pill}>
              <Text style={ticketStyles.pillText}>{row.tier}</Text>
            </View>
          )}
          {!!row.seat && (
            <View style={ticketStyles.pill}>
              <Text style={ticketStyles.pillText}>Seat {row.seat}</Text>
            </View>
          )}
          {typeof row.quantity === 'number' && row.quantity > 1 && (
            <View style={ticketStyles.pill}>
              <Text style={ticketStyles.pillText}>x{row.quantity}</Text>
            </View>
          )}
          {!!totalLabel && (
            <View style={ticketStyles.pill}>
              <Text style={ticketStyles.pillText}>{totalLabel}</Text>
            </View>
          )}
        </View>

        {!!row.code && (
          <Text style={[styles.metaValue, { marginTop: 8 }]} numberOfLines={1}>
            Code: {row.code}
          </Text>
        )}

        {/* Actions */}
        <View style={ticketStyles.actionsRow}>
          <Pressable onPress={onViewEvent} style={({ pressed }) => [styles.btn, pressed && { opacity: 0.95 }]}>
            <Text style={styles.btnText}>View Event</Text>
          </Pressable>

          {/* Placeholder for future "Show Code" modal with QR/Barcode */}
          {/* <Pressable onPress={onShowCode} style={({ pressed }) => [styles.btn, pressed && { opacity: 0.95 }]}>
            <Text style={styles.btnText}>Show Code</Text>
          </Pressable> */}
        </View>
      </View>
    </View>
  );
}

/* ---------- shared list styles ---------- */
const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    marginHorizontal: 14,
    backgroundColor: CARD_BG,
    borderRadius: 12,
    borderTopWidth: 3,
    borderTopColor: RED,
    overflow: 'hidden',
  },
  posterFallback: {
    fontFamily: 'Inter_700Bold',
    color: '#fff',
    fontSize: 18,
    letterSpacing: 1,
  },
  title: {
    flex: 1,
    fontFamily: 'Inter_700Bold',
    color: '#fff',
    fontSize: 18,
    letterSpacing: 0.4,
    marginRight: 8,
  },
  metaLine: {
    marginTop: 6,
  },
  metaLabel: {
    fontFamily: 'Inter_700Bold',
    color: '#cbd5e1',
    fontSize: 12,
  },
  metaValue: {
    fontFamily: 'Inter_400Regular',
    color: '#fff',
    fontSize: 13,
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
  muted: {
    fontFamily: 'Inter_400Regular',
    color: '#cbd5e1',
    fontSize: 13,
    textAlign: 'center',
  },
});

/* ---------- ticket-specific styles ---------- */
const ticketStyles = StyleSheet.create({
  poster: {
    width: '100%',
    height: 160,
    backgroundColor: '#111',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
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
  detailsRow: {
    marginTop: 8,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  pill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  pillText: {
    fontFamily: 'Inter_700Bold',
    color: '#e5e7eb',
    fontSize: 12,
  },
  actionsRow: {
    marginTop: 12,
    flexDirection: 'row',
    gap: 10,
  },
});
