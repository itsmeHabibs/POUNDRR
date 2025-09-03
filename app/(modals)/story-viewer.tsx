// File: app/(modals)/story-viewer.tsx
// Notes:
// - No top-level firebase/auth imports (Auth not needed here).
// - Uses eager firebase db/storage (allowed by your rules) + useAuthUid().
// - Open with either a doc id or a direct mediaUrl:
//     router.push({ pathname: '/(modals)/story-viewer', params: { id: someId } })
//     // or
//     router.push({ pathname: '/(modals)/story-viewer', params: { mediaUrl, mediaType: 'image'|'video', caption } })

import { ResizeMode, Video } from 'expo-av';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Image,
  Pressable,
  SafeAreaView,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { db } from '@/firebase';
import { useAuthUid } from '@/hooks/useAuthUid';

import { storage } from '@/firebase';
import {
  Timestamp,
  deleteDoc,
  doc,
  getDoc,
  increment,
  onSnapshot,
  updateDoc,
} from 'firebase/firestore';
import { deleteObject, ref } from 'firebase/storage';

type Params = {
  id?: string | string[];
  mediaUrl?: string | string[];
  mediaType?: string | string[]; // 'image' | 'video'
  caption?: string | string[];
  returnTo?: string | string[];
  autoplay?: string | string[]; // "1" to autoplay videos
};

type StoryDoc = {
  ownerUid?: string;
  mediaUrl?: string;
  storagePath?: string;
  mediaType?: 'image' | 'video';
  caption?: string | null;
  durationMs?: number | null;
  viewCount?: number;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
  expiresAt?: Timestamp;
};

const { width, height } = Dimensions.get('window');
const RED = '#f70000';
const CARD_BG = 'rgba(0,0,0,0.75)';

function toSingle(v?: string | string[] | null): string | undefined {
  if (v == null) return undefined;
  return Array.isArray(v) ? v[0] : v;
}

function detectMediaTypeFromUrl(url?: string): 'image' | 'video' | undefined {
  if (!url) return undefined;
  const u = url.split('?')[0] ?? url;
  const ext = u.split('.').pop()?.toLowerCase();
  if (!ext) return undefined;
  const imageExts = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic', 'heif'];
  return imageExts.includes(ext) ? 'image' : 'video';
}

