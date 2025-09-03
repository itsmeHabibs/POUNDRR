// File: app/(tabs)/profile/settings/account.tsx
// Rules followed:
// - No top-level imports from 'firebase/auth'. All Auth calls happen inside handlers/effects using dynamic `await import('firebase/auth')` and `await getAuthInstance()`.
// - Firestore is safe at module scope.
// - Uses useAuthUid() for the current user; no hooks at module scope.
// - Strict-friendly TS; default export component.

import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { db, getAuthInstance } from '@/firebase';
import { useAuthUid } from '@/hooks/useAuthUid';
import { authAPI } from '@/lib/auth';

import { doc, getDoc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';

type UserDoc = {
  displayName?: string | null;
  photoURL?: string | null;
  username?: string | null;
  createdAt?: any;
  updatedAt?: any;
};

const RED = '#f70000';
const CARD_BG = 'rgba(0,0,0,0.82)';
const BORDER = 'rgba(255,255,255,0.14)';
const FIELD_BG = '#161616';

export default function AccountSettingsScreen(): React.ReactElement {
  const router = useRouter();
  const { uid, error: authErr } = useAuthUid();

  const [loading, setLoading] = useState<boolean>(true);

  // Local editable fields
  const [displayName, setDisplayName] = useState<string>('');
  const [email, setEmail] = useState<string>('');
  const [emailVerified, setEmailVerified] = useState<boolean>(false);

  // Password change (optional)
  const [newPassword, setNewPassword] = useState<string>('');
  const [confirmPassword, setConfirmPassword] = useState<string>('');

  // Action states
  const [savingProfile, setSavingProfile] = useState<boolean>(false);
  const [updatingEmail, setUpdatingEmail] = useState<boolean>(false);
  const [changingPw, setChangingPw] = useState<boolean>(false);
  const [sendingVerify, setSendingVerify] = useState<boolean>(false);
  const [deleting, setDeleting] = useState<boolean>(false);
  const [signingOut, setSigningOut] = useState<boolean>(false);

  const canSaveProfile = useMemo(() => displayName.trim().length >= 2 && !savingProfile, [displayName, savingProfile]);
  const canUpdateEmail = useMemo(() => email.trim().length > 5 && email.includes('@') && !updatingEmail, [email, updatingEmail]);
  const canChangePw = useMemo(() => newPassword.length >= 6 && newPassword === confirmPassword && !changingPw, [newPassword, confirmPassword, changingPw]);

  // Load initial account data (Auth + Firestore)
  useEffect(() => {
    (async () => {
      try {
        if (!uid) {
          setLoading(false);
          return;
        }

        // 1) Prefer Firestore profile for displayName
        const ref = doc(db, 'users', uid);
        const snap = await getDoc(ref);
        const fromDoc: UserDoc | null = snap.exists() ? (snap.data() as UserDoc) : null;

        // 2) Load Auth user for email + verification state (lazy)
        const auth = await getAuthInstance();
        const { onAuthStateChanged } = await import('firebase/auth');

        const unsub = onAuthStateChanged(auth, (u) => {
          if (!u) {
            setLoading(false);
            return;
          }
          setEmail(u.email ?? '');
          setEmailVerified(Boolean(u.emailVerified));
          // displayName from Firestore first; else fall back to auth profile value
          setDisplayName(fromDoc?.displayName ?? u.displayName ?? '');
          setLoading(false);
          unsub(); // we only need an initial read; not a live listener here
        });

        // If Auth state is immediately available (e.g., web), above unsub will still run safely
      } catch (e) {
        console.warn('[account-settings] load error:', e);
        setLoading(false);
      }
    })();
  }, [uid]);

  const handleSaveProfile = useCallback(async () => {
    if (!uid) return;
    if (!canSaveProfile) return;
    try {
      setSavingProfile(true);

      // Update Firestore user doc
      const ref = doc(db, 'users', uid);
      const payload: Partial<UserDoc> = {
        displayName: displayName.trim(),
        updatedAt: serverTimestamp(),
      };
      // setDoc with merge in case doc doesn't exist yet
      await setDoc(ref, payload, { merge: true });

      // Update Auth displayName (optional)
      try {
        const auth = await getAuthInstance();
        const { updateProfile } = await import('firebase/auth');
        if (auth.currentUser) {
          await updateProfile(auth.currentUser, { displayName: displayName.trim() });
        }
      } catch (e) {
        // Non-fatal; Firestore already updated
        console.warn('[account-settings] updateProfile warning:', e);
      }

      Alert.alert('Saved', 'Your profile has been updated.');
    } catch (e: unknown) {
      const msg = (e as { message?: string })?.message ?? 'Failed to save profile.';
      Alert.alert('Error', msg);
    } finally {
      setSavingProfile(false);
    }
  }, [uid, displayName, canSaveProfile]);

  const handleUpdateEmail = useCallback(async () => {
    if (!uid) return;
    if (!canUpdateEmail) return;
    try {
      setUpdatingEmail(true);
      const auth = await getAuthInstance();
      const { updateEmail } = await import('firebase/auth');
      if (!auth.currentUser) throw new Error('No current user.');
      await updateEmail(auth.currentUser, email.trim());
      await updateDoc(doc(db, 'users', uid), { updatedAt: serverTimestamp() });
      Alert.alert('Email updated', 'Your sign-in email has been changed.');
      setEmailVerified(false); // new email is unverified until confirmed
    } catch (e: any) {
      const code = e?.code as string | undefined;
      if (code === 'auth/requires-recent-login') {
        Alert.alert('Re-authentication needed', 'Please log in again and try changing your email.');
      } else {
        const msg = e?.message ?? 'Failed to change email.';
        Alert.alert('Error', msg);
      }
    } finally {
      setUpdatingEmail(false);
    }
  }, [uid, email, canUpdateEmail]);

  const handleSendVerification = useCallback(async () => {
    try {
      setSendingVerify(true);
      const auth = await getAuthInstance();
      const { sendEmailVerification } = await import('firebase/auth');
      if (!auth.currentUser) throw new Error('No current user.');
      await sendEmailVerification(auth.currentUser);
      Alert.alert('Verification sent', 'Check your inbox for a verification email.');
    } catch (e: unknown) {
      const msg = (e as { message?: string })?.message ?? 'Failed to send verification.';
      Alert.alert('Error', msg);
    } finally {
      setSendingVerify(false);
    }
  }, []);

  const handleChangePassword = useCallback(async () => {
    if (!canChangePw) return;
    try {
      setChangingPw(true);
      const auth = await getAuthInstance();
      const { updatePassword } = await import('firebase/auth');
      if (!auth.currentUser) throw new Error('No current user.');
      await updatePassword(auth.currentUser, newPassword);
      Alert.alert('Password changed', 'Your password has been updated.');
      setNewPassword('');
      setConfirmPassword('');
    } catch (e: any) {
      const code = e?.code as string | undefined;
      if (code === 'auth/requires-recent-login') {
        Alert.alert('Re-authentication needed', 'Please log in again and try changing your password.');
      } else {
        const msg = e?.message ?? 'Failed to change password.';
        Alert.alert('Error', msg);
      }
    } finally {
      setChangingPw(false);
    }
  }, [newPassword, canChangePw]);

  const handleDeleteAccount = useCallback(() => {
    Alert.alert(
      'Delete account',
      'This will permanently remove your account. This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              setDeleting(true);
              const auth = await getAuthInstance();
              const { deleteUser } = await import('firebase/auth');
              if (!auth.currentUser) throw new Error('No current user.');
              await deleteUser(auth.currentUser);
              Alert.alert('Account deleted', 'Your account has been removed.');
              router.replace('/login');
            } catch (e: any) {
              const code = e?.code as string | undefined;
              if (code === 'auth/requires-recent-login') {
                Alert.alert('Re-authentication needed', 'Please log in again and try deleting your account.');
              } else {
                const msg = e?.message ?? 'Failed to delete account.';
                Alert.alert('Error', msg);
              }
              setDeleting(false);
            }
          },
        },
      ]
    );
  }, [router]);

  const handleSignOut = useCallback(async () => {
    try {
      setSigningOut(true);
      await authAPI.signOut();
      router.replace('/login');
    } catch (e: unknown) {
      const msg = (e as { message?: string })?.message ?? 'Failed to sign out.';
      Alert.alert('Error', msg);
      setSigningOut(false);
    }
  }, [router]);

  // Signed-out / error states
  if (authErr) {
    return (
      <SafeAreaView style={styles.center}>
        <Text style={styles.muted}>Auth error: {authErr}</Text>
      </SafeAreaView>
    );
  }
  if (!uid) {
    return (
      <SafeAreaView style={styles.center}>
        <Text style={styles.muted}>You’re signed out. Please log in to manage your account.</Text>
        <Pressable
          onPress={() => router.replace('/login')}
          style={({ pressed }) => [styles.btnPrimary, pressed && { opacity: 0.9 }]}
        >
          <Text style={styles.btnPrimaryText}>Go to Login</Text>
        </Pressable>
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

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.select({ ios: 'padding', android: undefined })}
    >
      <SafeAreaView style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: 14, gap: 14 }}>
          {/* Profile card */}
          <View style={styles.card}>
            <Text style={styles.heading}>Profile</Text>

            <Text style={styles.label}>Display name</Text>
            <TextInput
              style={styles.input}
              placeholder="Your name"
              placeholderTextColor="#9ca3af"
              value={displayName}
              onChangeText={setDisplayName}
              autoCapitalize="words"
            />

            <Pressable
              onPress={handleSaveProfile}
              disabled={!canSaveProfile}
              style={({ pressed }) => [
                styles.btnPrimary,
                (pressed || !canSaveProfile) && { opacity: 0.9 },
              ]}
            >
              {savingProfile ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.btnPrimaryText}>Save Profile</Text>
              )}
            </Pressable>
          </View>

          {/* Email card */}
          <View style={styles.card}>
            <Text style={styles.heading}>Email</Text>

            <Text style={styles.label}>Sign-in email</Text>
            <TextInput
              style={styles.input}
              placeholder="you@example.com"
              placeholderTextColor="#9ca3af"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
            />

            <View style={styles.row}>
              <Pressable
                onPress={handleUpdateEmail}
                disabled={!canUpdateEmail}
                style={({ pressed }) => [
                  styles.btn,
                  (pressed || !canUpdateEmail) && { opacity: 0.9 },
                ]}
              >
                {updatingEmail ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.btnText}>Update Email</Text>
                )}
              </Pressable>

              <Pressable
                onPress={handleSendVerification}
                disabled={emailVerified || sendingVerify}
                style={({ pressed }) => [
                  styles.btn,
                  (pressed || emailVerified || sendingVerify) && { opacity: 0.9 },
                ]}
              >
                {sendingVerify ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.btnText}>
                    {emailVerified ? 'Verified' : 'Send Verification'}
                  </Text>
                )}
              </Pressable>
            </View>
          </View>

          {/* Password card */}
          <View style={styles.card}>
            <Text style={styles.heading}>Password</Text>

            <Text style={styles.label}>New password</Text>
            <TextInput
              style={styles.input}
              placeholder="At least 6 characters"
              placeholderTextColor="#9ca3af"
              value={newPassword}
              onChangeText={setNewPassword}
              secureTextEntry
              autoCapitalize="none"
            />

            <Text style={styles.label}>Confirm password</Text>
            <TextInput
              style={styles.input}
              placeholder="Repeat new password"
              placeholderTextColor="#9ca3af"
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              secureTextEntry
              autoCapitalize="none"
            />

            <Pressable
              onPress={handleChangePassword}
              disabled={!canChangePw}
              style={({ pressed }) => [
                styles.btn,
                (pressed || !canChangePw) && { opacity: 0.9 },
              ]}
            >
              {changingPw ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.btnText}>Change Password</Text>
              )}
            </Pressable>
          </View>

          {/* Danger zone */}
          <View style={[styles.card, { borderTopColor: 'rgba(239,68,68,0.9)' }]}>
            <Text style={styles.heading}>Danger zone</Text>

            <Pressable
              onPress={handleSignOut}
              disabled={signingOut}
              style={({ pressed }) => [
                styles.btn,
                pressed && { opacity: 0.9 },
              ]}
            >
              {signingOut ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.btnText}>Sign out</Text>
              )}
            </Pressable>

            <Pressable
              onPress={handleDeleteAccount}
              disabled={deleting}
              style={({ pressed }) => [
                styles.btnDanger,
                (pressed || deleting) && { opacity: 0.9 },
              ]}
            >
              <Text style={styles.btnDangerText}>{deleting ? 'Deleting…' : 'Delete account'}</Text>
            </Pressable>
          </View>
        </ScrollView>
      </SafeAreaView>
    </KeyboardAvoidingView>
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
  card: {
    backgroundColor: CARD_BG,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderTopWidth: 3,
    borderTopColor: RED,
  },
  heading: {
    fontFamily: 'Inter_700Bold',
    color: '#fff',
    fontSize: 16,
    marginBottom: 10,
  },
  label: {
    marginTop: 8,
    marginBottom: 6,
    fontFamily: 'Inter_700Bold',
    color: '#cbd5e1',
    fontSize: 12,
    letterSpacing: 0.4,
  },
  input: {
    backgroundColor: FIELD_BG,
    borderColor: '#333',
    borderWidth: 1.5,
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    color: '#eee',
    fontFamily: 'Inter_700Bold',
    fontSize: 14,
  },
  row: {
    marginTop: 10,
    gap: 10,
    flexDirection: 'row',
    flexWrap: 'wrap',
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
  btnPrimary: {
    backgroundColor: RED,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 12,
  },
  btnPrimaryText: {
    fontFamily: 'Inter_700Bold',
    color: '#fff',
    fontSize: 16,
    letterSpacing: 0.6,
  },
  btnDanger: {
    marginTop: 10,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.9)',
    backgroundColor: 'rgba(239,68,68,0.16)',
    alignItems: 'center',
  },
  btnDangerText: {
    fontFamily: 'Inter_700Bold',
    color: '#fff',
    fontSize: 14,
  },
});
