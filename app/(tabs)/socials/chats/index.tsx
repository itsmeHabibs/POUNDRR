// File: app/(tabs)/socials/chats/index.tsx
// Rules followed:
// - No top-level imports from 'firebase/auth'.
// - Firestore at module scope is OK; only used inside effects/handlers.
// - Uses useAuthUid(); no hooks at module scope.
// - Default export a React component; strict-friendly TS; FlatList perf flags included.

import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  startAfter,
  where,
} from 'firebase/firestore';

type UserDoc = {
  displayName?: string | null;
  username?: string | null;
  photoURL?: string | null;
};

type ChatDoc = {
  participants: string[]; // [uidA, uidB]
  lastMessage?: string | null;
  updatedAt?: Timestamp | null;
};

type ChatRow = {
  id: string;
  otherUid: string;
  other?: UserDoc | null;
  lastMessage?: string | null;
  updatedAt?: Timestamp | null;
};

const RED = '#f70000';
const CARD_BG = 'rgba(0,0,0,0.82)';
const BORDER = 'rgba(255,255,255,0.14)';
const PAGE_SIZE = 25;

/* ---------- helpers ---------- */
function timeAgo(ts?: Timestamp | null): string {
  if (!ts) return '';
  try {
    const d = ts.toDate().getTime();
    const now = Date.now();
    const diff = Math.max(0, now - d);
    const m = Math.floor(diff / 60000);
    if (m < 1) return 'now';
    if (m < 60) return `${m}m`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h`;
    const days = Math.floor(h / 24);
    if (days < 7) return `${days}d`;
    const weeks = Math.floor(days / 7);
    return `${weeks}w`;
  } catch {
    return '';
  }
}

/* ---------- screen ---------- */
export default function ChatsIndexScreen(): React.ReactElement {
  const router = useRouter();
  const { uid, error: authErr } = useAuthUid();

  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);

  const [rows, setRows] = useState<ChatRow[]>([]);
  const [cursor, setCursor] = useState<QueryDocumentSnapshot | null>(null);
  const [hasMore, setHasMore] = useState<boolean>(true);
  const [loadingMore, setLoadingMore] = useState<boolean>(false);

  const unsubRef = useRef<null | (() => void)>(null);

  const baseQuery = useMemo(() => {
    if (!uid) return null;
    return query(
      collection(db, 'chats'),
      where('participants', 'array-contains', uid),
      orderBy('updatedAt', 'desc'),
      limit(PAGE_SIZE)
    );
  }, [uid]);

  // Resolve counterpart profile for each chat row
  const hydrateOthers = useCallback(
    async (docs: { id: string; data: ChatDoc }[]): Promise<ChatRow[]> => {
      const rowsDraft: ChatRow[] = docs.map(({ id, data }) => {
        const otherUid = (data.participants || []).find((p) => p !== uid) || '';
        return {
          id,
          otherUid,
          other: undefined,
          lastMessage: data.lastMessage ?? null,
          updatedAt: data.updatedAt ?? null,
        };
      });

      // Collect unique other UIDs
      const unique = Array.from(new Set(rowsDraft.map((r) => r.otherUid).filter(Boolean)));
      // Fetch profiles individually (keeps indexes simple)
      const map = new Map<string, UserDoc | null>();
      await Promise.all(
        unique.map(async (id) => {
          try {
            const s = await getDoc(doc(db, 'users', id));
            map.set(id, s.exists() ? ((s.data() as UserDoc) ?? null) : null);
          } catch {
            map.set(id, null);
          }
        })
      );

      return rowsDraft.map((r) => ({ ...r, other: map.get(r.otherUid) ?? null }));
    },
    [uid]
  );

  // Realtime subscribe to first page
  useEffect(() => {
    if (unsubRef.current) {
      unsubRef.current();
      unsubRef.current = null;
    }
    if (!baseQuery) {
      setLoading(false);
      setRows([]);
      setCursor(null);
      setHasMore(false);
      return;
    }
    setLoading(true);
    const unsub = onSnapshot(
      baseQuery,
      async (snap) => {
        const docs = snap.docs.map((d) => ({ id: d.id, data: d.data() as ChatDoc }));
        const hydrated = await hydrateOthers(docs);
        setRows(hydrated);
        const last = snap.docs[snap.docs.length - 1] ?? null;
        setCursor(last);
        setHasMore(Boolean(last) && snap.docs.length === PAGE_SIZE);
        setLoading(false);
      },
      (err) => {
        console.warn('[chats] subscribe error:', err);
        setLoading(false);
      }
    );
    unsubRef.current = unsub;
    return () => {
      unsub();
      unsubRef.current = null;
    };
  }, [baseQuery, hydrateOthers]);

  const loadMore = useCallback(async (): Promise<void> => {
    if (!uid || !cursor || !hasMore || loadingMore) return;
    setLoadingMore(true);
    try {
      const qMore = query(
        collection(db, 'chats'),
        where('participants', 'array-contains', uid),
        orderBy('updatedAt', 'desc'),
        startAfter(cursor),
        limit(PAGE_SIZE)
      );
      const snap = await getDocs(qMore);
      const docs = snap.docs.map((d) => ({ id: d.id, data: d.data() as ChatDoc }));
      const more = await hydrateOthers(docs);
      setRows((prev) => [...prev, ...more]);
      const last = snap.docs[snap.docs.length - 1] ?? null;
      setCursor(last);
      setHasMore(Boolean(last) && snap.docs.length === PAGE_SIZE);
    } catch (e) {
      console.warn('[chats] load more error:', e);
      setHasMore(false);
    } finally {
      setLoadingMore(false);
    }
  }, [uid, cursor, hasMore, loadingMore, hydrateOthers]);

  const onRefresh = useCallback(async (): Promise<void> => {
    setRefreshing(true);
    try {
      // Re-run the base subscription callback by briefly unsubscribing/resubscribing.
      if (unsubRef.current) {
        unsubRef.current();
        unsubRef.current = null;
      }
      // Force one-time fetch for freshness
      if (baseQuery) {
        const snap = await getDocs(baseQuery);
        const docs = snap.docs.map((d) => ({ id: d.id, data: d.data() as ChatDoc }));
        const hydrated = await hydrateOthers(docs);
        setRows(hydrated);
        const last = snap.docs[snap.docs.length - 1] ?? null;
        setCursor(last);
        setHasMore(Boolean(last) && snap.docs.length === PAGE_SIZE);
      }
    } catch (e) {
      console.warn('[chats] refresh error:', e);
    } finally {
      // Re-subscribe
      if (baseQuery) {
        const unsub = onSnapshot(baseQuery, async (snap) => {
          const docs = snap.docs.map((d) => ({ id: d.id, data: d.data() as ChatDoc }));
          const hydrated = await hydrateOthers(docs);
          setRows(hydrated);
          const last = snap.docs[snap.docs.length - 1] ?? null;
          setCursor(last);
          setHasMore(Boolean(last) && snap.docs.length === PAGE_SIZE);
        });
        unsubRef.current = unsub;
      }
      setRefreshing(false);
    }
  }, [baseQuery, hydrateOthers]);

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
        <Text style={styles.muted}>You’re signed out. Please log in to view your chats.</Text>
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
      keyExtractor={(it) => it.id}
      renderItem={({ item }) => (
        <ChatListRow
          row={item}
          onPress={() => router.push(`/socials/chats/${item.otherUid}`)}
        />
      )}
      contentContainerStyle={{ padding: 14, paddingBottom: 24, gap: 10 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#fff" />}
      onEndReachedThreshold={0.4}
      onEndReached={() => {
        if (!loading && !refreshing) void loadMore();
      }}
      ListHeaderComponent={
        <View style={{ marginBottom: 4 }}>
          <Text style={styles.screenTitle}>Chats</Text>
        </View>
      }
      ListEmptyComponent={
        !loading ? (
          <View style={styles.empty}>
            <Text style={styles.muted}>No conversations yet.</Text>
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
      windowSize={9}
      maxToRenderPerBatch={24}
      initialNumToRender={24}
    />
  );
}

/* ---------- row component ---------- */
function ChatListRow({
  row,
  onPress,
}: {
  row: ChatRow;
  onPress: () => void;
}): React.ReactElement {
  const title = row.other?.displayName || row.other?.username || 'User';
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.card, pressed && { opacity: 0.95 }]}>
      <View style={styles.row}>
        <View style={styles.avatarWrap}>
          {row.other?.photoURL ? (
            <Image source={{ uri: row.other.photoURL }} style={styles.avatar} />
          ) : (
            <View style={[styles.avatar, styles.avatarFallbackBg]}>
              <Text style={styles.avatarFallback}>{(title?.[0] ?? '?').toUpperCase()}</Text>
            </View>
          )}
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.name} numberOfLines={1}>
            {title}
          </Text>
          {!!row.lastMessage && (
            <Text style={styles.preview} numberOfLines={1}>
              {row.lastMessage}
            </Text>
          )}
        </View>
        <View style={{ alignItems: 'flex-end', minWidth: 40 }}>
          <Text style={styles.time}>{timeAgo(row.updatedAt)}</Text>
        </View>
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
  muted: {
    fontFamily: 'Inter_400Regular',
    color: '#cbd5e1',
    fontSize: 13,
    textAlign: 'center',
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
    width: 48,
    height: 48,
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
    fontSize: 14,
  },
  name: {
    fontFamily: 'Inter_700Bold',
    color: '#fff',
    fontSize: 15,
  },
  preview: {
    marginTop: 2,
    fontFamily: 'Inter_400Regular',
    color: '#cbd5e1',
    fontSize: 12,
  },
  time: {
    fontFamily: 'Inter_400Regular',
    color: '#9ca3af',
    fontSize: 11,
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
