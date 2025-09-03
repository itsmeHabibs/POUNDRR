// File: app/(modals)/story-upload.tsx
// Rules: no top-level firebase/auth; Firestore/Storage OK at module scope; default export; strict-friendly TS.

import { ResizeMode, Video } from 'expo-av';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { db, storage } from '@/firebase';
import { useAuthUid } from '@/hooks/useAuthUid';

import { addDoc, collection, serverTimestamp, Timestamp } from 'firebase/firestore';
import { getDownloadURL, ref, uploadBytesResumable } from 'firebase/storage';

type Params = {
  uri?: string | string[];
  filename?: string | string[];
  caption?: string | string[];
  returnTo?: string | string[];
};

const { width, height } = Dimensions.get('window');
const RED = '#f70000';
const CARD_BG = 'rgba(0,0,0,0.75)';
const FIELD_BG = '#161616';

function toSingle(v?: string | string[] | null): string | undefined {
  if (v == null) return undefined;
  return Array.isArray(v) ? v[0] : v;
}

type MediaKind = 'image' | 'video';

function extOf(name?: string): string | undefined {
  return name?.split('.').pop()?.toLowerCase();
}

function detectMediaKind(name?: string): MediaKind {
  const ext = extOf(name);
  if (!ext) return 'image';
  const imageExts = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic', 'heif'];
  return imageExts.includes(ext) ? 'image' : 'video';
}

function guessContentType(name?: string): string {
  const ext = extOf(name);
  switch (ext) {
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    case 'png':
      return 'image/png';
    case 'gif':
      return 'image/gif';
    case 'webp':
      return 'image/webp';
    case 'heic':
    case 'heif':
      return 'image/heic';
    case 'mp4':
      return 'video/mp4';
    case 'mov':
      return 'video/quicktime';
    case 'webm':
      return 'video/webm';
    case 'm4v':
      return 'video/x-m4v';
    default:
      return 'application/octet-stream';
  }
}

async function uriToBlob(uri: string): Promise<Blob> {
  const res = await fetch(uri);
  return res.blob();
}

