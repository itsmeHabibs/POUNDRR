// File: app/(tabs)/poundrr/fights/queue.tsx
// Rules followed:
// - Firestore at module scope is OK.
// - Never import from 'firebase/auth' at the top level.
// - Default export a React component; strict-friendly TS.
// - List uses perf flags (windowSize, removeClippedSubviews, etc.).

import { db } from '@/firebase';
import { useRouter } from 'expo-router';
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
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';

type FightStatus = 'queued' | 'in_progress' | 'completed' | 'cancelled' | 'upcoming';

type FightDoc = {
  eventId?: string | null;
  redName?: string | null;
  blueName?: string | null;
  weightClass?: string | null;
  scheduledAt?: Timestamp | null;
  order?: number | null;
  status?: FightStatus | null;
  createdAt?: Timestamp | null;
};

type FightRow = FightDoc & { id: string };

type Mode = 'queued' | 'upcoming';

const RED = '#f70000';
const CARD_BG = 'rgba(0,0,0,0.70)';
const BORDER = 'rgba(255,255,255,0.14)';
const PAGE_SIZE = 16;

function fmtDate(ts?: Timestamp | null): string | null {
  if (!ts) return null;
  try {
    const d = ts.toDate();
    return `${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  } catch {
    return null;
  }
}

export default function FightQueueScreen(): React.ReactElement {
  const router = useRouter();

  const [mode, setMode] = useState<Mode>('queued');
  const [rows, setRows] = useState<FightRow[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [loadingMore, setLoadingMore] = useState<boolean>(false);
  const [cursor, setCursor] = useState<QueryDocumentSnapshot | null>(null);
  const [hasMore, setHasMore] = useState<boolean>(true);

  // Build the base query for the chosen mode.
  const baseQuery = useMemo(() => {
    if (mode === 'queued') {
      // Queue: fights explicitly marked as queued, ordered by 'order' (fallback handled in load).
      return query(
        collection(db, 'fights'),
        where('status', '==', 'queued'),
        orderBy('order', 'asc'),
        limit(PAGE_SIZE)
      );
    } else {
      // Upcoming: fights scheduled from "now" onward, ordered by time.
      const now = Timestamp.fromDate(new Date());
      return query(
        collection(db, 'fights'),
        where('scheduledAt', '>=', now),
        orderBy('scheduledAt', 'asc'),
        limit(PAGE_SIZE)
      );
    }
  }, [mode]);

  const loadInitial = useCallback(async (): Promise<void> => {
    setLoading(true);
    try {
      let snap = await getDocs(baseQuery);
      // Fallbacks if index/order field not available
      if (snap.empty && mode === 'queued') {
        // Try fall back to createdAt for queued
        const fallback = await getDocs(
          query(
            collection(db, 'fights'),
            where('status', '==', 'queued'),
            orderBy('createdAt', 'asc'),
            limit(PAGE_SIZE)
          )
        );
        snap = fallback;
      }

      const nextRows: FightRow[] = snap.docs.map((d) => ({ id: d.id, ...(d.data() as FightDoc) }));
      setRows(nextRows);
      const last = snap.docs[snap.docs.length - 1] ?? null;
      setCursor(last);
      setHasMore(Boolean(last) && snap.docs.length === PAGE_SIZE);
    } catch (e) {
      console.warn('[fights-queue] initial load error:', e);
      // last-resort fallback without any orderBy
      try {
        let q2;
        if (mode === 'queued') {
          q2 = query(collection(db, 'fights'), where('status', '==', 'queued'), limit(PAGE_SIZE));
        } else {
          const now = Timestamp.fromDate(new Date());
          q2 = query(collection(db, 'fights'), where('scheduledAt', '>=', now), limit(PAGE_SIZE));
        }
        const snap2 = await getDocs(q2);
        const rows2: FightRow[] = snap2.docs.map((d) => ({ id: d.id, ...(d.data() as FightDoc) }));
        setRows(rows2);
        const last2 = snap2.docs[snap2.docs.length - 1] ?? null;
        setCursor(last2);
        setHasMore(Boolean(last2) && snap2.docs.length === PAGE_SIZE);
      } catch (e2) {
        console.warn('[fights-queue] fallback load error:', e2);
        setRows([]);
        setCursor(null);
        setHasMore(false);
      }
    } finally {
      setLoading(false);
    }
  }, [baseQuery, mode]);

  const loadMore = useCallback(async (): Promise<void> => {
    if (!cursor || !hasMore || loadingMore) return;
    setLoadingMore(true);
    try {
      let qMore;
      if (mode === 'queued') {
        qMore = query(
          collection(db, 'fights'),
          where('status', '==', 'queued'),
          orderBy('order', 'asc'),
          startAfter(cursor),
          limit(PAGE_SIZE)
        );
      } else {
        const now = Timestamp.fromDate(new Date());
        qMore = query(
          collection(db, 'fights'),
          where('scheduledAt', '>=', now),
          orderBy('scheduledAt', 'asc'),
          startAfter(cursor),
          limit(PAGE_SIZE)
        );
      }
      let snap = await getDocs(qMore);

      // Fallbacks mirroring initial loader
      if (snap.empty && mode === 'queued') {
        const fallback = await getDocs(
          query(
            collection(db, 'fights'),
            where('status', '==', 'queued'),
            orderBy('createdAt', 'asc'),
            startAfter(cursor),
            limit(PAGE_SIZE)
          )
        );
        snap = fallback;
      }

      const moreRows: FightRow[] = snap.docs.map((d) => ({ id: d.id, ...(d.data() as FightDoc) }));
      setRows((prev) => [...prev, ...moreRows]);
      const last = snap.docs[snap.docs.length - 1] ?? null;
      setCursor(last);
      setHasMore(Boolean(last) && snap.docs.length === PAGE_SIZE);
    } catch (e) {
      console.warn('[fights-queue] load more error:', e);
      setHasMore(false);
    } finally {
      setLoadingMore(false);
    }
  }, [cursor, hasMore, loadingMore, mode]);

  const onRefresh = useCallback(async (): Promise<void> => {
    setRefreshing(true);
    try {
      await loadInitial();
    } finally {
      setRefreshing(false);
    }
  }, [loadInitial]);

  // Initial + reload on mode change
  useEffect(() => {
    void loadInitial();
  }, [loadInitial]);

  const routerToFight = useCallback(
    (id: string) => router.push(`/poundrr/fights/${id}`),
    [router]
  );

  const renderItem = useCallback(
    ({ item }: { item: FightRow }) => <FightRowCard row={item} onPress={() => routerToFight(item.id)} />,
    [routerToFight]
  );

  const keyExtractor = useCallback((it: FightRow) => it.id, []);

  return (
    <View style={{ flex: 1 }}>
      {/* Segmented header */}
      <View style={styles.segmentWrap}>
        <Segment
          label="Queued"
          active={mode === 'queued'}
          onPress={() => setMode('queued')}
        />
        <Segment
          label="Upcoming"
          active={mode === 'upcoming'}
          onPress={() => setMode('upcoming')}
        />
      </View>

      {loading && rows.length === 0 ? (
        <View style={styles.center}>
          <ActivityIndicator color="#fff" />
        </View>
      ) : rows.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.muted}>
            {mode === 'queued' ? 'No fights in queue.' : 'No upcoming fights.'}
          </Text>
        </View>
      ) : (
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
          maxToRenderPerBatch={16}
          initialNumToRender={16}
        />
      )}
    </View>
  );
}

function Segment({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}): React.ReactElement {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.segment,
        active && styles.segmentActive,
        pressed && { opacity: 0.95 },
      ]}
    >
      <Text style={[styles.segmentText, active && styles.segmentTextActive]}>{label}</Text>
    </Pressable>
  );
}

function FightRowCard({
  row,
  onPress,
}: {
  row: FightRow;
  onPress: () => void;
}): React.ReactElement {
  const title =
    row.redName && row.blueName
      ? `${row.redName} vs ${row.blueName}`
      : row.redName || row.blueName || 'Fight';
  const when = fmtDate(row.scheduledAt) ?? (row.status === 'queued' ? 'Queued' : 'TBA');
  const meta = [row.weightClass ?? undefined, when].filter(Boolean).join(' • ');

  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.card, pressed && { opacity: 0.96 }]}>
      <View style={{ paddingHorizontal: 12, paddingVertical: 12 }}>
        <Text style={styles.title} numberOfLines={2}>{title}</Text>
        {!!meta && (
          <Text style={styles.metaValue} numberOfLines={1}>{meta}</Text>
        )}
        {typeof row.order === 'number' && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>#{row.order}</Text>
          </View>
        )}
      </View>
    </Pressable>
  );
}

/* ---------- styles ---------- */
const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  segmentWrap: {
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 6,
    flexDirection: 'row',
    gap: 8,
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
  card: {
    marginHorizontal: 14,
    backgroundColor: CARD_BG,
    borderRadius: 12,
    borderTopWidth: 3,
    borderTopColor: RED,
    overflow: 'hidden',
  },
  title: {
    fontFamily: 'Inter_700Bold',
    color: '#fff',
    fontSize: 16,
    letterSpacing: 0.3,
  },
  metaValue: {
    marginTop: 6,
    fontFamily: 'Inter_400Regular',
    color: '#e5e7eb',
    fontSize: 13,
  },
  badge: {
    alignSelf: 'flex-start',
    marginTop: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(247,0,0,0.16)',
    borderWidth: 1,
    borderColor: RED,
  },
  badgeText: {
    fontFamily: 'Inter_700Bold',
    color: '#fff',
    fontSize: 12,
  },
  // Added missing muted style used in empty state
  muted: {
    fontFamily: 'Inter_400Regular',
    color: '#cbd5e1',
    fontSize: 13,
    textAlign: 'center',
  },
});
