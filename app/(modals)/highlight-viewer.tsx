// File: app/(modals)/highlight-viewer.tsx
// Notes:
// - No top-level firebase/auth imports (Auth not needed here).
// - Uses eager firebase app/db/storage exports (safe per your rules).
// - Default export component; strict-friendly TS.
// - Open with either a doc id or a direct videoUrl:
//     router.push({ pathname: '/(modals)/highlight-viewer', params: { id: someId } })
//     // or
//     router.push({ pathname: '/(modals)/highlight-viewer', params: { videoUrl, title, description } })

import { ResizeMode, Video } from 'expo-av';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Pressable,
  SafeAreaView,
  Share,
  StyleSheet,
  Text,
  View
} from 'react-native';

import { db, storage } from '@/firebase';
import { useAuthUid } from '@/hooks/useAuthUid';

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
  videoUrl?: string | string[];
  title?: string | string[];
  description?: string | string[];
  returnTo?: string | string[];
  autoplay?: string | string[]; // "1" to autoplay
};

type HighlightDoc = {
  ownerUid?: string;
  videoUrl?: string;
  storagePath?: string;
  title?: string;
  description?: string;
  durationMs?: number;
  viewCount?: number;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
};

const { width, height } = Dimensions.get('window');
const RED = '#f70000';
const CARD_BG = 'rgba(0,0,0,0.75)';

function toSingle(v?: string | string[] | null): string | undefined {
  if (v == null) return undefined;
  return Array.isArray(v) ? v[0] : v;
}

export default function HighlightViewerModal(): React.ReactElement {
  const router = useRouter();
  const { uid } = useAuthUid();

  const params = useLocalSearchParams<Params>();
  const highlightId = useMemo(() => toSingle(params.id), [params.id]);
  const givenUrl = useMemo(() => toSingle(params.videoUrl), [params.videoUrl]);
  const givenTitle = useMemo(() => toSingle(params.title), [params.title]);
  const givenDesc = useMemo(() => toSingle(params.description), [params.description]);
  const returnTo = useMemo(() => toSingle(params.returnTo), [params.returnTo]);
  const shouldAutoplay = useMemo(() => toSingle(params.autoplay) === '1', [params.autoplay]);

  const [loading, setLoading] = useState<boolean>(!!highlightId); // only load if id provided
  const [highlight, setHighlight] = useState<HighlightDoc | null>(null);
  const [notFound, setNotFound] = useState<boolean>(false);
  const [isOwner, setIsOwner] = useState<boolean>(false);
  const [deleting, setDeleting] = useState<boolean>(false);

  // Load highlight doc live (if id provided)
  useEffect(() => {
    if (!highlightId) return;
    const ref = doc(db, 'highlights', highlightId);
    const unsub = onSnapshot(
      ref,
      (snap) => {
        if (!snap.exists()) {
          setNotFound(true);
          setHighlight(null);
          setLoading(false);
          return;
        }
        const d = (snap.data() as HighlightDoc) ?? {};
        setHighlight(d);
        setNotFound(false);
        setLoading(false);
      },
      (err) => {
        console.warn('[highlight-viewer] onSnapshot error:', err);
        setLoading(false);
      }
    );
    return () => unsub();
  }, [highlightId]);

  // Compute ownership whenever highlight or uid changes
  useEffect(() => {
    setIsOwner(Boolean(uid && (highlight?.ownerUid === uid)));
  }, [uid, highlight?.ownerUid]);

  // Increment view count (best-effort) once we have a valid doc
  useEffect(() => {
    if (!highlightId) return;
    (async () => {
      try {
        const ref = doc(db, 'highlights', highlightId);
        await updateDoc(ref, { viewCount: increment(1) });
      } catch (e) {
        // non-blocking
        console.warn('[highlight-viewer] increment view error:', e);
      }
    })();
  }, [highlightId]);

  const videoUrl = useMemo(() => highlight?.videoUrl ?? givenUrl, [highlight?.videoUrl, givenUrl]);
  const title = useMemo(() => highlight?.title ?? givenTitle ?? 'Highlight', [highlight?.title, givenTitle]);
  const description = useMemo(
    () => highlight?.description ?? givenDesc ?? '',
    [highlight?.description, givenDesc]
  );

  const handleClose = useCallback(() => {
    if (returnTo) {
      router.replace(returnTo);
    } else {
      router.back();
    }
  }, [router, returnTo]);

  const handleShare = useCallback(async () => {
    try {
      if (!videoUrl) return;
      await Share.share({
        message: `${title}\n\n${videoUrl}`,
      });
    } catch (e) {
      console.warn('[highlight-viewer] share error:', e);
    }
  }, [title, videoUrl]);

  const handleDelete = useCallback(() => {
    if (!isOwner || !highlightId) return;
    Alert.alert('Delete Highlight', 'Are you sure you want to delete this highlight?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            setDeleting(true);
            const refDoc = doc(db, 'highlights', highlightId);

            // get storagePath first
            let storagePath: string | undefined;
            try {
              const snap = await getDoc(refDoc);
              if (snap.exists()) {
                storagePath = (snap.data() as HighlightDoc)?.storagePath;
              }
            } catch {
              // ignore
            }

            await deleteDoc(refDoc);

            if (storagePath) {
              try {
                await deleteObject(ref(storage, storagePath));
              } catch (e) {
                console.warn('[highlight-viewer] delete storage error:', e);
              }
            }

            handleClose();
          } catch (e) {
            console.warn('[highlight-viewer] delete error:', e);
            Alert.alert('Error', 'Failed to delete highlight.');
            setDeleting(false);
          }
        },
      },
    ]);
  }, [isOwner, highlightId, handleClose]);

  if (!videoUrl && loading) {
    return (
      <SafeAreaView style={styles.root}>
        <ActivityIndicator color="#fff" />
      </SafeAreaView>
    );
  }

  if (!videoUrl && (notFound || !loading)) {
    return (
      <SafeAreaView style={styles.root}>
        <View style={styles.card}>
          <Text style={styles.title}>Highlight not found</Text>
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

      {/* Video */}
      <View style={styles.videoWrap}>
        <Video
          source={{ uri: videoUrl! }}
          style={styles.video}
          resizeMode={ResizeMode.CONTAIN}
          useNativeControls
          shouldPlay={shouldAutoplay}
          isMuted={false}
        />
      </View>

      {/* Meta */}
      {(title || description) && (
        <View style={styles.metaCard}>
          {!!title && <Text style={styles.metaTitle} numberOfLines={2}>{title}</Text>}
          {!!description && <Text style={styles.metaDesc}>{description}</Text>}
          {!!highlight?.viewCount && (
            <Text style={styles.metaViews}>{highlight.viewCount} views</Text>
          )}
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
  videoWrap: {
    width,
    height: height * 0.55,
    alignItems: 'center',
    justifyContent: 'center',
  },
  video: {
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
  metaTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: 16,
    color: '#fff',
    marginBottom: 6,
  },
  metaDesc: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    color: '#e5e7eb',
  },
  metaViews: {
    marginTop: 8,
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
