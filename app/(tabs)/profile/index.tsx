// File: app/(tabs)/profile/index.tsx
// Rules followed:
// - No top-level imports from 'firebase/auth'.
// - Firestore at module scope is OK.
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

import { db } from '@/firebase';
import { useAuthUid } from '@/hooks/useAuthUid';

import {
  QueryDocumentSnapshot,
  Timestamp,
  collection,
  doc,
  limit as fsLimit,
  query as fsQuery,
  getCountFromServer,
  getDoc,
  getDocs,
  orderBy,
  startAfter,
  where,
} from 'firebase/firestore';

type UserDoc = {
  displayName?: string | null;
  username?: string | null;
  photoURL?: string | null;
  bio?: string | null;
  city?: string | null;
  country?: string | null;
  createdAt?: Timestamp | null;
};

type HighlightDoc = {
  ownerUid?: string;
  thumbnailUrl?: string | null;
  createdAt?: Timestamp | null;
};

type HighlightRow = HighlightDoc & { id: string };

const RED = '#f70000';
const CARD_BG = 'rgba(0,0,0,0.82)';
const BORDER = 'rgba(255,255,255,0.14)';
const PAGE_SIZE = 21; // 3 x 7 grid cells

function formatDate(ts?: Timestamp | null): string | undefined {
  if (!ts) return undefined;
  try {
    const d = ts.toDate();
    return d.toLocaleDateString();
  } catch {
    return undefined;
  }
}