export default function StoryUploadModal(): React.ReactElement {
  const router = useRouter();
  const { uid } = useAuthUid();

  const params = useLocalSearchParams<Params>();
  const uri = useMemo(() => toSingle(params.uri), [params.uri]);
  const returnTo = useMemo(() => toSingle(params.returnTo), [params.returnTo]);

  const defaultFilename = useMemo(() => {
    const raw = toSingle(params.filename);
    if (raw) return raw;
    const fromUri = uri?.split('/').pop();
    return fromUri || 'story';
  }, [params.filename, uri]);

  const mediaKind = useMemo<MediaKind>(() => detectMediaKind(defaultFilename), [defaultFilename]);

  const [caption, setCaption] = useState<string>(toSingle(params.caption) ?? '');
  const [saving, setSaving] = useState<boolean>(false);
  const [progress, setProgress] = useState<number>(0);
  const [durationMs, setDurationMs] = useState<number | undefined>(undefined);

  const onVideoLoad = useCallback((status: any) => {
    if (status && typeof status.durationMillis === 'number') {
      setDurationMs(status.durationMillis);
    }
  }, []);

  const handleCancel = useCallback(() => {
    router.back();
  }, [router]);

  const handleSave = useCallback(async () => {
    try {
      if (!uid) {
        Alert.alert('Not signed in', 'Please log in again.');
        return;
      }
      if (!uri) {
        Alert.alert('No media', 'No image/video to upload.');
        return;
      }

      setSaving(true);
      setProgress(0);

      const blob = await uriToBlob(uri);
      const contentType = guessContentType(defaultFilename);
      const ext = extOf(defaultFilename) ?? (mediaKind === 'image' ? 'jpg' : 'mp4');

      // Storage path: stories/{uid}/{timestamp}.{ext}
      const path = `stories/${uid}/${Date.now()}.${ext}`;
      const storageRef = ref(storage, path);

      const task = uploadBytesResumable(storageRef, blob, { contentType });

      await new Promise<void>((resolve, reject) => {
        task.on(
          'state_changed',
          (snap) => {
            const pct = Math.round((snap.bytesTransferred / snap.totalBytes) * 100);
            setProgress(pct);
          },
          (err) => reject(err),
          () => resolve()
        );
      });

      const mediaUrl = await getDownloadURL(storageRef);

      // Expiry (24h)
      const expiresAt = Timestamp.fromDate(new Date(Date.now() + 24 * 60 * 60 * 1000));

      // Create Firestore doc
      await addDoc(collection(db, 'stories'), {
        ownerUid: uid,
        mediaUrl,
        storagePath: path,
        mediaType: mediaKind,        // 'image' | 'video'
        caption: caption.trim() || null,
        durationMs: mediaKind === 'video' ? durationMs ?? null : null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        expiresAt,
        visibility: 'public',        // change if you want private/friends-only
      });

      // Navigate away
      if (returnTo) {
        router.replace(returnTo);
      } else {
        router.back();
      }
    } catch (e: unknown) {
      console.warn('[story-upload] save error:', e);
      const message = (e as { message?: string })?.message ?? 'Failed to upload story.';
      Alert.alert('Error', message);
      setSaving(false);
    }
  }, [uid, uri, defaultFilename, mediaKind, caption, durationMs, returnTo, router]);

  if (!uri) {
    return (
      <SafeAreaView style={styles.root}>
        <View style={styles.card}>
          <Text style={styles.title}>No media selected</Text>
          <Pressable onPress={handleCancel} style={({ pressed }) => [styles.btnGhost, pressed && { opacity: 0.85 }]}>
            <Text style={styles.btnGhostText}>Close</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.select({ ios: 'padding', android: undefined })}
    >
      <SafeAreaView style={styles.root}>
        {/* Top Bar */}
        <View style={styles.topBar}>
          <Pressable onPress={handleCancel} style={({ pressed }) => [styles.topBtn, pressed && { opacity: 0.8 }]}>
            <Text style={styles.topBtnText}>Cancel</Text>
          </Pressable>

          <Pressable
            onPress={handleSave}
            disabled={saving}
            style={({ pressed }) => [
              styles.topBtnPrimary,
              (pressed || saving) && { opacity: 0.9 },
            ]}
          >
            {saving ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.topBtnPrimaryText}>Share</Text>
            )}
          </Pressable>
        </View>

        {/* Preview */}
        <View style={styles.previewWrap}>
          {mediaKind === 'video' ? (
            <Video
              source={{ uri }}
              style={styles.media}
              resizeMode={ResizeMode.CONTAIN}
              useNativeControls
              onLoad={onVideoLoad}
              shouldPlay={false}
              isMuted
            />
          ) : (
            <Image
              source={{ uri }}
              style={styles.media}
              resizeMode="contain"
            />
          )}
        </View>

        {/* Caption */}
        <View style={styles.formCard}>
          <TextInput
            style={styles.input}
            placeholder="Add a caption (optional)"
            placeholderTextColor="#9ca3af"
            value={caption}
            onChangeText={setCaption}
            autoCapitalize="sentences"
          />
        </View>

        {/* Progress */}
        {saving && (
          <View style={styles.progressWrap}>
            <Text style={styles.progressText}>{progress}%</Text>
          </View>
        )}
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}

/* ---------- styles ---------- */
const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.9)', // Modal backdrop
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
  topBtnPrimary: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: RED,
    minWidth: 88,
    alignItems: 'center',
  },
  topBtnPrimaryText: {
    fontFamily: 'Inter_700Bold',
    color: '#fff',
    fontSize: 14,
    letterSpacing: 0.6,
  },
  previewWrap: {
    width,
    height: height * 0.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  media: {
    width,
    height: '100%',
  },
  formCard: {
    width,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: CARD_BG,
    borderRadius: 12,
  },
  input: {
    backgroundColor: FIELD_BG,
    borderColor: '#333',
    borderWidth: 1.5,
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 14,
    color: '#eee',
    fontFamily: 'Inter_700Bold',
    fontSize: 14,
  },
  progressWrap: {
    position: 'absolute',
    bottom: 18,
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
  },
  progressText: {
    fontFamily: 'Inter_700Bold',
    color: '#fff',
    fontSize: 14,
  },
  // Fallback "no media" card
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
