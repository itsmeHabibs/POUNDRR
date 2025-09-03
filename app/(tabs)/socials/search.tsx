// File: app/(tabs)/socials/search.tsx
// Rules followed:
// - No top-level imports from 'firebase/auth' (uses useAuthUid for auth state).
// - Firestore usage is fine at module scope; all calls done in effects/handlers.
// - Default export a React component; TS strict-friendly; FlatList perf flags included.

import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { db } from '@/firebase';
import { useAuthUid } from '@/hooks/useAuthUid';

import {
  Timestamp,
  collection,
  doc,
  endAt,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  startAt,
  where
} from 'firebase/firestore';

/* ---------- types ---------- */
type UserDoc = {
  displayName?: string | null;
  username?: string | null;
  usernameLower?: string | null; // optional helper field if present
  displayNameLower?: string | null; // optional helper field if present
  photoURL?: string | null;
  createdAt?: Timestamp | any;
};

type Row = {
  uid: string;
  profile: UserDoc | null;
};

const RED = '#f70000';
const CARD_BG = 'rgba(0,0,0,0.82)';
const BORDER = 'rgba(255,255,255,0.14)';

/* ---------- screen ---------- */
export default function SocialsSearchScreen(): React.ReactElement {
  const router = useRouter();
  const { uid, error: authErr } = useAuthUid();

  const [term, setTerm] = useState<string>('');
  const [results, setResults] = useState<Row[]>([]);
  const [searching, setSearching] = useState<boolean>(false);

  // Following set to disable Follow button (and state while following)
  const [followingSet, setFollowingSet] = useState<Set<string>>(new Set());
  const [followBusy, setFollowBusy] = useState<Record<string, boolean>>({});

  // Load my following set for quick button state
  useEffect(() => {
    (async () => {
      if (!uid) {
        setFollowingSet(new Set());
        return;
      }
      try {
        const snap = await getDocs(
          query(collection(db, 'follows'), where('followerUid', '==', uid), limit(500))
        );
        const s = new Set<string>();
        snap.docs.forEach((d) => {
          const f = d.data() as { followeeUid?: string };
          if (f?.followeeUid) s.add(f.followeeUid);
        });
        setFollowingSet(s);
      } catch (e) {
        console.warn('[search] load following error:', e);
        setFollowingSet(new Set());
      }
    })();
  }, [uid]);

  const runSearch = useCallback(
    async (q: string): Promise<void> => {
      const raw = q.trim();
      if (raw.length < 2) {
        setResults([]);
        return;
      }
      const needle = raw.toLowerCase();
      setSearching(true);
      try {
        const outMap = new Map<string, Row>();

        // Try prefix search on usernameLower (if the field exists in your schema)
        try {
          const snap1 = await getDocs(
            query(
              collection(db, 'users'),
              orderBy('usernameLower'),
              startAt(needle),
              endAt(needle + '\uf8ff'),
              limit(25)
            )
          );
          snap1.docs.forEach((d) => outMap.set(d.id, { uid: d.id, profile: (d.data() as UserDoc) ?? null }));
        } catch {
          // ignore if field missing / index missing
        }

        // Try prefix search on displayNameLower
        try {
          const snap2 = await getDocs(
            query(
              collection(db, 'users'),
              orderBy('displayNameLower'),
              startAt(needle),
              endAt(needle + '\uf8ff'),
              limit(25)
            )
          );
          snap2.docs.forEach((d) => outMap.set(d.id, { uid: d.id, profile: (d.data() as UserDoc) ?? null }));
        } catch {
          // ignore
        }

        // Fallback: fetch a batch and filter client-side
        if (outMap.size === 0) {
          const snapAll = await getDocs(query(collection(db, 'users'), limit(200)));
          snapAll.docs.forEach((d) => {
            const data = (d.data() as UserDoc) ?? {};
            const u = (data.username ?? '').toString().toLowerCase();
            const dn = (data.displayName ?? '').toString().toLowerCase();
            if (u.includes(needle) || dn.includes(needle)) {
              outMap.set(d.id, { uid: d.id, profile: data });
            }
          });
        }

        // Remove self from results
        if (uid) {
          outMap.delete(uid);
        }

        setResults(Array.from(outMap.values()));
      } catch (e) {
        console.warn('[search] error:', e);
        setResults([]);
      } finally {
        setSearching(false);
      }
    },
    [uid]
  );

  // Debounce search
  const lastTermRef = useRef<string>('');
  useEffect(() => {
    const t = term.trim();
    if (t === lastTermRef.current) return;
    const id = setTimeout(() => {
      lastTermRef.current = t;
      void runSearch(t);
    }, 350);
    return () => clearTimeout(id);
  }, [term, runSearch]);

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
        console.warn('[search] follow error:', e);
      } finally {
        setFollowBusy((b) => ({ ...b, [targetUid]: false }));
      }
    },
    [uid, followingSet]
  );

  const openChat = useCallback(
    (otherUid: string) => {
      const path = `/socials/chats/${otherUid}`;
      router.push(path as any);
    },
    [router]
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
        <Text style={styles.muted}>You’re signed out. Please log in to search people.</Text>
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
    <View style={{ flex: 1 }}>
      {/* Search bar */}
      <View style={styles.searchBar}>
        <TextInput
          placeholder="Search by username or name…"
          placeholderTextColor="#9ca3af"
          value={term}
          onChangeText={setTerm}
          autoCapitalize="none"
          autoCorrect={false}
          style={styles.input}
          returnKeyType="search"
          onSubmitEditing={() => void runSearch(term)}
          maxLength={80}
        />
        <Pressable onPress={() => setTerm('')} style={({ pressed }) => [styles.clearBtn, pressed && { opacity: 0.9 }]}>
          <Text style={styles.clearTxt}>Clear</Text>
        </Pressable>
      </View>

      {/* Results */}
      {searching ? (
        <View style={[styles.center, { paddingTop: 20 }]}>
          <ActivityIndicator color="#fff" />
        </View>
      ) : (
        <FlatList
          data={results}
          keyExtractor={(it) => it.uid}
          renderItem={({ item }) => (
            <ResultRow
              row={item}
              isFollowing={followingSet.has(item.uid)}
              busy={!!followBusy[item.uid]}
              onFollow={() => followUser(item.uid)}
              onMessage={() => openChat(item.uid)}
            />
          )}
          ListHeaderComponent={
            <View style={{ paddingHorizontal: 14, paddingTop: 10, paddingBottom: 8 }}>
              <Text style={styles.screenTitle}>Search</Text>
            </View>
          }
          ListEmptyComponent={
            term.trim().length < 2 ? (
              <View style={{ paddingTop: 24, alignItems: 'center' }}>
                <Text style={styles.muted}>Type at least 2 characters to search.</Text>
              </View>
            ) : (
              <View style={{ paddingTop: 24, alignItems: 'center' }}>
                <Text style={styles.muted}>No users found for “{term.trim()}”.</Text>
              </View>
            )
          }
          contentContainerStyle={{ paddingBottom: 24, gap: 10 }}
          removeClippedSubviews
          windowSize={9}
          maxToRenderPerBatch={24}
          initialNumToRender={24}
        />
      )}
    </View>
  );
}

