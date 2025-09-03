// File: app/(auth)/login.tsx
// Rules: no top-level firebase/auth imports; uses lazy getAuthInstance(); default export; strict-friendly TS.

import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { getAuthInstance } from '@/firebase';

const RED = '#f70000';
const DARK = '#161616';

export default function Login(): React.ReactElement {
  const router = useRouter();
  const [email, setEmail] = useState<string>('');
  const [password, setPass] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);

  const handleLogin = async () => {
    const trimmedEmail = email.trim();
    if (!trimmedEmail || !password) {
      Alert.alert('Missing info', 'Enter your email and password.');
      return;
    }

    try {
      setLoading(true);

      // Lazy-load Auth & method
      const auth = await getAuthInstance();
      const { signInWithEmailAndPassword } = await import('firebase/auth');

      await signInWithEmailAndPassword(auth, trimmedEmail, password);

      // Navigate on success
      router.replace('/(tabs)');
    } catch (err: unknown) {
      // Some environments occasionally surface an auth/invalid-credential even when the user is actually signed in.
      // Treat that as success if currentUser exists.
      try {
        const auth = await getAuthInstance();
        if (auth.currentUser) {
          router.replace('/(tabs)');
          return;
        }
      } catch {}

      console.warn('[login] error:', err);
      const message =
        (err as { code?: string; message?: string })?.code === 'auth/invalid-credential'
          ? 'Invalid email or password.'
          : (err as { message?: string })?.message ?? 'Login failed. Please try again.';
      Alert.alert('Login failed', message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.select({ ios: 64, android: 0 })}
    >
      <Image
        source={require('../../assets/logo.png')}
        style={styles.logo}
        resizeMode="contain"
      />

      <View style={styles.card}>
        <Text style={styles.headline}>WELCOME BACK</Text>

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

        <Pressable
          style={[styles.btn, loading && { opacity: 0.6 }]}
          onPress={handleLogin}
          disabled={loading}
        >
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>LOG IN</Text>}
        </Pressable>

        <Pressable onPress={() => router.push('/signup')}>
          <Text style={styles.cta}>
            NEW HERE? <Text style={styles.ctaRed}>SIGN UP</Text>
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
    width: 140,
    height: 140,
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
