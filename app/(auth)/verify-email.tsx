// File: app/(auth)/verify-email.tsx
// Rules: no top-level firebase/auth imports; use lazy getAuthInstance() and dynamic imports only.
// Firestore is not used here. Default export component; strict-friendly TS.

import { getAuthInstance } from '@/firebase';
import { useAuthUid } from '@/hooks/useAuthUid';
import { authAPI } from '@/lib/auth';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    KeyboardAvoidingView,
    Platform,
    Pressable,
    StyleSheet,
    Text,
    View,
} from 'react-native';

const RED = '#f70000';
const DARK = '#161616';
const RESEND_COOLDOWN_SEC = 30;

export default function VerifyEmailScreen(): React.ReactElement {
  const router = useRouter();
  const { uid, error: authErr } = useAuthUid();

  const [email, setEmail] = useState<string | null>(null);
  const [verified, setVerified] = useState<boolean | null>(null);

  const [sending, setSending] = useState<boolean>(false);
  const [checking, setChecking] = useState<boolean>(false);
  const [cooldown, setCooldown] = useState<number>(0);

  // Keep live user info (email, verified)
  useEffect(() => {
    let unsub: (() => void) | undefined;
    (async () => {
      unsub = await authAPI.onAuthStateChanged((u) => {
        setEmail(u?.email ?? null);
        setVerified(u?.emailVerified ?? null);
      });
    })().catch((e) => console.warn('[verify-email] onAuthStateChanged error:', e));
    return () => {
      try {
        unsub && unsub();
      } catch {}
    };
  }, []);

  // Auto-redirect once verified
  useEffect(() => {
    if (verified) {
      router.replace('/complete-profile'); // ← adjust if your next route differs
    }
  }, [verified, router]);

  // Basic guards
  const signedOut = useMemo(() => !uid && verified !== true, [uid, verified]);

  const startCooldown = useCallback(() => {
    setCooldown(RESEND_COOLDOWN_SEC);
  }, []);

  // Tick cooldown
  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((s) => Math.max(0, s - 1)), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const handleResend = useCallback(async () => {
    try {
      if (cooldown > 0) return;
      setSending(true);
      const auth = await getAuthInstance();
      const { sendEmailVerification } = await import('firebase/auth');
      const user = auth.currentUser;
      if (!user) {
        Alert.alert('Not signed in', 'Please log in again.');
        return;
      }
      await sendEmailVerification(user);
      Alert.alert('Verification email sent', 'Check your inbox for the verification link.');
      startCooldown();
    } catch (e: unknown) {
      console.warn('[verify-email] resend error:', e);
      const message = (e as { message?: string })?.message ?? 'Could not send verification email.';
      Alert.alert('Error', message);
    } finally {
      setSending(false);
    }
  }, [cooldown, startCooldown]);

  const handleCheckAgain = useCallback(async () => {
    try {
      setChecking(true);
      const auth = await getAuthInstance();
      const { reload } = await import('firebase/auth');
      if (!auth.currentUser) {
        Alert.alert('Not signed in', 'Please log in again.');
        return;
      }
      await reload(auth.currentUser);
      // after reload, onAuthStateChanged will fire; but also read directly:
      setVerified(auth.currentUser.emailVerified ?? false);
      if (auth.currentUser.emailVerified) {
        router.replace('/complete-profile'); // ← adjust if your next route differs
      }
    } catch (e: unknown) {
      console.warn('[verify-email] check error:', e);
      const message = (e as { message?: string })?.message ?? 'Could not check verification status.';
      Alert.alert('Error', message);
    } finally {
      setChecking(false);
    }
  }, [router]);

  if (authErr) {
    return (
      <View style={styles.center}>
        <Text style={[styles.body, { color: '#e5e7eb' }]}>
          Auth error: {authErr}
        </Text>
      </View>
    );
  }

  if (signedOut) {
    return (
      <View style={styles.center}>
        <Text style={[styles.body, { color: '#e5e7eb' }]}>
          You’re signed out. Please log in.
        </Text>
        <Pressable
          onPress={() => router.replace('/login')}
          style={({ pressed }) => [styles.btnGhost, pressed && { opacity: 0.85 }]}
        >
          <Text style={styles.btnGhostText}>Go to Login</Text>
        </Pressable>
      </View>
    );
  }

  // Normal page
  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.select({ ios: 'padding', android: undefined })}
    >
      <View style={styles.card}>
        <Text style={styles.title}>Verify your email</Text>
        <Text style={styles.body}>
          We sent a verification link to:
        </Text>
        <Text style={[styles.bodyStrong, { marginBottom: 16 }]}>
          {email ?? '—'}
        </Text>

        <Pressable
          onPress={handleResend}
          disabled={sending || cooldown > 0}
          style={({ pressed }) => [
            styles.btnPrimary,
            (pressed || sending) && { opacity: 0.9 },
            (cooldown > 0) && { opacity: 0.7 },
          ]}
        >
          {sending ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.btnPrimaryText}>
              {cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend Email'}
            </Text>
          )}
        </Pressable>

        <Pressable
          onPress={handleCheckAgain}
          disabled={checking}
          style={({ pressed }) => [styles.btnGhost, (pressed || checking) && { opacity: 0.85 }]}
        >
          {checking ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.btnGhostText}>I’ve verified—Check again</Text>
          )}
        </Pressable>

        <Text style={[styles.helper, { marginTop: 12 }]}>
          Tip: If you can’t find it, check your spam folder.
        </Text>
      </View>
    </KeyboardAvoidingView>
  );
}

/* ---------- styles ---------- */
const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  card: {
    width: '92%',
    backgroundColor: 'rgba(0,0,0,0.70)',
    borderRadius: 12,
    paddingVertical: 28,
    paddingHorizontal: 22,
    alignItems: 'center',
    borderTopWidth: 4,
    borderTopColor: RED,
  },
  title: {
    fontFamily: 'Inter_700Bold',
    fontSize: 24,
    color: '#fff',
    letterSpacing: 1.1,
    textAlign: 'center',
    marginBottom: 8,
  },
  body: {
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    color: '#e5e7eb',
    textAlign: 'center',
  },
  bodyStrong: {
    fontFamily: 'Inter_700Bold',
    fontSize: 16,
    color: '#fff',
    textAlign: 'center',
  },
  helper: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    color: '#cbd5e1',
    textAlign: 'center',
  },
  btnPrimary: {
    width: '100%',
    backgroundColor: RED,
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 10,
    marginBottom: 8,
  },
  btnPrimaryText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 16,
    color: '#fff',
    letterSpacing: 1.1,
  },
  btnGhost: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderColor: '#444',
    borderWidth: 1,
    alignItems: 'center',
    marginTop: 2,
  },
  btnGhostText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 14,
    color: '#fff',
  },
});
