// File: app/(tabs)/socials/swipe/matches.tsx
// Rules followed:
// - No top-level imports from 'firebase/auth' (uses useAuthUid for auth state).
// - Firestore usage is fine at module scope; all calls done in effects/handlers.
// - Default export a React component; TS strict-friendly; FlatList perf flags included.

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
  deleteDoc,
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
type UserDoc = {
  displayName?: string | null;
  username?: string | null;
  photoURL?: string | null;
  city?: string | null;
  country?: string | null;
};

type SwipeDoc = {
  actorUid: string;
  targetUid: string;
  direction: 'left' | 'right';
  createdAt?: Timestamp | null;
};

type MatchRow = {
  uid: string; // matched user's uid
  profile: UserDoc | null;
  matchedAt?: Timestamp | null; // timestamp based on "my" right swipe
};

/* ---------- constants ---------- */
const RED = '#f70000';
const CARD_BG = 'rgba(0,0,0,0.82)';
const BORDER = 'rgba(255,255,255,0.14)';
const PAGE_SIZE = 24;

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

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/* ---------- screen ---------- */
export default function SwipeMatchesScreen(): React.ReactElement {
  const router = useRouter();
  const { uid, error: authErr } = useAuthUid();

  const [rows, setRows] = useState<MatchRow[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);

  const [cursor, setCursor] = useState<QueryDocumentSnapshot | null>(null);
  const [hasMore, setHasMore] = useState<boolean>(true);
  const [loadingMore, setLoadingMore] = useState<boolean>(false);
  const [unmatching, setUnmatching] = useState<Record<string, boolean>>({});

  const myRightSwipesQ = useMemo(() => {
    if (!uid) return null;
    return query(
      collection(db, 'swipes'),
      where('actorUid', '==', uid),
      where('direction', '==', 'right'),
      orderBy('createdAt', 'desc'),
      limit(PAGE_SIZE)
    );
  }, [uid]);

  const hydrateMatches = useCallback(
    async (swipes: SwipeDoc[]): Promise<MatchRow[]> => {
      // Validate reverse right swipe exists
      const candidates = swipes.map((s) => s.targetUid).filter(Boolean) as string[];
      const confirmed: { uid: string; matchedAt?: Timestamp | null }[] = [];

      await Promise.all(
        candidates.map(async (other) => {
          try {
            const reverseId = `${other}_${uid}`;
            const s = await getDoc(doc(db, 'swipes', reverseId));
            const sd = (s.data() as SwipeDoc) || undefined;
            if (s.exists() && sd?.direction === 'right') {
              const mySwipe = swipes.find((w) => w.targetUid === other);
              confirmed.push({ uid: other, matchedAt: mySwipe?.createdAt ?? null });
            }
          } catch {
            // ignore
          }
        })
      );

      // Hydrate user profiles (chunked IN queries when available)
      const map = new Map<string, UserDoc | null>();
      const chunks = chunk(confirmed.map((c) => c.uid), 10);
      for (const group of chunks) {
        try {
          const snap = await getDocs(
            query(collection(db, 'users'), where('__name__', 'in', group as string[]))
          );
          snap.docs.forEach((d) => map.set(d.id, (d.data() as UserDoc) ?? null));
        } catch {
          // fallback: individual gets
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

      return confirmed.map((c) => ({ uid: c.uid, profile: map.get(c.uid) ?? null, matchedAt: c.matchedAt }));
    },
    [uid]
  );

  const loadInitial = useCallback(async (): Promise<void> => {
    if (!myRightSwipesQ) {
      setRows([]);
      setCursor(null);
      setHasMore(false);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const snap = await getDocs(myRightSwipesQ);
      const swipes: SwipeDoc[] = snap.docs.map((d) => (d.data() as SwipeDoc) ?? {});
      const matches = await hydrateMatches(swipes);
      setRows(matches);
      const last = snap.docs[snap.docs.length - 1] ?? null;
      setCursor(last);
      setHasMore(Boolean(last) && snap.docs.length === PAGE_SIZE);
    } catch (e) {
      console.warn('[matches] initial load error:', e);
      setRows([]);
      setCursor(null);
      setHasMore(false);
    } finally {
      setLoading(false);
    }
  }, [myRightSwipesQ, hydrateMatches]);

  const loadMore = useCallback(async (): Promise<void> => {
    if (!uid || !cursor || !hasMore || loadingMore) return;
    setLoadingMore(true);
    try {
      const qMore = query(
        collection(db, 'swipes'),
        where('actorUid', '==', uid),
        where('direction', '==', 'right'),
        orderBy('createdAt', 'desc'),
        startAfter(cursor),
        limit(PAGE_SIZE)
      );
      const snap = await getDocs(qMore);
      const swipes: SwipeDoc[] = snap.docs.map((d) => (d.data() as SwipeDoc) ?? {});
      const more = await hydrateMatches(swipes);
      setRows((prev) => [...prev, ...more]);
      const last = snap.docs[snap.docs.length - 1] ?? null;
      setCursor(last);
      setHasMore(Boolean(last) && snap.docs.length === PAGE_SIZE);
    } catch (e) {
      console.warn('[matches] load more error:', e);
      setHasMore(false);
    } finally {
      setLoadingMore(false);
    }
  }, [uid, cursor, hasMore, loadingMore, hydrateMatches]);

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

  const openChat = useCallback(
    (otherUid: string) => {
      const path = `/socials/chats/${otherUid}`;
      router.push(path as any);
    },
    [router]
  );

  const unmatch = useCallback(
    async (otherUid: string) => {
      if (!uid) return;
      setUnmatching((s) => ({ ...s, [otherUid]: true }));
      try {
        // Remove both swipe docs; chat clean-up (if any) can be handled by backend rules/cron.
        await Promise.allSettled([
          deleteDoc(doc(db, 'swipes', `${uid}_${otherUid}`)),
          deleteDoc(doc(db, 'swipes', `${otherUid}_${uid}`)),
        ]);
        setRows((prev) => prev.filter((r) => r.uid !== otherUid));
      } catch (e) {
        console.warn('[matches] unmatch error:', e);
      } finally {
        setUnmatching((s) => ({ ...s, [otherUid]: false }));
      }
    },
    [uid]
  );

  // Guards
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
        <Text style={styles.muted}>You’re signed out. Please log in to view matches.</Text>
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
        <MatchCard
          row={item}
          onMessage={() => openChat(item.uid)}
          onUnmatch={() => unmatch(item.uid)}
          busy={!!unmatching[item.uid]}
        />
      )}
      contentContainerStyle={{ padding: 14, paddingBottom: 28, gap: 10 }}
      ListHeaderComponent={
        <View style={{ marginBottom: 4 }}>
          <Text style={styles.screenTitle}>Matches</Text>
        </View>
      }
      ListEmptyComponent={
        !loading ? (
          <View style={styles.empty}>
            <Text style={styles.muted}>No matches yet. Keep swiping ♥</Text>
          </View>
        ) : null
      }
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#fff" />}
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
function MatchCard({
  row,
  onMessage,
  onUnmatch,
  busy,
}: {
  row: MatchRow;
  onMessage: () => void;
  onUnmatch: () => void;
  busy: boolean;
}): React.ReactElement {
  const title = row.profile?.displayName || row.profile?.username || 'User';
  const where = [row.profile?.city ?? undefined, row.profile?.country ?? undefined].filter(Boolean).join(', ');
  return (
    <View style={styles.card}>
      <View style={styles.row}>
        <View style={styles.avatarWrap}>
          {row.profile?.photoURL ? (
            <Image source={{ uri: row.profile.photoURL }} style={styles.avatar} />
          ) : (
            <View style={[styles.avatar, styles.avatarFallbackBg]}>
              <Text style={styles.avatarFallback}>{(title?.[0] ?? '?').toUpperCase()}</Text>
            </View>
          )}
        </View>

        <View style={{ flex: 1, gap: 2 }}>
          <Text style={styles.name} numberOfLines={1}>
            {title}
          </Text>
          {!!row.profile?.username && (
            <Text style={styles.username} numberOfLines={1}>
              @{row.profile.username}
            </Text>
          )}
          <Text style={styles.metaMuted} numberOfLines={1}>
            {where || 'Nearby'} {row.matchedAt ? `• matched ${timeAgo(row.matchedAt)} ago` : ''}
          </Text>
        </View>
      </View>

      <View style={styles.actionsRow}>
        <Pressable onPress={onMessage} style={({ pressed }) => [styles.btn, pressed && { opacity: 0.95 }]}>
          <Text style={styles.btnText}>Message</Text>
        </Pressable>
        <Pressable
          onPress={onUnmatch}
          disabled={busy}
          style={({ pressed }) => [styles.btnDanger, (pressed || busy) && { opacity: 0.9 }]}
        >
          <Text style={styles.btnDangerText}>{busy ? 'Unmatching…' : 'Unmatch'}</Text>
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
  muted: {
    fontFamily: 'Inter_400Regular',
    color: '#cbd5e1',
    fontSize: 13,
    textAlign: 'center',
  },
  empty: {
    padding: 24,
    alignItems: 'center',
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
    width: 56,
    height: 56,
    borderRadius: 999,
    overflow: 'hidden',
    backgroundColor: '#0f0f0f',
  },
  avatar: {
    width: '100%',
    height: '100%',
    borderRadius: 999,
  },
  avatarFallbackBg: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0f0f0f',
  },
  avatarFallback: {
    fontFamily: 'Inter_700Bold',
    color: '#fff',
    fontSize: 16,
  },

  name: {
    fontFamily: 'Inter_700Bold',
    color: '#fff',
    fontSize: 16,
  },
  username: {
    fontFamily: 'Inter_400Regular',
    color: '#cbd5e1',
    fontSize: 12,
  },
  metaMuted: {
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
    minWidth: 120,
  },
  btnText: {
    fontFamily: 'Inter_700Bold',
    color: '#e5e7eb',
    fontSize: 14,
  },
  btnDanger: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,75,75,0.6)',
    backgroundColor: 'rgba(255,0,0,0.10)',
    alignItems: 'center',
    minWidth: 120,
  },
  btnDangerText: {
    fontFamily: 'Inter_700Bold',
    color: '#ff6b6b',
    fontSize: 14,
  },

  // Login guard button
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
});
