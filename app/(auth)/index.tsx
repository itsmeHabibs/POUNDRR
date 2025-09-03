// File: app/(auth)/index.tsx
// - No top-level firebase/auth imports (not needed here).
// - Default export component, strict-friendly typing.
// - Designed to sit over your background video from app/(auth)/_layout.tsx.
// - Uses Inter fonts set in styles per element.

import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Image, Modal, Pressable, StyleSheet, Text, View } from 'react-native';

const RED = '#f70000';

export default function AuthIndex(): React.ReactElement {
  const router = useRouter();
  const [open, setOpen] = useState<boolean>(false);

  return (
    <View style={styles.root}>
      {/* Center stack: logo + tagline */}
      <View style={styles.center}>
        <Image
          source={require('../../assets/logo.png')}
          style={styles.logo}
          resizeMode="contain"
        />
        <Text style={styles.tagline}>Raw. Real. Swipe.</Text>
      </View>

      {/* CTA near bottom */}
      <Pressable
        accessibilityRole="button"
        style={({ pressed }) => [styles.btn, pressed && { opacity: 0.9 }]}
        onPress={() => setOpen(true)}
      >
        <Text style={styles.btnText}>LETS GO</Text>
      </Pressable>

      {/* Login / Signup modal */}
      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={() => setOpen(false)}
      >
        <View style={styles.backdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Welcome!</Text>

            <Pressable
              accessibilityRole="button"
              style={({ pressed }) => [styles.modalBtn, styles.login, pressed && { opacity: 0.9 }]}
              onPress={() => {
                setOpen(false);
                router.push('/login'); // lives inside (auth) group → /login is correct
              }}
            >
              <Text style={[styles.modalBtnText, styles.modalBtnTextDark]}>Log In</Text>
            </Pressable>

            <Pressable
              accessibilityRole="button"
              style={({ pressed }) => [styles.modalBtn, styles.signup, pressed && { opacity: 0.9 }]}
              onPress={() => {
                setOpen(false);
                router.push('/signup'); // lives inside (auth) group → /signup is correct
              }}
            >
              <Text style={[styles.modalBtnText, styles.modalBtnTextLight]}>Sign Up</Text>
            </Pressable>

            <Pressable
              accessibilityRole="button"
              onPress={() => setOpen(false)}
              style={({ pressed }) => [{ marginTop: 8, opacity: pressed ? 0.7 : 1 }]}
            >
              <Text style={styles.cancelText}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

/* styles */
const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-start',
  },

  // stack with logo + slogan
  center: {
    alignItems: 'center',
    marginTop: 160, // positions like the original
  },

  logo: {
    width: 270,
    height: 300,
    marginBottom: -90, // tighten gap like your inspo
  },

  tagline: {
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    color: '#fff',
    textAlign: 'center',
  },

  // CTA button
  btn: {
    position: 'absolute',
    bottom: 80,
    width: '80%',
    paddingVertical: 12,
    borderRadius: 30,
    backgroundColor: RED,
    alignItems: 'center',
  },
  btnText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 18,
    color: '#fff',
    letterSpacing: 1.5,
  },

  // modal
  backdrop: {
    flex: 1,
    backgroundColor: '#00000088',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalCard: {
    width: '80%',
    backgroundColor: '#1e1e1e',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
  },
  modalTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: 24,
    color: '#fff',
    marginBottom: 24,
  },
  modalBtn: {
    width: '100%',
    paddingVertical: 12,
    borderRadius: 28,
    alignItems: 'center',
    marginBottom: 12,
  },
  login: {
    backgroundColor: '#fff',
  },
  signup: {
    backgroundColor: RED,
  },
  modalBtnText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 16,
  },
  modalBtnTextDark: {
    color: '#000',
  },
  modalBtnTextLight: {
    color: '#fff',
  },
  cancelText: {
    fontFamily: 'Inter_400Regular',
    color: '#cbd5e1',
    fontSize: 14,
  },
});