/* ---------- small components ---------- */
function ResultRow({
  row,
  isFollowing,
  busy,
  onFollow,
  onMessage,
}: {
  row: Row;
  isFollowing: boolean;
  busy: boolean;
  onFollow: () => void;
  onMessage: () => void;
}): React.ReactElement {
  const title = row.profile?.displayName || row.profile?.username || 'User';
  return (
    <View style={[styles.card, { marginHorizontal: 14 }]}>
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
          <Pressable onPress={onMessage} style={({ pressed }) => [styles.btn, pressed && { opacity: 0.95 }]}>
            <Text style={styles.btnText}>Message</Text>
          </Pressable>
          <Pressable
            onPress={onFollow}
            disabled={busy || isFollowing}
            style={({ pressed }) => [styles.btnPrimary, (pressed || busy || isFollowing) && { opacity: 0.9 }]}
          >
            <Text style={styles.btnPrimaryText}>{isFollowing ? 'Following' : busy ? 'Following…' : 'Follow'}</Text>
          </Pressable>
        </View>
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

  // Search bar
  searchBar: {
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 8,
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  input: {
    flex: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: 'rgba(0,0,0,0.25)',
    color: '#fff',
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
  },
  clearBtn: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: 'rgba(0,0,0,0.25)',
    alignItems: 'center',
  },
  clearTxt: {
    fontFamily: 'Inter_700Bold',
    color: '#e5e7eb',
    fontSize: 14,
  },

  // Cards / rows
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
    gap: 12,
    alignItems: 'center',
  },

  // Avatar
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
