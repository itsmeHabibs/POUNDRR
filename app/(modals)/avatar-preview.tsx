// File: app/(modals)/avatar-preview.tsx
// Notes:
// - No top-level firebase/auth imports (Auth not needed here).
// - Uses eager firebase app/db/storage exports (safe per your rules).
// - Default export component; strict-friendly TS.
// - Pass `uri` (required) and optional `returnTo` via route params.

import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Image,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { db, storage } from '@/firebase';
import { useAuthUid } from '@/hooks/useAuthUid';

import { doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { getDownloadURL, ref, uploadBytesResumable } from 'firebase/storage';

type Params = {
  uri?: string | string[];
  filename?: string | string[];
  returnTo?: string | string[]; // optional route to go to after save
};

const { width, height } = Dimensions.get('window');
const RED = '#f70000';

async function uriToBlob(uri: string): Promise<Blob> {
  const res = await fetch(uri);
  return res.blob();
}

export default function AvatarPreviewModal(): React.ReactElement {
  const router = useRouter();
  const { uid } = useAuthUid();

  const params = useLocalSearchParams<Params>();
  const uri = useMemo(() => {
    const raw = params.uri;
    return Array.isArray(raw) ? raw[0] : raw;
  }, [params.uri]);

  const filename = useMemo(() => {
    const raw = params.filename;
    const base = Array.isArray(raw) ? raw[0] : raw;
    if (base) return base;
    // Try to derive from uri (best-effort)
    const guess = uri?.split('/').pop();
    return guess || 'avatar.jpg';
  }, [params.filename, uri]);

  const returnTo = useMemo(() => {
    const raw = params.returnTo;
    return Array.isArray(raw) ? raw[0] : raw;
  }, [params.returnTo]);

  const [saving, setSaving] = useState<boolean>(false);
  const [progress, setProgress] = useState<number>(0);

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
        Alert.alert('No image', 'No image to upload.');
        return;
      }

      setSaving(true);
      setProgress(0);

      const blob = await uriToBlob(uri);

      // Path: avatars/{uid}/{timestamp}_{filename}
      const path = `avatars/${uid}/${Date.now()}_${filename}`;
      const storageRef = ref(storage, path);

      const task = uploadBytesResumable(storageRef, blob, {
        contentType: 'image/jpeg',
      });

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

      const url = await getDownloadURL(storageRef);

      // Update user doc with avatarUrl
      await updateDoc(doc(db, 'users', uid), {
        avatarUrl: url,
        updatedAt: serverTimestamp(),
      });

      // Close or route to a specific page
      if (returnTo) {
        router.replace(returnTo);
      } else {
        router.back();
      }
    } catch (e: unknown) {
      console.warn('[avatar-preview] save error:', e);
      const message = (e as { message?: string })?.message ?? 'Failed to save avatar.';
      Alert.alert('Error', message);
      setSaving(false);
    }
  }, [uid, uri, filename, returnTo, router]);

  if (!uri) {
    return (
      <SafeAreaView style={styles.root}>
        <View style={styles.card}>
          <Text style={styles.title}>No image selected</Text>
          <Pressable onPress={handleCancel} style={({ pressed }) => [styles.btnGhost, pressed && { opacity: 0.85 }]}>
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
        <Image
          source={{ uri }}
          style={styles.image}
          resizeMode="contain"
        />
      </View>

      {/* Progress */}
      {saving && (
        <View style={styles.progressWrap}>
          <Text style={styles.progressText}>{progress}%</Text>
        </View>
      )}
    </SafeAreaView>
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
    height: height * 0.8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  image: {
    width,
    height: '100%',
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
