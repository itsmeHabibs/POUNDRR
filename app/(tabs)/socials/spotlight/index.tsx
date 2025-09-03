// File: app/(tabs)/socials/spotlight/index.tsx
// Rules followed:
// - No top-level imports from 'firebase/auth'.
// - Firestore at module scope is OK; all calls done in effects/handlers.
// - Default export a React component; TS strict-friendly; list perf flags included.

import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { db } from '@/firebase';

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

/* ---------- types ---------- */
type SpotlightDoc = {
  title?: string | null;
  description?: string | null;
  ownerUid?: string;
  videoUrl?: string | null;
  thumbnailUrl?: string | null;
  createdAt?: Timestamp | null;
  likesCount?: number;
  viewsCount?: number;
};

type UserDoc = {
  displayName?: string | null;
  username?: string | null;
  photoURL?: string | null;
};

type Row = SpotlightDoc & {
  id: string;
  owner?: UserDoc | null;
};

/* ---------- constants ---------- */
const RED = '#f70000';
const CARD_BG = 'rgba(0,0,0,0.82)';
const BORDER = 'rgba(255,255,255,0.12)';
const PAGE_SIZE = 20;

/* ---------- helpers ---------- */
function timeAgo(ts?: Timestamp | null): string {
  if (!ts) return '';
  try {
    const t = ts.toDate().getTime();
    const diff = Math.max(0, Date.now() - t);
    const m = Math.floor(diff / 60000);
    if (m < 1) return 'now';
    if (m < 60) return `${m}m`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h`;
    const d = Math.floor(h / 24);
    if (d < 7) return `${d}d`;
    const w = Math.floor(d / 7);
    return `${w}w`;
  } catch {
    return '';
  }
}
function fmtNum(n?: number): string {
  if (typeof n !== 'number') return '0';
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}k`;
  return `${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}m`;
}
function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/* ---------- screen ---------- */
export default function SpotlightIndexScreen(): React.ReactElement {
  const router = useRouter();

  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);

  const [cursor, setCursor] = useState<QueryDocumentSnapshot | null>(null);
  const [hasMore, setHasMore] = useState<boolean>(true);
  const [loadingMore, setLoadingMore] = useState<boolean>(false);

  const baseQuery = useMemo(() => {
    return query(
      collection(db, 'spotlights'),
      orderBy('createdAt', 'desc'),
      limit(PAGE_SIZE)
    );
  }, []);

  const hydrateOwners = useCallback(async (items: Row[]): Promise<Row[]> => {
    const ids = Array.from(new Set(items.map((r) => r.ownerUid).filter(Boolean))) as string[];
    const idChunks = chunk(ids, 10);
    const map = new Map<string, UserDoc | null>();

    for (const group of idChunks) {
      try {
        const snap = await getDocs(
          query(collection(db, 'users'), where('__name__', 'in', group as string[]))
        );
        snap.docs.forEach((d) => map.set(d.id, (d.data() as UserDoc) ?? null));
      } catch {
        // Fallback to individual fetches
        await Promise.all(
          group.map(async (id) => {
            try {
              const s = await getDoc(doc(db, 'users', id));
              map.set(id, s.exists() ? ((s.data() as UserDoc) ?? null) : null);
            } catch {
              map.set(id, null);
            }
          })
        );
      }
    }

    return items.map((it) => ({ ...it, owner: it.ownerUid ? map.get(it.ownerUid) ?? null : null }));
  }, []);

  const loadInitial = useCallback(async (): Promise<void> => {
    setLoading(true);
    try {
      let snap = await getDocs(baseQuery);
      // If index missing, fallback to unsorted limited fetch (no pagination guarantee)
      if (snap.empty) {
        snap = await getDocs(query(collection(db, 'spotlights'), limit(PAGE_SIZE)));
      }
      const items: Row[] = snap.docs.map((d) => ({ id: d.id, ...(d.data() as SpotlightDoc) }));
      const hydrated = await hydrateOwners(items);
      setRows(hydrated);
      const last = snap.docs[snap.docs.length - 1] ?? null;
      setCursor(last);
      setHasMore(Boolean(last) && snap.docs.length === PAGE_SIZE);
    } catch (e) {
      console.warn('[spotlight] initial load error:', e);
      setRows([]);
      setCursor(null);
      setHasMore(false);
    } finally {
      setLoading(false);
    }
  }, [baseQuery, hydrateOwners]);

  const loadMore = useCallback(async (): Promise<void> => {
    if (!cursor || !hasMore || loadingMore) return;
    setLoadingMore(true);
    try {
      const qMore = query(
        collection(db, 'spotlights'),
        orderBy('createdAt', 'desc'),
        startAfter(cursor),
        limit(PAGE_SIZE)
      );
      const snap = await getDocs(qMore);
      const more: Row[] = snap.docs.map((d) => ({ id: d.id, ...(d.data() as SpotlightDoc) }));
      const hydrated = await hydrateOwners(more);
      setRows((prev) => [...prev, ...hydrated]);
      const last = snap.docs[snap.docs.length - 1] ?? null;
      setCursor(last);
      setHasMore(Boolean(last) && snap.docs.length === PAGE_SIZE);
    } catch (e) {
      console.warn('[spotlight] load more error:', e);
      setHasMore(false);
    } finally {
      setLoadingMore(false);
    }
  }, [cursor, hasMore, loadingMore, hydrateOwners]);

  useEffect(() => {
    void loadInitial();
  }, [loadInitial]);

  const onRefresh = useCallback(async (): Promise<void> => {
    setRefreshing(true);
    try {
      await loadInitial();
    } finally {
      setRefreshing(false);
    }
  }, [loadInitial]);

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
      keyExtractor={(it) => it.id}
      numColumns={2}
      columnWrapperStyle={{ gap: 10, paddingHorizontal: 12 }}
      contentContainerStyle={{ paddingTop: 12, paddingBottom: 28, gap: 10 }}
      renderItem={({ item }) => (
        <SpotlightCard
          row={item}
          onPress={() => router.push(`/socials/spotlight/${item.id}`)}
        />
      )}
      ListHeaderComponent={
        <View style={{ paddingHorizontal: 14, paddingBottom: 6 }}>
          <Text style={styles.screenTitle}>Spotlight</Text>
        </View>
      }
      ListEmptyComponent={
        !loading ? (
          <View style={{ paddingVertical: 20, alignItems: 'center' }}>
            <Text style={styles.muted}>No spotlight videos yet.</Text>
          </View>
        ) : null
      }
      onEndReachedThreshold={0.4}
      onEndReached={() => {
        if (!loading && !refreshing) void loadMore();
      }}
      ListFooterComponent={
        loadingMore ? (
          <View style={{ paddingVertical: 12 }}>
            <ActivityIndicator color="#fff" />
          </View>
        ) : null
      }
      removeClippedSubviews
      windowSize={9}
      maxToRenderPerBatch={24}
      initialNumToRender={24}
    />
  );
}

