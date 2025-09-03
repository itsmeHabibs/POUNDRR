// File: app/(tabs)/socials/index.tsx
// Rules followed:
// - No top-level imports from 'firebase/auth' (we use useAuthUid for auth state).
// - Firestore usage is fine at module scope; all calls done in effects/handlers.
// - Default export a React component; TS strict-friendly; list perf flags included.

import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { db } from '@/firebase';
import { useAuthUid } from '@/hooks/useAuthUid';

import {
  Timestamp,
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  where,
} from 'firebase/firestore';

type UserDoc = {
  displayName?: string | null;
  username?: string | null;
  photoURL?: string | null;
  createdAt?: Timestamp | any;
};

type ChatDoc = {
  participants: string[];
  lastMessage?: string | null;
  updatedAt?: Timestamp | null;
};

type ChatRow = {
  otherUid: string;
  other?: UserDoc | null;
  lastMessage?: string | null;
  updatedAt?: Timestamp | null;
};

type SuggestRow = {
  uid: string;
  profile: UserDoc | null;
};

const RED = '#f70000';
const CARD_BG = 'rgba(0,0,0,0.82)';
const BORDER = 'rgba(255,255,255,0.14)';

/* ----------------- helpers ----------------- */
function timeAgo(ts?: Timestamp | null): string {
  if (!ts) return '';
  try {
    const d = ts.toDate().getTime();
    const diff = Date.now() - d;
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

/* ----------------- screen ----------------- */
export default function SocialsHubScreen(): React.ReactElement {
  const router = useRouter();
  const { uid, error: authErr } = useAuthUid();

  // Recent chats
  const [chats, setChats] = useState<ChatRow[]>([]);
  const [loadingChats, setLoadingChats] = useState<boolean>(true);

  // Suggestions
  const [suggestions, setSuggestions] = useState<SuggestRow[]>([]);
  const [loadingPeople, setLoadingPeople] = useState<boolean>(true);

  // Following set to disable Follow button
  const [followingSet, setFollowingSet] = useState<Set<string>>(new Set());
  const [followBusy, setFollowBusy] = useState<Record<string, boolean>>({});

  const chatsQ = useMemo(() => {
    if (!uid) return null;
    return query(
      collection(db, 'chats'),
      where('participants', 'array-contains', uid),
      orderBy('updatedAt', 'desc'),
      limit(10)
    );
  }, [uid]);

  // Load recent chats
  useEffect(() => {
    (async () => {
      if (!uid || !chatsQ) {
        setChats([]);
        setLoadingChats(false);
        return;
      }
      setLoadingChats(true);
      try {
        const snap = await getDocs(chatsQ);
        const rows: ChatRow[] = [];
        const needUserIds = new Set<string>();
        snap.docs.forEach((d) => {
          const data = (d.data() as ChatDoc) ?? {};
          const otherUid = (data.participants || []).find((p) => p !== uid);
          if (!otherUid) return;
          rows.push({
            otherUid,
            lastMessage: data.lastMessage ?? null,
            updatedAt: data.updatedAt ?? null,
          });
          needUserIds.add(otherUid);
        });
        // hydrate
        const map = new Map<string, UserDoc | null>();
        await Promise.all(
          Array.from(needUserIds).map(async (id) => {
            try {
              const s = await getDoc(doc(db, 'users', id));
              map.set(id, s.exists() ? ((s.data() as UserDoc) ?? null) : null);
            } catch {
              map.set(id, null);
            }
          })
        );
        setChats(rows.map((r) => ({ ...r, other: map.get(r.otherUid) ?? null })));
      } catch (e) {
        console.warn('[socials] load chats error:', e);
        setChats([]);
      } finally {
        setLoadingChats(false);
      }
    })();
  }, [uid, chatsQ]);

  // Load suggestions (latest users)
  useEffect(() => {
    (async () => {
      if (!uid) {
        setSuggestions([]);
        setLoadingPeople(false);
        return;
      }
      setLoadingPeople(true);
      try {
        // Load who I'm already following (to disable button)
        const myFollowingSnap = await getDocs(
          query(collection(db, 'follows'), where('followerUid', '==', uid), limit(500))
        );
        const set = new Set<string>();
        myFollowingSnap.docs.forEach((d) => {
          const f = d.data() as { followeeUid?: string };
          if (f?.followeeUid) set.add(f.followeeUid);
        });
        setFollowingSet(set);

        // Fetch newest users
        const snap = await getDocs(
          query(collection(db, 'users')), // some projects might lack composite index for orderBy(createdAt); keep simple
        );

        // naive: take first ~50, then sort by createdAt desc in-memory, filter out self
        const rowsAll = snap.docs.map((d) => ({ uid: d.id, profile: (d.data() as UserDoc) ?? null }));
        rowsAll.sort((a, b) => {
          const ta = a.profile?.createdAt?.toMillis?.() ?? 0;
          const tb = b.profile?.createdAt?.toMillis?.() ?? 0;
          return tb - ta;
        });
        const filtered = rowsAll.filter((r) => r.uid !== uid).slice(0, 50);
        setSuggestions(filtered);
      } catch (e) {
        console.warn('[socials] suggestions error:', e);
        setSuggestions([]);
      } finally {
        setLoadingPeople(false);
      }
    })();
  }, [uid]);

  const openChat = useCallback(
    (otherUid: string) => {
      router.push(`/socials/chats/${otherUid}`);
    },
    [router]
  );

  const followUser = useCallback(
    async (targetUid: string) => {
      if (!uid || !targetUid || targetUid === uid) return;
      if (followingSet.has(targetUid)) return;
      setFollowBusy((b) => ({ ...b, [targetUid]: true }));
      try {
        const id = `${uid}_${targetUid}`;
        await setDoc(
          doc(db, 'follows', id),
          {
            followerUid: uid,
            followeeUid: targetUid,
            createdAt: serverTimestamp(),
          },
          { merge: true }
        );
        setFollowingSet((prev) => new Set(prev).add(targetUid));
      } catch (e) {
        console.warn('[socials] follow error:', e);
      } finally {
        setFollowBusy((b) => ({ ...b, [targetUid]: false }));
      }
    },
    [uid, followingSet]
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
        <Text style={styles.muted}>You’re signed out. Please log in to use socials.</Text>
        <Pressable
          onPress={() => router.replace('/login')}
          style={({ pressed }) => [styles.btnPrimary, pressed && { opacity: 0.9 }]}
        >
          <Text style={styles.btnPrimaryText}>Go to Login</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <FlatList
      data={suggestions}
      keyExtractor={(it) => it.uid}
      renderItem={({ item }) => (
        <SuggestRowItem
          row={item}
          isFollowing={followingSet.has(item.uid)}
          busy={!!followBusy[item.uid]}
          onFollow={() => followUser(item.uid)}
          onMessage={() => openChat(item.uid)}
        />
      )}
      ListHeaderComponent={
        <View style={{ paddingHorizontal: 14, paddingTop: 14, paddingBottom: 10, gap: 12 }}>
          <Text style={styles.screenTitle}>Social</Text>

          {/* Quick actions */}
          <View style={styles.card}>
            <View style={styles.quickRow}>
              <Pressable
                onPress={() => router.push('/(modals)/story-upload')}
                style={({ pressed }) => [styles.btn, pressed && { opacity: 0.95 }]}
              >
                <Text style={styles.btnText}>Post story</Text>
              </Pressable>
              <Pressable
                onPress={() => router.push('/(modals)/highlight-upload')}
                style={({ pressed }) => [styles.btn, pressed && { opacity: 0.95 }]}
              >
                <Text style={styles.btnText}>Upload highlight</Text>
              </Pressable>
              <Pressable
                onPress={() => router.push('/socials/chats')}
                style={({ pressed }) => [styles.btn, pressed && { opacity: 0.95 }]}
              >
                <Text style={styles.btnText}>Open chats</Text>
              </Pressable>
            </View>
          </View>

          {/* Recent chats */}
          <View style={styles.card}>
            <Text style={styles.sectionHeader}>Recent chats</Text>
            <View style={styles.divider} />
            {loadingChats ? (
              <ActivityIndicator color="#fff" />
            ) : chats.length === 0 ? (
              <Text style={styles.muted}>No conversations yet.</Text>
            ) : (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ paddingVertical: 6, gap: 12 }}
              >
                {chats.map((c) => {
                  const title = c.other?.displayName || c.other?.username || 'User';
                  return (
                    <Pressable
                      key={c.otherUid}
                      onPress={() => openChat(c.otherUid)}
                      style={({ pressed }) => [styles.pill, pressed && { opacity: 0.95 }]}
                    >
                      <View style={styles.pillAvatarWrap}>
                        {c.other?.photoURL ? (
                          <Image source={{ uri: c.other.photoURL }} style={styles.pillAvatar} />
                        ) : (
                          <View style={[styles.pillAvatar, styles.avatarFallbackBg]}>
                            <Text style={styles.avatarFallback}>{(title?.[0] ?? '?').toUpperCase()}</Text>
                          </View>
                        )}
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.pillTitle} numberOfLines={1}>
                          {title}
                        </Text>
                        <Text style={styles.pillSub} numberOfLines={1}>
                          {c.lastMessage || 'Say hi'} • {timeAgo(c.updatedAt)}
                        </Text>
                      </View>
                    </Pressable>
                  );
                })}
              </ScrollView>
            )}
          </View>

          <Text style={styles.sectionHeader}>People</Text>
        </View>
      }
      ListEmptyComponent={
        loadingPeople ? (
          <View style={{ paddingVertical: 40, alignItems: 'center' }}>
            <ActivityIndicator color="#fff" />
          </View>
        ) : (
          <View style={{ paddingVertical: 20, alignItems: 'center' }}>
            <Text style={styles.muted}>No users to suggest right now.</Text>
          </View>
        )
      }
      contentContainerStyle={{ paddingBottom: 28, gap: 10 }}
      removeClippedSubviews
      windowSize={9}
      maxToRenderPerBatch={24}
      initialNumToRender={24}
    />
  );
}

