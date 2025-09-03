// File: app/(modals)/highlight-upload.tsx
// Rules: no top-level firebase/auth; Firestore/Storage OK at module scope; default export; strict-friendly TS.

import { ResizeMode, Video } from 'expo-av';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
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

import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { getDownloadURL, ref, uploadBytesResumable } from 'firebase/storage';

type Params = {
  uri?: string | string[];
  filename?: string | string[];
  title?: string | string[];
  description?: string | string[];
  fightId?: string | string[];
  returnTo?: string | string[];
};

const { width, height } = Dimensions.get('window');
const RED = '#f70000';
const CARD_BG = 'rgba(0,0,0,0.75)';

function toSingle(v?: string | string[]): string | undefined {
  if (v == null) return undefined;
  return Array.isArray(v) ? v[0] : v;
}

function guessContentType(fname?: string): string {
  const ext = (fname ?? '').split('.').pop()?.toLowerCase();
  switch (ext) {
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

export default function HighlightUploadModal(): React.ReactElement {
  const router = useRouter();
  const { uid } = useAuthUid();

  const params = useLocalSearchParams<Params>();
  const uri = useMemo(() => toSingle(params.uri), [params.uri]);
  const returnTo = useMemo(() => toSingle(params.returnTo), [params.returnTo]);
  const fightId = useMemo(() => toSingle(params.fightId), [params.fightId]);

  const defaultFilename = useMemo(() => {
    const raw = toSingle(params.filename);
    if (raw) return raw;
    const fromUri = uri?.split('/').pop();
    return fromUri || 'highlight.mp4';
  }, [params.filename, uri]);

  const [title, setTitle] = useState<string>(toSingle(params.title) ?? '');
  const [description, setDescription] = useState<string>(toSingle(params.description) ?? '');

  const [saving, setSaving] = useState<boolean>(false);
  const [progress, setProgress] = useState<number>(0);
  const [durationMs, setDurationMs] = useState<number | undefined>(undefined);

  const onLoad = useCallback((status: any) => {
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
        Alert.alert('No video', 'No video to upload.');
        return;
      }

      setSaving(true);
      setProgress(0);

      const blob = await uriToBlob(uri);
      const contentType = guessContentType(defaultFilename);

      // Storage path: highlights/{uid}/{timestamp}_{filename}
      const path = `highlights/${uid}/${Date.now()}_${defaultFilename}`;
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

      const videoUrl = await getDownloadURL(storageRef);

      // Create Firestore doc
      await addDoc(collection(db, 'highlights'), {
        ownerUid: uid,
        videoUrl,
        storagePath: path,
        title: title.trim() || null,
        description: description.trim() || null,
        fightId: fightId ?? null,
        durationMs: durationMs ?? null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      // Navigate away
      if (returnTo) {
        router.replace(returnTo);
      } else {
        router.back();
      }
    } catch (e: unknown) {
      console.warn('[highlight-upload] save error:', e);
      const message = (e as { message?: string })?.message ?? 'Failed to upload highlight.';
      Alert.alert('Error', message);
      setSaving(false);
    }
  }, [uid, uri, defaultFilename, title, description, fightId, durationMs, returnTo, router]);

  if (!uri) {
    return (
      <SafeAreaView style={styles.root}>
        <View style={styles.card}>
          <Text style={styles.title}>No video selected</Text>
          <Pressable
            onPress={handleCancel}
            style={({ pressed }) => [styles.btnGhost, pressed && { opacity: 0.85 }]}
          >
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
              <Text style={styles.topBtnPrimaryText}>Save</Text>
            )}
          </Pressable>
        </View>

        {/* Preview */}
        <View style={styles.previewWrap}>
          <Video
            source={{ uri }}
            style={styles.video}
            resizeMode={ResizeMode.CONTAIN}
            useNativeControls
            onLoad={onLoad}
            isMuted
            shouldPlay={false}
          />
        </View>

        {/* Meta form */}
        <View style={styles.formCard}>
          <TextInput
            style={styles.input}
            placeholder="TITLE (optional)"
            placeholderTextColor="#9ca3af"
            value={title}
            onChangeText={setTitle}
            autoCapitalize="sentences"
          />
          <TextInput
            style={[styles.input, styles.inputMultiline]}
            placeholder="DESCRIPTION (optional)"
            placeholderTextColor="#9ca3af"
            value={description}
            onChangeText={setDescription}
            multiline
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
    height: height * 0.45,
    alignItems: 'center',
    justifyContent: 'center',
  },
  video: {
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
    backgroundColor: '#161616',
    borderColor: '#333',
    borderWidth: 1.5,
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 14,
    color: '#eee',
    fontFamily: 'Inter_700Bold',
    fontSize: 14,
    marginBottom: 12,
  },
  inputMultiline: {
    minHeight: 70,
    textAlignVertical: 'top',
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
  // Added styles for the "no video" fallback card (to fix TS errors)
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