export default function ProfileIndexScreen(): React.ReactElement {
  const router = useRouter();
  const { uid, error: authErr } = useAuthUid();

  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);

  // Profile
  const [user, setUser] = useState<UserDoc | null>(null);

  // Counts
  const [followersCount, setFollowersCount] = useState<number | null>(null);
  const [followingCount, setFollowingCount] = useState<number | null>(null);
  const [highlightsCount, setHighlightsCount] = useState<number | null>(null);

  // Highlights grid (recent)
  const [items, setItems] = useState<HighlightRow[]>([]);
  const [cursor, setCursor] = useState<QueryDocumentSnapshot | null>(null);
  const [hasMore, setHasMore] = useState<boolean>(true);
  const [loadingMore, setLoadingMore] = useState<boolean>(false);

  const userRef = useMemo(() => (uid ? doc(db, 'users', uid) : null), [uid]);

  const recentHighlightsQuery = useMemo(() => {
    if (!uid) return null;
    return fsQuery(
      collection(db, 'highlights'),
      where('ownerUid', '==', uid),
      orderBy('createdAt', 'desc'),
      fsLimit(PAGE_SIZE)
    );
  }, [uid]);

  const loadProfile = useCallback(async (): Promise<void> => {
    if (!userRef) {
      setUser(null);
      return;
    }
    try {
      const snap = await getDoc(userRef);
      setUser(snap.exists() ? ((snap.data() as UserDoc) ?? null) : null);
    } catch (e) {
      console.warn('[profile] loadProfile error:', e);
      setUser(null);
    }
  }, [userRef]);

  const loadCounts = useCallback(async (): Promise<void> => {
    if (!uid) {
      setFollowersCount(null);
      setFollowingCount(null);
      setHighlightsCount(null);
      return;
    }
    try {
      const followersAgg = await getCountFromServer(
        fsQuery(collection(db, 'follows'), where('followeeUid', '==', uid))
      );
      setFollowersCount(Number(followersAgg.data().count ?? 0));
    } catch (e) {
      console.warn('[profile] followers count error:', e);
      setFollowersCount(null);
    }
    try {
      const followingAgg = await getCountFromServer(
        fsQuery(collection(db, 'follows'), where('followerUid', '==', uid))
      );
      setFollowingCount(Number(followingAgg.data().count ?? 0));
    } catch (e) {
      console.warn('[profile] following count error:', e);
      setFollowingCount(null);
    }
    try {
      const highlightsAgg = await getCountFromServer(
        fsQuery(collection(db, 'highlights'), where('ownerUid', '==', uid))
      );
      setHighlightsCount(Number(highlightsAgg.data().count ?? 0));
    } catch (e) {
      console.warn('[profile] highlights count error:', e);
      setHighlightsCount(null);
    }
  }, [uid]);

  const loadHighlightsInitial = useCallback(async (): Promise<void> => {
    if (!recentHighlightsQuery) {
      setItems([]);
      setCursor(null);
      setHasMore(false);
      return;
    }
    try {
      const snap = await getDocs(recentHighlightsQuery);
      const rows: HighlightRow[] = snap.docs.map((d) => ({ id: d.id, ...(d.data() as HighlightDoc) }));
      setItems(rows);
      const last = snap.docs[snap.docs.length - 1] ?? null;
      setCursor(last);
      setHasMore(Boolean(last) && snap.docs.length === PAGE_SIZE);
    } catch (e) {
      console.warn('[profile] loadHighlights initial error:', e);
      setItems([]);
      setCursor(null);
      setHasMore(false);
    }
  }, [recentHighlightsQuery]);

  const loadMore = useCallback(async (): Promise<void> => {
    if (!uid || !cursor || !hasMore || loadingMore) return;
    setLoadingMore(true);
    try {
      const qMore = fsQuery(
        collection(db, 'highlights'),
        where('ownerUid', '==', uid),
        orderBy('createdAt', 'desc'),
        startAfter(cursor),
        fsLimit(PAGE_SIZE)
      );
      const snap = await getDocs(qMore);
      const more: HighlightRow[] = snap.docs.map((d) => ({ id: d.id, ...(d.data() as HighlightDoc) }));
      setItems((prev) => [...prev, ...more]);
      const last = snap.docs[snap.docs.length - 1] ?? null;
      setCursor(last);
      setHasMore(Boolean(last) && snap.docs.length === PAGE_SIZE);
    } catch (e) {
      console.warn('[profile] loadHighlights more error:', e);
      setHasMore(false);
    } finally {
      setLoadingMore(false);
    }
  }, [uid, cursor, hasMore, loadingMore]);

  const loadAll = useCallback(async (): Promise<void> => {
    setLoading(true);
    await Promise.all([loadProfile(), loadCounts(), loadHighlightsInitial()]);
    setLoading(false);
  }, [loadProfile, loadCounts, loadHighlightsInitial]);

  useEffect(() => {
    if (uid === null) return; // wait for auth hook to resolve
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

  // Navigation helpers
  const goSettings = useCallback(() => router.push('/profile/settings'), [router]);
  const goFollowers = useCallback(() => router.push('/profile/followers'), [router]);
  const goFollowing = useCallback(() => router.push('/profile/following'), [router]);
  const goTickets = useCallback(() => router.push('/poundrr/events/my-tickets'), [router]);

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
        <Text style={styles.muted}>You’re signed out. Please log in to view your profile.</Text>
        <Pressable
          onPress={() => router.replace('/login')}
          style={({ pressed }) => [styles.btnPrimary, pressed && { opacity: 0.9 }]}
        >
          <Text style={styles.btnPrimaryText}>Go to Login</Text>
        </Pressable>
      </View>
    );
  }

  if (loading && items.length === 0) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#fff" />
      </View>
    );
  }

  const displayName = user?.displayName || user?.username || 'Your profile';
  const handle = user?.username ? `@${user.username}` : undefined;
  const whereLabel = [user?.city ?? undefined, user?.country ?? undefined].filter(Boolean).join(', ');
  const joined = formatDate(user?.createdAt);

  return (
    <FlatList
      data={items}
      keyExtractor={(it) => it.id}
      numColumns={3}
      renderItem={({ item }) => <HighlightCell row={item} />}
      columnWrapperStyle={{ gap: 8, paddingHorizontal: 14 }}
      contentContainerStyle={{ paddingTop: 14, paddingBottom: 28, gap: 12 }}
      ListHeaderComponent={
        <View style={styles.headerCard}>
          <View style={styles.headerRow}>
            <View style={styles.avatarWrap}>
              {user?.photoURL ? (
                <Image source={{ uri: user.photoURL }} style={styles.avatar} />
              ) : (
                <View
                  style={[
                    styles.avatar,
                    { alignItems: 'center', justifyContent: 'center', backgroundColor: '#0f0f0f' },
                  ]}
                >
                  <Text style={styles.avatarFallback}>
                    {(displayName?.[0] ?? '?').toUpperCase()}
                  </Text>
                </View>
              )}
            </View>
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={styles.name} numberOfLines={1}>
                {displayName}
              </Text>
              {!!handle && (
                <Text style={styles.username} numberOfLines={1}>
                  {handle}
                </Text>
              )}
              {!!whereLabel && <Text style={styles.metaMuted}>{whereLabel}</Text>}
              {!!joined && <Text style={styles.metaMuted}>Joined {joined}</Text>}
            </View>
          </View>

          <View style={styles.statsRow}>
            <ProfileStat label="Followers" value={followersCount ?? 0} onPress={goFollowers} />
            <ProfileStat label="Following" value={followingCount ?? 0} onPress={goFollowing} />
            <ProfileStat label="Highlights" value={highlightsCount ?? 0} />
          </View>

          <View style={styles.actionsRow}>
            <Pressable onPress={goSettings} style={({ pressed }) => [styles.btn, pressed && { opacity: 0.95 }]}>
              <Text style={styles.btnText}>Settings</Text>
            </Pressable>
            <Pressable onPress={goTickets} style={({ pressed }) => [styles.btn, pressed && { opacity: 0.95 }]}>
              <Text style={styles.btnText}>My Tickets</Text>
            </Pressable>
          </View>

          {!!user?.bio && (
            <>
              <View style={styles.divider} />
              <Text style={styles.bio}>{user.bio}</Text>
            </>
          )}

          <View style={styles.subHeaderRow}>
            <Text style={styles.subHeaderText}>Your highlights</Text>
          </View>
        </View>
      }
      ListEmptyComponent={
        !loading ? (
          <View style={styles.empty}>
            <Text style={styles.muted}>You haven’t posted any highlights yet.</Text>
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
          <View style={{ paddingVertical: 14 }}>
            <ActivityIndicator color="#fff" />
          </View>
        ) : null
      }
      removeClippedSubviews
      windowSize={9}
      maxToRenderPerBatch={27}
      initialNumToRender={27}
    />
  );
}

