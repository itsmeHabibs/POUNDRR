// File: app/(tabs)/socials/swipe/index.tsx
// Gesture-only swipe deck; Android/Hermes-safe move handler; excludes self (uid/username/email); Matches button top-right

import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  Image,
  PanResponder,
  PanResponderInstance,
  Pressable,
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
  usernameLower?: string | null; // added
  email?: string | null;         // added
  photoURL?: string | null;
  bio?: string | null;
  city?: string | null;
  country?: string | null;
  createdAt?: Timestamp | null;
};

type SwipeDoc = {
  actorUid: string;
  targetUid: string;
  direction: 'left' | 'right';
  createdAt?: Timestamp | null;
};

type CardRow = {
  uid: string;
  profile: UserDoc | null;
};

const { width } = Dimensions.get('window');
const SWIPE_THRESHOLD = width * 0.28;
const ROTATION = 12;

const RED = '#f70000';
const CARD_BG = 'rgba(0,0,0,0.82)';
const BORDER = 'rgba(255,255,255,0.14)';

export default function SocialSwipeScreen(): React.ReactElement {
  const router = useRouter();
  const { uid, error: authErr } = useAuthUid();

  const [loading, setLoading] = useState<boolean>(true);
  const [deck, setDeck] = useState<CardRow[]>([]);
  const [index, setIndex] = useState<number>(0);
  const [animatingOut, setAnimatingOut] = useState<boolean>(false);

  const position = useRef(new Animated.ValueXY()).current;
  const panRef = useRef<PanResponderInstance | null>(null);

  const topCard = deck[index] ?? null;
  const nextCard = deck[index + 1] ?? null;

  // Derived animations
  const rotate = position.x.interpolate({
    inputRange: [-width, 0, width],
    outputRange: [`-${ROTATION}deg`, '0deg', `${ROTATION}deg`],
  });

  const likeOpacity = position.x.interpolate({
    inputRange: [0, SWIPE_THRESHOLD],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });
  const nopeOpacity = position.x.interpolate({
    inputRange: [-SWIPE_THRESHOLD, 0],
    outputRange: [1, 0],
    extrapolate: 'clamp',
  });

  const nextScale = position.x.interpolate({
    inputRange: [-width, 0, width],
    outputRange: [1, 0.96, 1],
    extrapolate: 'clamp',
  });
  const nextTranslateY = position.x.interpolate({
    inputRange: [-width, 0, width],
    outputRange: [0, 8, 0],
    extrapolate: 'clamp',
  });
  const nextOpacity = position.x.interpolate({
    inputRange: [-width * 0.5, 0, width * 0.5],
    outputRange: [1, 0.9, 1],
    extrapolate: 'clamp',
  });

  // PanResponder (Hermes-safe: no Animated.event for move)
  useEffect(() => {
    const responder = PanResponder.create({
      onMoveShouldSetPanResponder: (_evt, g) =>
        Math.abs(g.dx) > Math.abs(g.dy) && Math.abs(g.dx) > 6,
      onStartShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        position.stopAnimation();
      },
      // Hermes-safe move: update ValueXY directly
      onPanResponderMove: (_evt, g) => {
        position.setValue({ x: g.dx, y: g.dy });
      },
      onPanResponderRelease: (_evt, g) => {
        if (animatingOut) return;
        const { dx, vx } = g;
        if (vx > 1.25 || dx > SWIPE_THRESHOLD) {
          forceSwipe('right');
        } else if (vx < -1.25 || dx < -SWIPE_THRESHOLD) {
          forceSwipe('left');
        } else {
          resetPosition();
        }
      },
      onPanResponderTerminationRequest: () => false,
      onPanResponderTerminate: () => resetPosition(),
    });

    panRef.current = responder;
  }, [animatingOut, position]);

  const resetPosition = () => {
    Animated.spring(position, {
      toValue: { x: 0, y: 0 },
      useNativeDriver: true,
      friction: 6,
    }).start();
  };

  const forceSwipe = (dir: 'left' | 'right') => {
    setAnimatingOut(true);
    Animated.timing(position, {
      toValue: { x: dir === 'right' ? width * 1.5 : -width * 1.5, y: 0 },
      duration: 220,
      useNativeDriver: true,
    }).start(() => onSwipeComplete(dir));
  };

  const onSwipeComplete = async (dir: 'left' | 'right'): Promise<void> => {
    const current = topCard;
    try {
      if (dir === 'right') {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } else {
        await Haptics.selectionAsync();
      }
    } catch {}

    position.setValue({ x: 0, y: 0 });
    setIndex((i) => i + 1);
    setAnimatingOut(false);

    if (!uid || !current) return;

    try {
      const id = `${uid}_${current.uid}`;
      await setDoc(
        doc(db, 'swipes', id),
        { actorUid: uid, targetUid: current.uid, direction: dir, createdAt: serverTimestamp() } as SwipeDoc,
        { merge: true }
      );

      if (dir === 'right') {
        const otherLike = await getDoc(doc(db, 'swipes', `${current.uid}_${uid}`));
        if (otherLike.exists() && (otherLike.data() as SwipeDoc).direction === 'right') {
          const chatId = uid < current.uid ? `${uid}_${current.uid}` : `${current.uid}_${uid}`;
          await setDoc(
            doc(db, 'chats', chatId),
            {
              participants: [uid, current.uid],
              lastMessage: `🎉 You matched with ${(current.profile?.displayName ?? current.profile?.username ?? 'a user')}!`,
              updatedAt: serverTimestamp(),
            },
            { merge: true }
          );
          Alert.alert('It’s a match!', 'You can now chat together.', [
            { text: 'Later' },
            { text: 'Open chat', onPress: () => router.push(`/socials/chats/${current.uid}`) },
          ]);
        }
      }
    } catch (e) {
      console.warn('[swipe] record error:', e);
    }
  };

  const loadDeck = useCallback(async (): Promise<void> => {
    if (!uid) {
      setDeck([]);
      setIndex(0);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      // Who I already swiped
      const mySwipesSnap = await getDocs(
        query(collection(db, 'swipes'), where('actorUid', '==', uid), limit(500))
      );
      const already = new Set<string>();
      mySwipesSnap.docs.forEach((d) => {
        const s = d.data() as SwipeDoc;
        if (s?.targetUid) already.add(s.targetUid);
      });

      // My own user doc (for duplicate exclusion by username/email)
      const meSnap = await getDoc(doc(db, 'users', uid));
      const me = meSnap.exists() ? ((meSnap.data() as UserDoc) ?? null) : null;
      const myUsernameLower = (me?.usernameLower ?? me?.username ?? '').toLowerCase();
      const myEmail = (me?.email ?? '').toLowerCase();

      // Pool of users (prefer newest)
      let poolSnap = await getDocs(
        query(collection(db, 'users'), orderBy('createdAt', 'desc'), limit(120))
      );
      if (poolSnap.empty) {
        poolSnap = await getDocs(query(collection(db, 'users'), limit(120)));
      }

      const pool: CardRow[] = poolSnap.docs
        .map((d) => ({ uid: d.id, profile: (d.data() as UserDoc) ?? null }))
        // Exclude: self by uid, dup by username/email, and already-swiped targets
        .filter((r) => {
          const uname = (r.profile?.usernameLower ?? r.profile?.username ?? '').toLowerCase();
          const email = (r.profile?.email ?? '').toLowerCase();
          return (
            r.uid !== uid &&
            !already.has(r.uid) &&
            (myUsernameLower ? uname !== myUsernameLower : true) &&
            (myEmail ? email !== myEmail : true)
          );
        });

      setDeck(pool);
      setIndex(0);
    } catch (e) {
      console.warn('[swipe] load deck error:', e);
      setDeck([]);
      setIndex(0);
    } finally {
      setLoading(false);
    }
  }, [uid]);

  useEffect(() => {
    if (uid === null) return; // wait for auth
    void loadDeck();
  }, [uid, loadDeck]);

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
        <Text style={styles.muted}>You’re signed out. Please log in to swipe.</Text>
        <Pressable
          onPress={() => router.replace('/(auth)/login')}
          style={({ pressed }) => [styles.btnPrimary, pressed && { opacity: 0.9 }]}
        >
          <Text style={styles.btnPrimaryText}>Go to Login</Text>
        </Pressable>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#fff" />
      </View>
    );
  }

  const cardsLeft = deck.length - index;

  return (
    <View style={{ flex: 1, backgroundColor: 'black', padding: 12 }}>
      {/* Header row — no title, top-right Matches */}
      <View style={styles.header}>
        <View style={{ flex: 1 }} />
        <Pressable
          onPress={() => router.push('/socials/swipe/matches')}
          style={({ pressed }) => [styles.topRightBtn, pressed && { opacity: 0.9 }]}
          hitSlop={8}
        >
          <Text style={styles.topRightText}>Matches</Text>
        </Pressable>
      </View>

      <View style={styles.deckArea}>
        {/* Next card (underlay) */}
        {nextCard && (
          <Animated.View
            pointerEvents="none"
            style={[
              styles.card,
              styles.cardUnder,
              { transform: [{ scale: nextScale }, { translateY: nextTranslateY }], opacity: nextOpacity },
            ]}
          >
            <ProfileCardContent row={nextCard} />
          </Animated.View>
        )}

        {/* Top card */}
        {topCard ? (
          <Animated.View
            {...(panRef.current ? panRef.current.panHandlers : {})}
            style={[
              styles.card,
              { transform: [{ translateX: position.x }, { translateY: position.y }, { rotate }] },
            ]}
          >
            {/* Like / Nope labels */}
            <View style={styles.badgeWrap}>
              <Animated.View style={[styles.badgeLike, { opacity: likeOpacity, transform: [{ rotate: '-12deg' }] }]}>
                <Text style={styles.badgeTxt}>LIKE</Text>
              </Animated.View>
              <Animated.View style={[styles.badgeNope, { opacity: nopeOpacity, transform: [{ rotate: '12deg' }] }]}>
                <Text style={styles.badgeTxt}>NOPE</Text>
              </Animated.View>
            </View>

            <ProfileCardContent row={topCard} />
          </Animated.View>
        ) : (
          <View style={[styles.card, styles.emptyCard]}>
            <Text style={styles.muted}>No more people nearby.</Text>
            <Pressable
              onPress={() => void loadDeck()}
              style={({ pressed }) => [styles.btn, pressed && { opacity: 0.95 }]}
            >
              <Text style={styles.btnText}>Refresh</Text>
            </Pressable>
          </View>
        )}
      </View>

      {/* Footer */}
      <View style={styles.footer}>
        <Text style={styles.footerTxt}>{Math.max(0, cardsLeft)} people remaining</Text>
      </View>
    </View>
  );
}

