// File: app/(auth)/signup.tsx
// Rules: no top-level firebase/auth imports; Firestore (non-lite) OK; default export; strict-friendly TS.

import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';

import { db, getAuthInstance } from '@/firebase';
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';

const { width } = Dimensions.get('window');
const RED = '#f70000';
const DARK = '#161616';

export default function SignUp(): React.ReactElement {
  const router = useRouter();

  const [email, setEmail] = useState<string>('');
  const [password, setPass] = useState<string>('');
  const [confirm, setConfirm] = useState<string>('');
  const [fighter, setFighter] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);

  const handleSignup = async (): Promise<void> => {
    const trimmedEmail = email.trim();

    if (!trimmedEmail || !password || !confirm) {
      Alert.alert('Missing info', 'Fill out all fields.');
      return;
    }
    if (password !== confirm) {
      Alert.alert('Password mismatch', 'Passwords do not match.');
      return;
    }

    try {
      setLoading(true);

      // 1) Lazy-load Auth safely (no top-level imports)
      const auth = await getAuthInstance();
      const { createUserWithEmailAndPassword } = await import('firebase/auth');

      const cred = await createUserWithEmailAndPassword(auth, trimmedEmail, password);

      // Ensure ID token is available so Firestore rules see request.auth
      await cred.user.getIdToken(true);

      // 2) Write base user doc (docId MUST equal auth.uid per rules)
      const role: 'fan' | 'fighter' = fighter ? 'fighter' : 'fan';
      await setDoc(
        doc(db, 'users', cred.user.uid),
        {
          uid: cred.user.uid,
          email: cred.user.email ?? trimmedEmail,
          role,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      // 3) Optional: seed fighters collection when user chose fighter
      // Rules variant supported here: docId === uid; also include ownerUid for future-proofing.
      if (fighter) {
        await setDoc(
          doc(db, 'fighters', cred.user.uid),
          {
            uid: cred.user.uid,
            ownerUid: cred.user.uid,
            weightClass: 'pending',
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );
      }

      // 4) Navigate to complete-profile inside (auth) group
      router.replace('/complete-profile');
    } catch (err: unknown) {
      console.warn('[signup] error:', err);
      const message = (err as { message?: string })?.message ?? 'Sign-up failed. Please try again.';
      Alert.alert('Sign-up failed', message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Image
        source={require('../../assets/logo.png')}
        style={styles.logo}
        resizeMode="contain"
      />

      <View style={styles.card}>
        <Text style={styles.headline}>JOIN THE RING</Text>

        <TextInput
          style={styles.input}
          placeholder="EMAIL"
          placeholderTextColor="#777"
          autoCapitalize="none"
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
        />

        <TextInput
          style={styles.input}
          placeholder="PASSWORD"
          placeholderTextColor="#777"
          autoCapitalize="none"
          secureTextEntry
          value={password}
          onChangeText={setPass}
        />

        <TextInput
          style={styles.input}
          placeholder="CONFIRM PASSWORD"
          placeholderTextColor="#777"
          autoCapitalize="none"
          secureTextEntry
          value={confirm}
          onChangeText={setConfirm}
        />

        {/* Fighter toggle */}
        <View style={styles.toggleRow}>
          <Text style={styles.toggleLabel}>I AM A FIGHTER</Text>
          <Switch
            value={fighter}
            onValueChange={setFighter}
            trackColor={{ false: '#333', true: '#501111' }}
            thumbColor={fighter ? RED : '#888'}
          />
        </View>

        <Pressable
          style={[styles.btn, loading && { opacity: 0.6 }]}
          onPress={handleSignup}
          disabled={loading}
        >
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>SIGN UP</Text>}
        </Pressable>

        <Pressable onPress={() => router.push('/login')}>
          <Text style={styles.cta}>
            ALREADY HAVE AN ACCOUNT? <Text style={styles.ctaRed}>LOG IN</Text>
          </Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

/* ---------- styles ---------- */
const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingHorizontal: 24,
  },
  logo: {
    width: width * 0.38,
    height: width * 0.38,
    marginTop: 60,
    marginBottom: 24,
  },
  card: {
    width: '90%',
    backgroundColor: 'rgba(0,0,0,0.70)',
    borderRadius: 12,
    paddingVertical: 28,
    paddingHorizontal: 22,
    alignItems: 'center',
    borderTopWidth: 4,
    borderTopColor: RED,
  },
  headline: {
    fontFamily: 'Inter_700Bold',
    fontSize: 24,
    color: '#fff',
    letterSpacing: 1.3,
    textAlign: 'center',
    marginBottom: 24,
  },
  input: {
    width: '100%',
    backgroundColor: DARK,
    borderColor: '#333',
    borderWidth: 1.5,
    borderRadius: 8,
    paddingVertical: 14,
    paddingHorizontal: 18,
    fontFamily: 'Inter_700Bold',
    fontSize: 15,
    color: '#eee',
    marginBottom: 18,
  },
  toggleRow: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 22,
  },
  toggleLabel: {
    fontFamily: 'Inter_700Bold',
    fontSize: 15,
    color: '#eee',
    letterSpacing: 1,
  },
  btn: {
    width: '100%',
    backgroundColor: RED,
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 26,
  },
  btnText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 16,
    color: '#fff',
    letterSpacing: 1.2,
  },
  cta: {
    fontFamily: 'Inter_700Bold',
    fontSize: 13,
    color: '#aaa',
    letterSpacing: 1,
  },
  ctaRed: {
    color: RED,
  },
});