export default function StoryViewerModal(): React.ReactElement {
  const router = useRouter();
  const { uid } = useAuthUid();

  const params = useLocalSearchParams<Params>();
  const storyId = useMemo(() => toSingle(params.id), [params.id]);
  const givenUrl = useMemo(() => toSingle(params.mediaUrl), [params.mediaUrl]);
  const givenType = useMemo(() => toSingle(params.mediaType) as 'image' | 'video' | undefined, [params.mediaType]);
  const givenCaption = useMemo(() => toSingle(params.caption), [params.caption]);
  const returnTo = useMemo(() => toSingle(params.returnTo), [params.returnTo]);
  const shouldAutoplay = useMemo(() => toSingle(params.autoplay) === '1', [params.autoplay]);

  const [loading, setLoading] = useState<boolean>(!!storyId);
  const [story, setStory] = useState<StoryDoc | null>(null);
  const [notFound, setNotFound] = useState<boolean>(false);
  const [deleting, setDeleting] = useState<boolean>(false);
  const [isOwner, setIsOwner] = useState<boolean>(false);

  // Live-load story if id is provided
  useEffect(() => {
    if (!storyId) return;
    const refDoc = doc(db, 'stories', storyId);
    const unsub = onSnapshot(
      refDoc,
      (snap) => {
        if (!snap.exists()) {
          setNotFound(true);
          setStory(null);
          setLoading(false);
          return;
        }
        const d = (snap.data() as StoryDoc) ?? {};
        setStory(d);
        setNotFound(false);
        setLoading(false);
      },
      (err) => {
        console.warn('[story-viewer] onSnapshot error:', err);
        setLoading(false);
      }
    );
    return () => unsub();
  }, [storyId]);

  // Ownership
  useEffect(() => {
    setIsOwner(Boolean(uid && (story?.ownerUid === uid)));
  }, [uid, story?.ownerUid]);

  // Increment view count (best-effort)
  useEffect(() => {
    if (!storyId) return;
    (async () => {
      try {
        await updateDoc(doc(db, 'stories', storyId), { viewCount: increment(1) });
      } catch (e) {
        console.warn('[story-viewer] increment view error:', e);
      }
    })();
  }, [storyId]);

  const mediaUrl = useMemo(() => story?.mediaUrl ?? givenUrl, [story?.mediaUrl, givenUrl]);
  const mediaType = useMemo<'image' | 'video' | undefined>(() => {
    return story?.mediaType ?? givenType ?? detectMediaTypeFromUrl(mediaUrl);
  }, [story?.mediaType, givenType, mediaUrl]);
  const caption = useMemo(() => story?.caption ?? givenCaption ?? '', [story?.caption, givenCaption]);

  const expiresLabel = useMemo(() => {
    const ts = story?.expiresAt;
    if (!ts) return undefined;
    const msLeft = ts.toMillis() - Date.now();
    if (msLeft <= 0) return 'Expired';
    const hours = Math.ceil(msLeft / (60 * 60 * 1000));
    return `${hours}h left`;
  }, [story?.expiresAt]);

  const handleClose = useCallback(() => {
    if (returnTo) router.replace(returnTo);
    else router.back();
  }, [router, returnTo]);

  const handleShare = useCallback(async () => {
    try {
      if (!mediaUrl) return;
      await Share.share({ message: caption ? `${caption}\n\n${mediaUrl}` : mediaUrl });
    } catch (e) {
      console.warn('[story-viewer] share error:', e);
    }
  }, [caption, mediaUrl]);

  const handleDelete = useCallback(() => {
    if (!isOwner || !storyId) return;
    Alert.alert('Delete Story', 'Delete this story permanently?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            setDeleting(true);

            const refDoc = doc(db, 'stories', storyId);

            // Get storagePath before delete
            let storagePath: string | undefined;
            try {
              const snap = await getDoc(refDoc);
              if (snap.exists()) {
                storagePath = (snap.data() as StoryDoc)?.storagePath;
              }
            } catch {
              // ignore
            }

            await deleteDoc(refDoc);

            if (storagePath) {
              try {
                await deleteObject(ref(storage, storagePath));
              } catch (e) {
                console.warn('[story-viewer] delete storage error:', e);
              }
            }

            handleClose();
          } catch (e) {
            console.warn('[story-viewer] delete error:', e);
            Alert.alert('Error', 'Failed to delete story.');
            setDeleting(false);
          }
        },
      },
    ]);
  }, [isOwner, storyId, handleClose]);

  if (!mediaUrl && loading) {
    return (
      <SafeAreaView style={styles.root}>
        <ActivityIndicator color="#fff" />
      </SafeAreaView>
    );
  }

  if (!mediaUrl && (notFound || !loading)) {
    return (
      <SafeAreaView style={styles.root}>
        <View style={styles.card}>
          <Text style={styles.title}>Story not found</Text>
          <Pressable onPress={handleClose} style={({ pressed }) => [styles.btnGhost, pressed && { opacity: 0.85 }]}>
            <Text style={styles.btnGhostText}>Close</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.root}>
      {/* Top Bar */}
      <View style={styles.topBar}>
        <Pressable onPress={handleClose} style={({ pressed }) => [styles.topBtn, pressed && { opacity: 0.8 }]}>
          <Text style={styles.topBtnText}>Close</Text>
        </Pressable>

        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Pressable onPress={handleShare} style={({ pressed }) => [styles.topBtn, pressed && { opacity: 0.85 }]}>
            <Text style={styles.topBtnText}>Share</Text>
          </Pressable>

          {isOwner && (
            <Pressable
              onPress={handleDelete}
              disabled={deleting}
              style={({ pressed }) => [
                styles.topBtnDanger,
                (pressed || deleting) && { opacity: 0.9 },
              ]}
            >
              <Text style={styles.topBtnDangerText}>{deleting ? 'Deleting…' : 'Delete'}</Text>
            </Pressable>
          )}
        </View>
      </View>

      {/* Media */}
      <View style={styles.mediaWrap}>
        {mediaType === 'video' ? (
          <Video
            source={{ uri: mediaUrl! }}
            style={styles.media}
            resizeMode={ResizeMode.CONTAIN}
            useNativeControls
            shouldPlay={shouldAutoplay}
            isMuted={false}
          />
        ) : (
          <Image
            source={{ uri: mediaUrl! }}
            style={styles.media}
            resizeMode="contain"
          />
        )}
      </View>

      {/* Meta */}
      {(caption || story?.viewCount || expiresLabel) && (
        <View style={styles.metaCard}>
          {!!caption && <Text style={styles.metaCaption}>{caption}</Text>}
          <View style={styles.metaRow}>
            {!!story?.viewCount && (
              <Text style={styles.metaSubtle}>{story.viewCount} views</Text>
            )}
            {!!expiresLabel && (
              <Text style={styles.metaSubtle}>{expiresLabel}</Text>
            )}
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}

/* ---------- styles ---------- */
const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.9)',
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  topBar: {
    width,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 6,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  topBtn: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  topBtnText: {
    fontFamily: 'Inter_700Bold',
    color: '#fff',
    fontSize: 14,
    letterSpacing: 0.5,
  },
  topBtnDanger: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: 'rgba(239,68,68,0.9)',
  },
  topBtnDangerText: {
    fontFamily: 'Inter_700Bold',
    color: '#fff',
    fontSize: 14,
    letterSpacing: 0.5,
  },
  mediaWrap: {
    width,
    height: height * 0.6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  media: {
    width,
    height: '100%',
  },
  metaCard: {
    width,
    backgroundColor: CARD_BG,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  metaCaption: {
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    color: '#fff',
  },
  metaRow: {
    marginTop: 6,
    flexDirection: 'row',
    gap: 12,
  },
  metaSubtle: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    color: '#cbd5e1',
  },
  // Fallback card
  card: {
    width: '88%',
    backgroundColor: 'rgba(0,0,0,0.75)',
    borderRadius: 12,
    paddingVertical: 24,
    paddingHorizontal: 20,
    alignItems: 'center',
    marginTop: 40,
  },
  title: {
    fontFamily: 'Inter_700Bold',
    color: '#fff',
    fontSize: 18,
    marginBottom: 12,
  },
  btnGhost: {
    marginTop: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 10,
    borderColor: '#444',
    borderWidth: 1,
  },
  btnGhostText: {
    fontFamily: 'Inter_700Bold',
    color: '#fff',
    fontSize: 14,
  },
});