/* ---------- item ---------- */
function SpotlightCard({
  row,
  onPress,
}: {
  row: Row;
  onPress: () => void;
}): React.ReactElement {
  const ownerName = row.owner?.displayName || row.owner?.username || 'Creator';
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.card, pressed && { opacity: 0.96 }]}>
      <View style={styles.thumbWrap}>
        {row.thumbnailUrl ? (
          <Image source={{ uri: row.thumbnailUrl }} style={styles.thumb} />
        ) : (
          <View style={[styles.thumb, styles.thumbFallback]}>
            <Text style={styles.thumbFallbackTxt}>NO THUMB</Text>
          </View>
        )}
        <View style={styles.badges}>
          <View style={styles.badge}>
            <Text style={styles.badgeTxt}>❤ {fmtNum(row.likesCount)}</Text>
          </View>
          <View style={styles.badge}>
            <Text style={styles.badgeTxt}>▶ {fmtNum(row.viewsCount)}</Text>
          </View>
        </View>
      </View>

      <View style={styles.meta}>
        <Text style={styles.title} numberOfLines={1}>
          {row.title || 'Untitled'}
        </Text>
        <Text style={styles.sub} numberOfLines={1}>
          {ownerName}
          {row.createdAt ? ` • ${timeAgo(row.createdAt)}` : ''}
        </Text>
      </View>
    </Pressable>
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
  },
  muted: {
    fontFamily: 'Inter_400Regular',
    color: '#cbd5e1',
    fontSize: 13,
    textAlign: 'center',
  },

  card: {
    flex: 1,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: CARD_BG,
    borderTopWidth: 3,
    borderTopColor: RED,
  },
  thumbWrap: {
    width: '100%',
    aspectRatio: 16 / 9,
    backgroundColor: '#0a0a0a',
  },
  thumb: {
    width: '100%',
    height: '100%',
  },
  thumbFallback: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0f0f0f',
  },
  thumbFallbackTxt: {
    fontFamily: 'Inter_700Bold',
    color: '#fff',
    fontSize: 10,
    letterSpacing: 1,
  },
  badges: {
    position: 'absolute',
    right: 6,
    bottom: 6,
    flexDirection: 'row',
    gap: 6,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderWidth: 1,
    borderColor: BORDER,
  },
  badgeTxt: {
    fontFamily: 'Inter_700Bold',
    color: '#fff',
    fontSize: 11,
  },

  meta: {
    paddingHorizontal: 10,
    paddingVertical: 10,
    gap: 2,
  },
  title: {
    fontFamily: 'Inter_700Bold',
    color: '#fff',
    fontSize: 14,
  },
  sub: {
    fontFamily: 'Inter_400Regular',
    color: '#9ca3af',
    fontSize: 11,
  },
});