/* ----------------- small components ----------------- */
function SuggestRowItem({
  row,
  isFollowing,
  busy,
  onFollow,
  onMessage,
}: {
  row: SuggestRow;
  isFollowing: boolean;
  busy: boolean;
  onFollow: () => void;
  onMessage: () => void;
}): React.ReactElement {
  const title = row.profile?.displayName || row.profile?.username || 'User';
  return (
    <View style={[styles.card, { marginHorizontal: 14 }]}>
      <View style={styles.suggestRow}>
        <View style={styles.avatarWrap}>
          {row.profile?.photoURL ? (
            <Image source={{ uri: row.profile.photoURL }} style={styles.avatar} />
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
          {!!row.profile?.username && (
            <Text style={styles.username} numberOfLines={1}>
              @{row.profile.username}
            </Text>
          )}
        </View>

        <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
          <Pressable
            onPress={onMessage}
            style={({ pressed }) => [styles.btn, pressed && { opacity: 0.95 }]}
          >
            <Text style={styles.btnText}>Message</Text>
          </Pressable>
          <Pressable
            onPress={onFollow}
            disabled={busy || isFollowing}
            style={({ pressed }) => [
              styles.btnPrimary,
              (pressed || busy || isFollowing) && { opacity: 0.9 },
            ]}
          >
            <Text style={styles.btnPrimaryText}>
              {isFollowing ? 'Following' : busy ? 'Following…' : 'Follow'}
            </Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

/* ----------------- styles ----------------- */
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

  // Cards & sections
  card: {
    backgroundColor: CARD_BG,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderTopWidth: 3,
    borderTopColor: RED,
  },
  sectionHeader: {
    fontFamily: 'Inter_700Bold',
    color: '#fff',
    fontSize: 16,
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.12)',
    marginVertical: 8,
  },

  // Quick row
  quickRow: {
    flexDirection: 'row',
    gap: 10,
    flexWrap: 'wrap',
  },

  // Recent chat pills
  pill: {
    minWidth: 180,
    maxWidth: 260,
    gap: 10,
    padding: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(0,0,0,0.25)',
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 6,
  },
  pillAvatarWrap: {
    width: 36,
    height: 36,
    borderRadius: 999,
    overflow: 'hidden',
    backgroundColor: '#0f0f0f',
  },
  pillAvatar: {
    width: '100%',
    height: '100%',
    borderRadius: 999,
  },
  pillTitle: {
    fontFamily: 'Inter_700Bold',
    color: '#fff',
    fontSize: 14,
  },
  pillSub: {
    fontFamily: 'Inter_400Regular',
    color: '#9ca3af',
    fontSize: 11,
  },

  // Suggest rows
  suggestRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
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
  username: {
    marginTop: 2,
    fontFamily: 'Inter_400Regular',
    color: '#cbd5e1',
    fontSize: 12,
  },

  // Buttons
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