/* ---------- small components ---------- */
function ProfileStat({
  label,
  value,
  onPress,
}: {
  label: string;
  value: number;
  onPress?: () => void;
}): React.ReactElement {
  const inner = (
    <View style={styles.statBox}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
  if (onPress) {
    return (
      <Pressable onPress={onPress} style={({ pressed }) => [styles.statTap, pressed && { opacity: 0.9 }]}>
        {inner}
      </Pressable>
    );
  }
  return inner;
}

function HighlightCell({ row }: { row: HighlightRow }): React.ReactElement {
  return (
    <View style={styles.cell}>
      {row.thumbnailUrl ? (
        <Image source={{ uri: row.thumbnailUrl }} style={styles.cellImage} />
      ) : (
        <View
          style={[
            styles.cellImage,
            { alignItems: 'center', justifyContent: 'center', backgroundColor: '#0f0f0f' },
          ]}
        >
          <Text style={styles.cellFallback}>HIGHLIGHT</Text>
        </View>
      )}
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

  headerCard: {
    backgroundColor: CARD_BG,
    borderRadius: 12,
    marginHorizontal: 14,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderTopWidth: 3,
    borderTopColor: RED,
    gap: 10,
  },
  headerRow: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
  },
  avatarWrap: {
    width: 72,
    height: 72,
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
    fontSize: 18,
  },
  name: {
    fontFamily: 'Inter_700Bold',
    color: '#fff',
    fontSize: 18,
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
  statsRow: {
    marginTop: 4,
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'space-between',
  },
  statTap: { flex: 1 },
  statBox: {
    flex: 1,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    backgroundColor: 'rgba(0,0,0,0.25)',
    alignItems: 'center',
    paddingVertical: 10,
  },
  statValue: {
    fontFamily: 'Inter_700Bold',
    color: '#fff',
    fontSize: 16,
  },
  statLabel: {
    marginTop: 2,
    fontFamily: 'Inter_400Regular',
    color: '#cbd5e1',
    fontSize: 12,
  },
  actionsRow: {
    marginTop: 4,
    flexDirection: 'row',
    gap: 8,
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
  divider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.12)',
    marginTop: 6,
  },
  bio: {
    marginTop: 8,
    fontFamily: 'Inter_400Regular',
    color: '#e5e7eb',
    fontSize: 13,
  },
  subHeaderRow: {
    marginTop: 6,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  subHeaderText: {
    fontFamily: 'Inter_700Bold',
    color: '#fff',
    fontSize: 14,
  },

  // grid cells
  cell: {
    flex: 1,
    aspectRatio: 1,
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: 'rgba(0,0,0,0.25)',
    marginBottom: 8,
  },
  cellImage: {
    width: '100%',
    height: '100%',
  },
  cellFallback: {
    fontFamily: 'Inter_700Bold',
    color: '#fff',
    fontSize: 10,
    letterSpacing: 1,
  },

  empty: {
    padding: 18,
    alignItems: 'center',
  },
});
