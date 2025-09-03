// File: app/(tabs)/profile/following.tsx
// Rules followed:
// - No top-level imports from 'firebase/auth'.
// - Firestore at module scope is OK; Functions used only inside handlers.
// - Uses useAuthUid(); no hooks at module scope.
// - Default export a React component; strict-friendly TS; FlatList perf flags included.

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

type FollowDoc = {
  followerUid: string;
  followeeUid: string;
  createdAt?: Timestamp | any;
};

type UserDoc = {
  displayName?: string | null;
  username?: string | null;
  photoURL?: string | null;
};

type Row = {
  uid: string;
  displayName?: string | null;
  username?: string | null;
  photoURL?: string | null;
  since?: Timestamp | null;
};

const RED = '#f70000';
const CARD_BG = 'rgba(0,0,0,0.82)';
const BORDER = 'rgba(255,255,255,0.14)';
const PAGE_SIZE = 24;

/* ---------- helpers ---------- */
function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function fmtDate(ts?: Timestamp | null): string | undefined {
  if (!ts) return undefined;
  try {
    const d = ts.toDate();
    return d.toLocaleDateString();
  } catch {
    return undefined;
  }
}

/* ---------- screen ---------- */
export default function FollowingScreen(): React.ReactElement {
  const router = useRouter();
  const { uid, error: authErr } = useAuthUid();

  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);

  const [cursor, setCursor] = useState<QueryDocumentSnapshot | null>(null);
  const [hasMore, setHasMore] = useState<boolean>(true);
  const [loadingMore, setLoadingMore] = useState<boolean>(false);

  const [unfollowBusy, setUnfollowBusy] = useState<Record<string, boolean>>({});

  const baseFollowingQuery = useMemo(() => {
    if (!uid) return null;
    return query(
      collection(db, 'follows'),
      where('followerUid', '==', uid),
      orderBy('createdAt', 'desc'),
      limit(PAGE_SIZE)
    );
  }, [uid]);

  const materializeUsers = useCallback(
    async (follows: FollowDoc[]): Promise<Row[]> => {
      const ids = follows.map((f) => f.followeeUid);
      const uniqueIds = Array.from(new Set(ids));
      const chunks = chunk(uniqueIds, 10);
      const resultMap = new Map<string, UserDoc>();

      for (const group of chunks) {
        try {
          const snap = await getDocs(
            query(collection(db, 'users'), where('__name__', 'in', group as string[]))
          );
          snap.docs.forEach((d) => resultMap.set(d.id, (d.data() as UserDoc) ?? {}));
        } catch {
          // fallback: fetch individually
          await Promise.all(
            group.map(async (id) => {
              try {
                const s = await getDoc(doc(db, 'users', id));
                if (s.exists()) resultMap.set(id, (s.data() as UserDoc) ?? {});
              } catch {
                // ignore
              }
            })
          );
        }
      }

      return follows.map((f) => {
        const prof = resultMap.get(f.followeeUid) ?? {};
        return {
          uid: f.followeeUid,
          displayName: prof.displayName ?? null,
          username: prof.username ?? null,
          photoURL: prof.photoURL ?? null,
          since: (f.createdAt as Timestamp) ?? null,
        };
      });
    },
    []
  );

  const loadInitial = useCallback(async (): Promise<void> => {
    if (!baseFollowingQuery) {
      setRows([]);
      setCursor(null);
      setHasMore(false);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      let snap = await getDocs(baseFollowingQuery);
      if (snap.empty) {
        // Fallback without orderBy if index missing
        snap = await getDocs(
          query(collection(db, 'follows'), where('followerUid', '==', uid!), limit(PAGE_SIZE))
        );
      }
      const follows = snap.docs.map((d) => d.data() as FollowDoc);
      const materialized = await materializeUsers(follows);
      setRows(materialized);
      const last = snap.docs[snap.docs.length - 1] ?? null;
      setCursor(last);
      setHasMore(Boolean(last) && snap.docs.length === PAGE_SIZE);
    } catch (e) {
      console.warn('[following] initial load error:', e);
      setRows([]);
      setCursor(null);
      setHasMore(false);
    } finally {
      setLoading(false);
    }
  }, [baseFollowingQuery, uid, materializeUsers]);

  const loadMore = useCallback(async (): Promise<void> => {
    if (!uid || !cursor || !hasMore || loadingMore) return;
    setLoadingMore(true);
    try {
      let qMore = query(
        collection(db, 'follows'),
        where('followerUid', '==', uid),
        orderBy('createdAt', 'desc'),
        startAfter(cursor),
        limit(PAGE_SIZE)
      );
      let snap = await getDocs(qMore);
      if (snap.empty) {
        qMore = query(
          collection(db, 'follows'),
          where('followerUid', '==', uid),
          startAfter(cursor),
          limit(PAGE_SIZE)
        );
        snap = await getDocs(qMore);
      }
      const follows = snap.docs.map((d) => d.data() as FollowDoc);
      const materialized = await materializeUsers(follows);
      setRows((prev) => [...prev, ...materialized]);
      const last = snap.docs[snap.docs.length - 1] ?? null;
      setCursor(last);
      setHasMore(Boolean(last) && snap.docs.length === PAGE_SIZE);
    } catch (e) {
      console.warn('[following] load more error:', e);
      setHasMore(false);
    } finally {
      setLoadingMore(false);
    }
  }, [uid, cursor, hasMore, loadingMore, materializeUsers]);

  useEffect(() => {
    if (uid === null) return; // wait until auth resolves
    void loadInitial();
  }, [uid, loadInitial]);

  const onRefresh = useCallback(async (): Promise<void> => {
    setRefreshing(true);
    try {
      await loadInitial();
    } finally {
      setRefreshing(false);
    }
  }, [loadInitial]);

  const unfollow = useCallback(
    async (targetUid: string) => {
      if (!uid) return;
      setUnfollowBusy((b) => ({ ...b, [targetUid]: true }));
      try {
        // Prefer backend for consistent cleanup and rule enforcement.
        const { getFunctions, httpsCallable } = await import('firebase/functions');
        const functions = getFunctions(app);
        const unfollowFn = httpsCallable(functions, 'unfollowUser'); // implement in backend
        await unfollowFn({ followeeUid: targetUid });
        // Optimistic UI: remove from list
        setRows((prev) => prev.filter((r) => r.uid !== targetUid));
      } catch (e) {
        console.warn('[following] unfollow error:', e);
      } finally {
        setUnfollowBusy((b) => ({ ...b, [targetUid]: false }));
      }
    },
    [uid]
  );

  // Signed-out / error states
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
        <Text style={styles.muted}>You’re signed out. Please log in to view following.</Text>
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

  return (
    <FlatList
      data={rows}
      keyExtractor={(it) => it.uid}
      renderItem={({ item }) => (
        <FollowingRow
          row={item}
          onUnfollow={() => unfollow(item.uid)}
          busy={!!unfollowBusy[item.uid]}
        />
      )}
      contentContainerStyle={{ padding: 14, paddingBottom: 24, gap: 12 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#fff" />}
      onEndReachedThreshold={0.4}
      onEndReached={() => {
        if (!loading && !refreshing) void loadMore();
      }}
      ListHeaderComponent={
        <View style={{ marginBottom: 2 }}>
          <Text style={styles.screenTitle}>Following</Text>
        </View>
      }
      ListEmptyComponent={
        !loading ? (
          <View style={styles.empty}>
            <Text style={styles.muted}>You’re not following anyone yet.</Text>
          </View>
        ) : null
      }
      ListFooterComponent={
        loadingMore ? (
          <View style={{ paddingVertical: 10 }}>
            <ActivityIndicator color="#fff" />
          </View>
        ) : null
      }
      removeClippedSubviews
      windowSize={7}
      maxToRenderPerBatch={18}
      initialNumToRender={18}
    />
  );
}

/* ---------- row component ---------- */
function FollowingRow({
  row,
  onUnfollow,
  busy,
}: {
  row: Row;
  onUnfollow: () => void;
  busy: boolean;
}): React.ReactElement {
  const since = fmtDate(row.since);
  return (
    <View style={styles.card}>
      <View style={styles.row}>
        <View style={styles.avatarWrap}>
          {row.photoURL ? (
            <Image source={{ uri: row.photoURL }} style={styles.avatar} />
          ) : (
            <View style={[styles.avatar, { alignItems: 'center', justifyContent: 'center', backgroundColor: '#0f0f0f' }]}>
              <Text style={styles.avatarFallback}>
                {(row.displayName?.[0] ?? row.username?.[0] ?? '?').toUpperCase()}
              </Text>
            </View>
          )}
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={styles.name} numberOfLines={1}>
            {row.displayName || row.username || 'User'}
          </Text>
          {!!row.username && (
            <Text style={styles.username} numberOfLines={1}>
              @{row.username}
            </Text>
          )}
          {!!since && <Text style={styles.metaMuted}>Since {since}</Text>}
        </View>
      </View>

      <View style={styles.actionsRow}>
        <Pressable
          onPress={onUnfollow}
          disabled={busy}
          style={({ pressed }) => [styles.btn, (pressed || busy) && { opacity: 0.9 }]}
        >
          <Text style={styles.btnText}>{busy ? 'Unfollowing…' : 'Unfollow'}</Text>
        </Pressable>
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
  },
  empty: {
    padding: 24,
    alignItems: 'center',
  },
  muted: {
    fontFamily: 'Inter_400Regular',
    color: '#cbd5e1',
    fontSize: 13,
    textAlign: 'center',
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
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
  },
  avatarWrap: {
    width: 52,
    height: 52,
    borderRadius: 999,
    overflow: 'hidden',
    backgroundColor: '#0f0f0f',
  },
  avatar: {
    width: '100%',
    height: '100%',
    borderRadius: 999,
  },
  avatarFallback: {
    fontFamily: 'Inter_700Bold',
    color: '#fff',
    fontSize: 14,
  },
  name: {
    fontFamily: 'Inter_700Bold',
    color: '#fff',
    fontSize: 15,
  },
  username: {
    fontFamily: 'Inter_400Regular',
    color: '#cbd5e1',
    fontSize: 12,
  },
  metaMuted: {
    marginTop: 2,
    fontFamily: 'Inter_400Regular',
    color: '#9ca3af',
    fontSize: 12,
  },

  actionsRow: {
    marginTop: 12,
    flexDirection: 'row',
    gap: 10,
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
  },
  btn: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderColor: BORDER,
    borderWidth: 1,
    alignItems: 'center',
    minWidth: 110,
  },
  btnText: {
    fontFamily: 'Inter_700Bold',
    color: '#e5e7eb',
    fontSize: 14,
    textAlign: 'center',
  },
  btnPrimary: {
    backgroundColor: RED,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    alignItems: 'center',
  },
  btnPrimaryText: {
    fontFamily: 'Inter_700Bold',
    color: '#fff',
    fontSize: 14,
    letterSpacing: 0.5,
  },
});
