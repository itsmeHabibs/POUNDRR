// File: app/(tabs)/socials/spotlight/[videoId].tsx
// Rules followed:
// - No top-level imports from 'firebase/auth' (we use useAuthUid for auth state).
// - Firestore usage is fine at module scope; all calls done in effects/handlers.
// - Default export a React component; TS strict-friendly.
// - Uses Expo AV Video with cautious props; no hooks at module scope.

import { AVPlaybackStatusSuccess, ResizeMode, Video } from 'expo-av';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Platform,
  Pressable,
  SafeAreaView,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { db } from '@/firebase';
import { useAuthUid } from '@/hooks/useAuthUid';

import {
  Timestamp,
  deleteDoc,
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
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

/* ---------- helpers ---------- */
function asStringParam(v: string | string[] | undefined): string | null {
  if (!v) return null;
  return Array.isArray(v) ? (v[0] ?? null) : v;
}
function timeAgo(ts?: Timestamp | null): string | undefined {
  if (!ts) return undefined;
  try {
    const ms = ts.toDate().getTime();
    const diff = Math.max(0, Date.now() - ms);
    const m = Math.floor(diff / 60000);
    if (m < 1) return 'just now';
    if (m < 60) return `${m}m`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h`;
    const d = Math.floor(h / 24);
    if (d < 7) return `${d}d`;
    const w = Math.floor(d / 7);
    return `${w}w`;
  } catch {
    return undefined;
  }
}

/* ---------- constants ---------- */
const RED = '#f70000';
const CARD_BG = 'rgba(0,0,0,0.82)';
const BORDER = 'rgba(255,255,255,0.14)';

/* ---------- screen ---------- */
export default function SpotlightVideoScreen(): React.ReactElement {
  const router = useRouter();
  const { videoId: videoIdParam } = useLocalSearchParams<{ videoId?: string | string[] }>();
  const videoId = asStringParam(videoIdParam);

  const { uid, error: authErr } = useAuthUid();

  const [docData, setDocData] = useState<SpotlightDoc | null>(null);
  const [owner, setOwner] = useState<UserDoc | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  const [liked, setLiked] = useState<boolean>(false);
  const [likeBusy, setLikeBusy] = useState<boolean>(false);

  const [playedOnce, setPlayedOnce] = useState<boolean>(false); // track for view increment once playback starts visibly

  const videoRef = useRef<Video>(null);

  const spotlightRef = useMemo(() => (videoId ? doc(db, 'spotlights', videoId) : null), [videoId]);

  // Load spotlight doc + owner
  useEffect(() => {
    (async () => {
      if (!spotlightRef) {
        setDocData(null);
        setOwner(null);
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        const snap = await getDoc(spotlightRef);
        if (!snap.exists()) {
          setDocData(null);
          setOwner(null);
          return;
        }
        const data = (snap.data() as SpotlightDoc) ?? null;
        setDocData(data);

        if (data?.ownerUid) {
          try {
            const uSnap = await getDoc(doc(db, 'users', data.ownerUid));
            setOwner(uSnap.exists() ? ((uSnap.data() as UserDoc) ?? null) : null);
          } catch {
            setOwner(null);
          }
        } else {
          setOwner(null);
        }
      } catch (e) {
        console.warn('[spotlight] load error:', e);
        setDocData(null);
        setOwner(null);
      } finally {
        setLoading(false);
      }
    })();
  }, [spotlightRef]);

  // Load like state for current user
  useEffect(() => {
    (async () => {
      if (!uid || !videoId) {
        setLiked(false);
        return;
      }
      try {
        const likeId = `${videoId}_${uid}`;
        const s = await getDoc(doc(db, 'spotlightLikes', likeId));
        setLiked(s.exists());
      } catch {
        setLiked(false);
      }
    })();
  }, [uid, videoId]);

  const toggleLike = useCallback(async () => {
    if (!videoId) return;
    if (!uid) {
      Alert.alert('Sign in required', 'Please log in to like this video.');
      router.push('/login');
      return;
    }
    setLikeBusy(true);
    try {
      const likeId = `${videoId}_${uid}`;
      const likeRef = doc(db, 'spotlightLikes', likeId);
      if (liked) {
        await deleteDoc(likeRef);
        setLiked(false);
      } else {
        await setDoc(likeRef, {
          videoId,
          uid,
          createdAt: serverTimestamp(),
        });
        setLiked(true);
      }
      // Optional: Let backend aggregate counts; we keep UI optimistic only.
    } catch (e) {
      console.warn('[spotlight] like error:', e);
      Alert.alert('Error', 'Unable to update like right now.');
    } finally {
      setLikeBusy(false);
    }
  }, [uid, videoId, liked, router]);

  const incrementView = useCallback(async () => {
    if (!videoId) return;
    try {
      // Delegate to a backend function for safe increment (recommended)
      const { getFunctions, httpsCallable } = await import('firebase/functions');
      const { app } = await import('@/firebase');
      const functions = getFunctions(app);
      const bump = httpsCallable(functions, 'incrementSpotlightView'); // implement in backend
      await bump({ videoId });
    } catch (e) {
      // Soft fail; just log
      console.warn('[spotlight] view increment error:', e);
    }
  }, [videoId]);

  const onPlaybackStatusUpdate = useCallback(
    (status: AVPlaybackStatusSuccess | any) => {
      if (!playedOnce && status?.isLoaded && status.isPlaying && status.positionMillis > 1500) {
        setPlayedOnce(true);
        void incrementView();
      }
    },
    [playedOnce, incrementView]
  );

  const shareVideo = useCallback(async () => {
    if (!videoId) return;
    try {
      const url = `https://poundrr.app/spotlight/${videoId}`;
      await Share.share({
        message: docData?.title ? `${docData.title} — ${url}` : url,
        url, // iOS uses url separately
        title: 'Share spotlight',
      });
    } catch (e) {
      console.warn('[spotlight] share error:', e);
      Alert.alert('Error', 'Could not open share sheet.');
    }
  }, [videoId, docData?.title]);

  // Guards
  if (authErr) {
    return (
      <SafeAreaView style={styles.center}>
        <Text style={styles.muted}>Auth error: {authErr}</Text>
      </SafeAreaView>
    );
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.center}>
        <ActivityIndicator color="#fff" />
      </SafeAreaView>
    );
  }

  if (!videoId || !docData) {
    return (
      <SafeAreaView style={styles.center}>
        <Text style={styles.muted}>This video isn’t available.</Text>
        <Pressable onPress={() => router.back()} style={({ pressed }) => [styles.btn, pressed && { opacity: 0.95 }]}>
          <Text style={styles.btnText}>Go back</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  const title = docData.title || 'Spotlight';
  const ownerName = owner?.displayName || owner?.username || 'Creator';
  const createdAgo = timeAgo(docData.createdAt);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: 'black' }}>
      {/* Top bar */}
      <View style={styles.topBar}>
        <Pressable onPress={() => router.back()} style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.9 }]}>
          <Text style={styles.backTxt}>‹</Text>
        </Pressable>
        <Text style={styles.topTitle} numberOfLines={1}>
          {title}
        </Text>
        <Pressable onPress={shareVideo} style={({ pressed }) => [styles.iconBtn, pressed && { opacity: 0.9 }]}>
          <Text style={styles.iconTxt}>↗</Text>
        </Pressable>
      </View>

      {/* Video area */}
      <View style={styles.playerWrap}>
        {docData.videoUrl ? (
          <Video
            ref={videoRef}
            source={{ uri: docData.videoUrl }}
            style={styles.video}
            resizeMode={ResizeMode.CONTAIN}
            posterSource={docData.thumbnailUrl ? { uri: docData.thumbnailUrl } : undefined}
            usePoster={!Platform.select({ web: false, default: false })} // poster helpful on native when needed
            shouldPlay
            isMuted={false}
            isLooping
            onPlaybackStatusUpdate={onPlaybackStatusUpdate}
            useNativeControls
          />
        ) : (
          <View style={[styles.video, styles.videoFallback]}>
            {docData.thumbnailUrl ? (
              <Image source={{ uri: docData.thumbnailUrl }} style={styles.video} />
            ) : (
              <Text style={styles.videoFallbackTxt}>No video</Text>
            )}
          </View>
        )}
      </View>

      {/* Meta + actions */}
      <View style={styles.metaCard}>
        <View style={styles.creatorRow}>
          <View style={styles.avatarWrap}>
            {owner?.photoURL ? (
              <Image source={{ uri: owner.photoURL }} style={styles.avatar} />
            ) : (
              <View style={[styles.avatar, styles.avatarFallbackBg]}>
                <Text style={styles.avatarFallback}>{(ownerName?.[0] ?? '?').toUpperCase()}</Text>
              </View>
            )}
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.creatorName} numberOfLines={1}>
              {ownerName}
            </Text>
            <Text style={styles.metaMuted} numberOfLines={1}>
              {createdAgo ? `Posted ${createdAgo} ago` : 'Just now'}
            </Text>
          </View>

          <Pressable
            onPress={toggleLike}
            disabled={likeBusy}
            style={({ pressed }) => [styles.likeBtn, (pressed || likeBusy) && { opacity: 0.9 }]}
          >
            <Text style={[styles.likeTxt, liked && { color: '#fff' }]}>{liked ? '♥ Liked' : '♡ Like'}</Text>
          </Pressable>
        </View>

        {!!docData.description && (
          <>
            <View style={styles.divider} />
            <Text style={styles.desc}>{docData.description}</Text>
          </>
        )}
      </View>
    </SafeAreaView>
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
    gap: 10,
  },
  muted: {
    fontFamily: 'Inter_400Regular',
    color: '#cbd5e1',
    fontSize: 13,
    textAlign: 'center',
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

  topBar: {
    height: 54,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backTxt: {
    fontFamily: 'Inter_700Bold',
    color: '#fff',
    fontSize: 22,
    lineHeight: 22,
  },
  topTitle: {
    flex: 1,
    marginHorizontal: 8,
    fontFamily: 'Inter_700Bold',
    color: '#fff',
    fontSize: 16,
  },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconTxt: {
    fontFamily: 'Inter_700Bold',
    color: '#fff',
    fontSize: 16,
  },

  playerWrap: {
    width: '100%',
    aspectRatio: 16 / 9,
    backgroundColor: '#0a0a0a',
  },
  video: {
    width: '100%',
    height: '100%',
  },
  videoFallback: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0f0f0f',
  },
  videoFallbackTxt: {
    fontFamily: 'Inter_700Bold',
    color: '#fff',
    fontSize: 12,
    letterSpacing: 1,
  },

  metaCard: {
    marginTop: 12,
    marginHorizontal: 12,
    backgroundColor: CARD_BG,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderTopWidth: 3,
    borderTopColor: RED,
    gap: 8,
  },
  creatorRow: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
  },
  avatarWrap: {
    width: 40,
    height: 40,
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
    fontSize: 12,
  },
  creatorName: {
    fontFamily: 'Inter_700Bold',
    color: '#fff',
    fontSize: 15,
  },
  metaMuted: {
    fontFamily: 'Inter_400Regular',
    color: '#cbd5e1',
    fontSize: 12,
  },
  likeBtn: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: 'rgba(0,0,0,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  likeTxt: {
    fontFamily: 'Inter_700Bold',
    color: '#e5e7eb',
    fontSize: 14,
  },

  divider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.12)',
    marginTop: 6,
  },
  desc: {
    fontFamily: 'Inter_400Regular',
    color: '#e5e7eb',
    fontSize: 13,
  },
});
