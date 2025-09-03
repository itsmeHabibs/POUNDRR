// File: app/(tabs)/poundrr/events/index.tsx
// Rules: Firestore at module scope OK; no top-level firebase/auth; default export; strict-friendly TS.

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
} from 'firebase/firestore';
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

type EventDoc = {
  title?: string;
  posterUrl?: string;
  description?: string;
  startAt?: Timestamp;
  endAt?: Timestamp;
  venueName?: string;
  address?: string;
  city?: string;
  country?: string;
  ticketUrl?: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
};

type EventRow = EventDoc & { id: string };

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

export default function EventsIndexScreen(): React.ReactElement {
  const router = useRouter();

  const [rows, setRows] = useState<EventRow[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [loadingMore, setLoadingMore] = useState<boolean>(false);
  const [cursor, setCursor] = useState<QueryDocumentSnapshot | null>(null);
  const [hasMore, setHasMore] = useState<boolean>(true);

  const baseQuery = useMemo(
    () => query(collection(db, 'events'), orderBy('startAt', 'desc'), limit(PAGE_SIZE)),
    []
  );

  const loadInitial = useCallback(async (): Promise<void> => {
    setLoading(true);
    try {
      const snap = await getDocs(baseQuery);
      const nextRows: EventRow[] = snap.docs.map((d) => ({ id: d.id, ...(d.data() as EventDoc) }));
      setRows(nextRows);
      const last = snap.docs[snap.docs.length - 1] ?? null;
      setCursor(last);
      setHasMore(Boolean(last) && snap.docs.length === PAGE_SIZE);
    } catch (e) {
      console.warn('[events-index] initial load error:', e);
      setRows([]);
      setCursor(null);
      setHasMore(false);
    } finally {
      setLoading(false);
    }
  }, [baseQuery]);

  const loadMore = useCallback(async (): Promise<void> => {
    if (!cursor || !hasMore || loadingMore) return;
    setLoadingMore(true);
    try {
      const snap = await getDocs(
        query(collection(db, 'events'), orderBy('startAt', 'desc'), startAfter(cursor), limit(PAGE_SIZE))
      );
      const moreRows: EventRow[] = snap.docs.map((d) => ({ id: d.id, ...(d.data() as EventDoc) }));
      setRows((prev) => [...prev, ...moreRows]);
      const last = snap.docs[snap.docs.length - 1] ?? null;
      setCursor(last);
      setHasMore(Boolean(last) && snap.docs.length === PAGE_SIZE);
    } catch (e) {
      console.warn('[events-index] load more error:', e);
      setHasMore(false);
    } finally {
      setLoadingMore(false);
    }
  }, [cursor, hasMore, loadingMore]);

  const onRefresh = useCallback(async (): Promise<void> => {
    setRefreshing(true);
    try {
      await loadInitial();
    } finally {
      setRefreshing(false);
    }
  }, [loadInitial]);

  useEffect(() => {
    void loadInitial();
  }, [loadInitial]);

  const renderItem = useCallback(
    ({ item }: { item: EventRow }) => <EventCard row={item} onPress={() => router.push(`/poundrr/events/${item.id}`)} />,
    [router]
  );

  const keyExtractor = useCallback((it: EventRow) => it.id, []);

  if (loading && rows.length === 0) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#fff" />
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

function EventCard({
  row,
  onPress,
}: {
  row: EventRow;
  onPress: () => void;
}): React.ReactElement {
  const when = fmtDate(row.startAt) ?? 'TBA';
  const venueLine = [row.venueName, row.address].filter(Boolean).join(' • ');
  const cityLine = [row.city, row.country].filter(Boolean).join(', ');
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.card, pressed && { opacity: 0.96 }]}>
      {row.posterUrl ? (
        <Image source={{ uri: row.posterUrl }} style={styles.poster} resizeMode="cover" />
      ) : (
        <View style={[styles.poster, { alignItems: 'center', justifyContent: 'center', backgroundColor: '#0f0f0f' }]}>
          <Text style={styles.posterFallback}>EVENT</Text>
        </View>
      )}

      <View style={{ paddingHorizontal: 12, paddingVertical: 12 }}>
        <Text style={styles.title} numberOfLines={2}>
          {row.title ?? 'Event'}
        </Text>
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
  card: {
    marginHorizontal: 14,
    backgroundColor: CARD_BG,
    borderRadius: 12,
    borderTopWidth: 3,
    borderTopColor: RED,
    overflow: 'hidden',
  },
  poster: {
    width: '100%',
    height: 180,
    backgroundColor: '#111',
  },
  posterFallback: {
    fontFamily: 'Inter_700Bold',
    color: '#fff',
    fontSize: 18,
    letterSpacing: 1,
  },
  title: {
    fontFamily: 'Inter_700Bold',
    color: '#fff',
    fontSize: 18,
    letterSpacing: 0.4,
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
  // (Shared) not used here but kept for consistency if you add actions:
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
});