/* ---------------- components ---------------- */
function ProfileCardContent({ row }: { row: CardRow }): React.ReactElement {
  const title = row.profile?.displayName || row.profile?.username || 'User';
  const location = [row.profile?.city ?? undefined, row.profile?.country ?? undefined].filter(Boolean).join(', ');
  return (
    <>
      <View style={styles.hero}>
        {row.profile?.photoURL ? (
          <Image source={{ uri: row.profile.photoURL }} style={styles.heroImg} resizeMode="cover" />
        ) : (
          <View style={[styles.heroImg, styles.heroFallback]}>
            <Text style={styles.heroFallbackTxt}>{(title?.[0] ?? '?').toUpperCase()}</Text>
          </View>
        )}
      </View>
      <View style={styles.meta}>
        <Text style={styles.name} numberOfLines={1}>
          {title}
        </Text>
        {!!location && (
          <Text style={styles.metaMuted} numberOfLines={1}>
            {location}
          </Text>
        )}
        {!!row.profile?.bio && (
          <Text style={styles.bio} numberOfLines={3}>
            {row.profile.bio}
          </Text>
        )}
      </View>
    </>
  );
}

/* ---------------- styles ---------------- */
const styles = StyleSheet.create({
  center: {
    flex: 1,
    backgroundColor: 'black',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 10,
  },
  muted: {
    fontFamily: 'Inter_400Regular',
    color: '#cbd5e1',
    fontSize: 13,
    textAlign: 'center',
  },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  topRightBtn: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  topRightText: {
    fontFamily: 'Inter_700Bold',
    color: '#e5e7eb',
    fontSize: 14,
    letterSpacing: 0.3,
  },

  deckArea: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },

  card: {
    position: 'absolute',
    width: '100%',
    height: '88%',
    backgroundColor: CARD_BG,
    borderRadius: 16,
    overflow: 'hidden',
    borderTopWidth: 3,
    borderTopColor: RED,
    elevation: 6,
  },
  cardUnder: {
    transform: [{ scale: 0.96 }, { translateY: 8 }],
    opacity: 0.9,
  },
  emptyCard: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },

  hero: {
    width: '100%',
    height: '70%',
    backgroundColor: '#0a0a0a',
  },
  heroImg: {
    width: '100%',
    height: '100%',
  },
  heroFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroFallbackTxt: {
    fontFamily: 'Inter_700Bold',
    color: '#fff',
    fontSize: 28,
  },

  badgeWrap: {
    position: 'absolute',
    top: 12,
    left: 12,
    right: 12,
    zIndex: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  badgeLike: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#34d399',
    backgroundColor: 'rgba(52,211,153,0.15)',
  },
  badgeNope: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#f87171',
    backgroundColor: 'rgba(248,113,113,0.15)',
  },
  badgeTxt: {
    fontFamily: 'Inter_700Bold',
    color: '#fff',
    fontSize: 12,
    letterSpacing: 1,
  },

  meta: {
    paddingHorizontal: 12,
    paddingVertical: 12,
    gap: 6,
  },
  name: {
    fontFamily: 'Inter_700Bold',
    color: '#fff',
    fontSize: 18,
  },
  bio: {
    fontFamily: 'Inter_400Regular',
    color: '#e5e7eb',
    fontSize: 13,
  },
  metaMuted: {
    fontFamily: 'Inter_400Regular',
    color: '#9ca3af',
    fontSize: 12,
  },

  footer: {
    alignItems: 'center',
    paddingTop: 8,
    paddingBottom: 2,
  },
  footerTxt: {
    fontFamily: 'Inter_400Regular',
    color: '#9ca3af',
    fontSize: 12,
  },

  // Generic buttons (refresh / login)
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
});
