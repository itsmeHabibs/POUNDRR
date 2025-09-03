// File: app/(tabs)/profile/followers.tsx
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

export default function FollowersScreen(): React.ReactElement {
  const router = useRouter();
  const { uid, error: authErr } = useAuthUid();

  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);

  const [cursor, setCursor] = useState<QueryDocumentSnapshot | null>(null);
  const [hasMore, setHasMore] = useState<boolean>(true);
  const [loadingMore, setLoadingMore] = useState<boolean>(false);

  const [followBusy, setFollowBusy] = useState<Record<string, boolean>>({});
  const [followedBack, setFollowedBack] = useState<Record<string, boolean>>({});
  const [removeBusy, setRemoveBusy] = useState<Record<string, boolean>>({});

  const baseFollowersQuery = useMemo(() => {
    if (!uid) return null;
    return query(
      collection(db, 'follows'),
      where('followeeUid', '==', uid),
      orderBy('createdAt', 'desc'),
      limit(PAGE_SIZE)
    );
  }, [uid]);

  const materializeUsers = useCallback(
    async (follows: FollowDoc[]): Promise<Row[]> => {
      // fetch user docs for followerUid in chunks of 10 using "in" queries
      const ids = follows.map((f) => f.followerUid);
      const uniqueIds = Array.from(new Set(ids));
      const chunks = chunk(uniqueIds, 10);
      const resultMap = new Map<string, UserDoc>();

      for (const group of chunks) {
        try {
          const snap = await getDocs(
            query(collection(db, 'users'), where('__name__', 'in', group as string[]))
          );
          snap.docs.forEach((d) => resultMap.set(d.id, (d.data() as UserDoc) ?? {}));
        } catch (e) {
          // If "in" not indexed or fails, fetch individually as fallback
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
        const prof = resultMap.get(f.followerUid) ?? {};
        return {
          uid: f.followerUid,
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
    if (!baseFollowersQuery) {
      setRows([]);
      setCursor(null);
      setHasMore(false);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      let snap = await getDocs(baseFollowersQuery);
      if (snap.empty) {
        // Fallback without orderBy if needed
        snap = await getDocs(
          query(collection(db, 'follows'), where('followeeUid', '==', uid!), limit(PAGE_SIZE))
        );
      }
      const follows = snap.docs.map((d) => d.data() as FollowDoc);
      const materialized = await materializeUsers(follows);
      setRows(materialized);
      const last = snap.docs[snap.docs.length - 1] ?? null;
      setCursor(last);
      setHasMore(Boolean(last) && snap.docs.length === PAGE_SIZE);
    } catch (e) {
      console.warn('[followers] initial load error:', e);
      setRows([]);
      setCursor(null);
      setHasMore(false);
    } finally {
      setLoading(false);
    }
  }, [baseFollowersQuery, uid, materializeUsers]);

  const loadMore = useCallback(async (): Promise<void> => {
    if (!uid || !cursor || !hasMore || loadingMore) return;
    setLoadingMore(true);
    try {
      let qMore = query(
        collection(db, 'follows'),
        where('followeeUid', '==', uid),
        orderBy('createdAt', 'desc'),
        startAfter(cursor),
        limit(PAGE_SIZE)
      );
      let snap = await getDocs(qMore);
      if (snap.empty) {
        qMore = query(
          collection(db, 'follows'),
          where('followeeUid', '==', uid),
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
      console.warn('[followers] load more error:', e);
      setHasMore(false);
    } finally {
      setLoadingMore(false);
    }
  }, [uid, cursor, hasMore, loadingMore, materializeUsers]);

  useEffect(() => {
    if (uid === null) return; // wait for auth hook to resolve
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

  const followBack = useCallback(
    async (targetUid: string) => {
      if (!uid) return;
      setFollowBusy((b) => ({ ...b, [targetUid]: true }));
      try {
        // Use deterministic id for idempotency
        const id = `${uid}_${targetUid}`;
        await getDocs; // noop to satisfy linter unused imports? (kept intentionally no-op)
        await (await import('firebase/firestore')).setDoc(
          doc(db, 'follows', id),
          {
            followerUid: uid,
            followeeUid: targetUid,
            createdAt: Timestamp.fromDate(new Date()),
          } as FollowDoc,
          { merge: true }
        );
        setFollowedBack((m) => ({ ...m, [targetUid]: true }));
      } catch (e) {
        console.warn('[followers] follow back error:', e);
      } finally {
        setFollowBusy((b) => ({ ...b, [targetUid]: false }));
      }
    },
    [uid]
  );

  const removeFollower = useCallback(
    async (targetUid: string) => {
      if (!uid) return;
      setRemoveBusy((b) => ({ ...b, [targetUid]: true }));
      try {
        // Prefer backend to locate and remove the follower record safely
        const { getFunctions, httpsCallable } = await import('firebase/functions');
        const functions = getFunctions(app);
        const removeFollowerFn = httpsCallable(functions, 'removeFollower'); // implement in backend
        await removeFollowerFn({ followerUid: targetUid });
        // Optimistic UI: filter out from list
        setRows((prev) => prev.filter((r) => r.uid !== targetUid));
      } catch (e) {
        console.warn('[followers] remove follower error:', e);
      } finally {
        setRemoveBusy((b) => ({ ...b, [targetUid]: false }));
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
        <Text style={styles.muted}>You’re signed out. Please log in to view followers.</Text>
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
        <FollowerRow
          row={item}
          onFollowBack={() => followBack(item.uid)}
          onRemove={() => removeFollower(item.uid)}
          followBusy={!!followBusy[item.uid]}
          followedBack={!!followedBack[item.uid]}
          removeBusy={!!removeBusy[item.uid]}
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
          <Text style={styles.screenTitle}>Followers</Text>
        </View>
      }
      ListEmptyComponent={
        !loading ? (
          <View style={styles.empty}>
            <Text style={styles.muted}>You don’t have any followers yet.</Text>
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
function FollowerRow({
  row,
  onFollowBack,
  onRemove,
  followBusy,
  followedBack,
  removeBusy,
}: {
  row: Row;
  onFollowBack: () => void;
  onRemove: () => void;
  followBusy: boolean;
  followedBack: boolean;
  removeBusy: boolean;
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
          onPress={onFollowBack}
          disabled={followBusy || followedBack}
          style={({ pressed }) => [
            styles.btnPrimary,
            (pressed || followBusy || followedBack) && { opacity: 0.9 },
          ]}
        >
          <Text style={styles.btnPrimaryText}>
            {followedBack ? 'Following' : followBusy ? 'Following…' : 'Follow back'}
          </Text>
        </Pressable>

        <Pressable
          onPress={onRemove}
          disabled={removeBusy}
          style={({ pressed }) => [styles.btn, (pressed || removeBusy) && { opacity: 0.9 }]}
        >
          <Text style={styles.btnText}>{removeBusy ? 'Removing…' : 'Remove'}</Text>
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
