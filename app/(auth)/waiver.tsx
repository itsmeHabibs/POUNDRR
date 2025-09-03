// File: app/(auth)/waiver.tsx
// Rules: no top-level firebase/auth imports; Firestore (non-lite) OK; default export; strict-friendly TS.

import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    KeyboardAvoidingView,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    Switch,
    Text,
    TextInput,
    View,
} from 'react-native';

import { db } from '@/firebase';
import { useAuthUid } from '@/hooks/useAuthUid';
import { doc, FieldValue, getDoc, serverTimestamp, setDoc, Timestamp } from 'firebase/firestore';

const RED = '#f70000';

type UserWaiverFields = {
  waiverAccepted?: boolean;
  waiverAcceptedAt?: Timestamp | FieldValue;
  waiverSignatureName?: string;
  waiverVersion?: string; // if you version the copy
  updatedAt?: Timestamp | FieldValue;
};

export default function WaiverScreen(): React.ReactElement {
  const router = useRouter();
  const { uid, error: authErr } = useAuthUid();
  const params = useLocalSearchParams<{ next?: string | string[] }>();

  const [loading, setLoading] = useState<boolean>(true);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [alreadyAccepted, setAlreadyAccepted] = useState<boolean>(false);

  // form state
  const [agree, setAgree] = useState<boolean>(false);
  const [name, setName] = useState<string>('');

  const nextRoute = useMemo(() => {
    const raw = params.next;
    const val = Array.isArray(raw) ? raw[0] : raw;
    return val || '/complete-profile'; // default continuation
  }, [params.next]);

  // preload current waiver status
  useEffect(() => {
    if (!uid) {
      setLoading(false);
      return;
    }
    (async () => {
      try {
        const ref = doc(db, 'users', uid);
        const snap = await getDoc(ref);
        if (snap.exists()) {
          const d = (snap.data() as UserWaiverFields) ?? {};
          if (d.waiverAccepted) {
            setAlreadyAccepted(true);
          }
        }
      } catch (e) {
        console.warn('[waiver] preload error:', e);
      } finally {
        setLoading(false);
      }
    })();
  }, [uid]);

  const disabled = useMemo(() => !agree || name.trim().length < 2 || submitting, [agree, name, submitting]);

  const handleAccept = useCallback(async () => {
    if (!uid) {
      Alert.alert('Not signed in', 'Please log in again.');
      return;
    }
    if (!agree) {
      Alert.alert('Please agree', 'You must agree to the waiver to continue.');
      return;
    }
    if (name.trim().length < 2) {
      Alert.alert('Missing signature', 'Please type your full name as a signature.');
      return;
    }

    try {
      setSubmitting(true);
      const ref = doc(db, 'users', uid);
      const payload: Partial<UserWaiverFields> = {
        waiverAccepted: true,
        waiverAcceptedAt: serverTimestamp(),
        waiverSignatureName: name.trim(),
        waiverVersion: 'v1', // bump this if you update the waiver text
        updatedAt: serverTimestamp(),
      };
      await setDoc(ref, payload, { merge: true });

      router.replace(nextRoute);
    } catch (e: unknown) {
      console.warn('[waiver] accept error:', e);
      const message = (e as { message?: string })?.message ?? 'Could not save your waiver acceptance.';
      Alert.alert('Error', message);
    } finally {
      setSubmitting(false);
    }
  }, [uid, agree, name, nextRoute, router]);

  if (authErr) {
    return (
      <View style={styles.center}>
        <Text style={styles.body}>Auth error: {authErr}</Text>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#fff" />
      </View>
    );
  }

  if (!uid) {
    return (
      <View style={styles.center}>
        <Text style={styles.body}>You’re signed out. Please log in.</Text>
        <Pressable onPress={() => router.replace('/login')} style={({ pressed }) => [styles.btnGhost, pressed && { opacity: 0.85 }]}>
          <Text style={styles.btnGhostText}>Go to Login</Text>
        </Pressable>
      </View>
    );
  }

  if (alreadyAccepted) {
    // If user already accepted, move them on immediately
    return (
      <View style={styles.center}>
        <Text style={styles.body}>Waiver already accepted.</Text>
        <Pressable onPress={() => router.replace(nextRoute)} style={({ pressed }) => [styles.btnPrimary, pressed && { opacity: 0.9 }]}>
          <Text style={styles.btnPrimaryText}>Continue</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.select({ ios: 'padding', android: undefined })}
      keyboardVerticalOffset={Platform.select({ ios: 64, android: 0 })}
    >
      <View style={styles.container}>
        <Text style={styles.title}>Waiver & Release</Text>

        <View style={styles.card}>
          <ScrollView
            style={{ maxHeight: 320 }}
            contentContainerStyle={{ paddingRight: 6 }}
            showsVerticalScrollIndicator
          >
            <Text style={styles.body}>
              By participating in Poundrr’s services, activities, and events (the “Activities”),
              you acknowledge and agree to the following:
            </Text>

            <Text style={[styles.body, styles.mt12]}>
              1. <Text style={styles.bold}>Assumption of Risk:</Text> You understand combat sports and fitness training involve inherent risks,
              including serious injury. You knowingly and voluntarily accept all such risks.
            </Text>

            <Text style={[styles.body, styles.mt12]}>
              2. <Text style={styles.bold}>Release:</Text> To the fullest extent permitted by law, you release Poundrr, its affiliates, instructors,
              contractors, sponsors, and venues from any liability arising from your participation in the Activities.
            </Text>

            <Text style={[styles.body, styles.mt12]}>
              3. <Text style={styles.bold}>Medical Fitness:</Text> You confirm you are medically fit to participate and will stop if you experience pain,
              dizziness, or other concerning symptoms.
            </Text>

            <Text style={[styles.body, styles.mt12]}>
              4. <Text style={styles.bold}>Rules & Conduct:</Text> You agree to follow safety rules, instructions, and applicable laws and venue policies.
            </Text>

            <Text style={[styles.body, styles.mt12]}>
              5. <Text style={styles.bold}>Media Consent (optional):</Text> You consent to respectful use of photos/videos captured during Activities.
              If you do not consent, you will notify organizers in advance.
            </Text>

            <Text style={[styles.body, styles.mt12]}>
              6. <Text style={styles.bold}>Governing Law:</Text> This agreement is governed by applicable law in your jurisdiction. Nothing here excludes
              liability that cannot be excluded by law.
            </Text>

            <Text style={[styles.body, styles.mt16]}>
              By toggling “I Agree” and typing your full name below, you acknowledge you have read and understood this Waiver & Release.
            </Text>
          </ScrollView>

          {/* Agree toggle */}
          <View style={styles.toggleRow}>
            <Text style={styles.toggleLabel}>I AGREE</Text>
            <Switch
              value={agree}
              onValueChange={setAgree}
              trackColor={{ false: '#333', true: '#501111' }}
              thumbColor={agree ? RED : '#888'}
            />
          </View>

          {/* Signature name */}
          <Text style={[styles.label, { marginTop: 4 }]}>Type your full name as a signature</Text>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="FULL NAME"
            placeholderTextColor="#9ca3af"
            autoCapitalize="words"
            style={styles.input}
          />

          <Pressable
            onPress={handleAccept}
            disabled={disabled}
            style={({ pressed }) => [
              styles.btnPrimary,
              (pressed || submitting) && { opacity: 0.9 },
              disabled && { opacity: 0.6 },
            ]}
          >
            {submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnPrimaryText}>Accept & Continue</Text>}
          </Pressable>

          <Text style={styles.helper}>
            Need to review later? You can return to this page from your profile if required.
          </Text>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

/* ---------- styles ---------- */
const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  container: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 36,
  },
  card: {
    backgroundColor: 'rgba(0,0,0,0.70)',
    borderRadius: 12,
    paddingVertical: 18,
    paddingHorizontal: 16,
    borderTopWidth: 4,
    borderTopColor: RED,
  },
  title: {
    fontFamily: 'Inter_700Bold',
    fontSize: 24,
    color: '#fff',
    letterSpacing: 1.1,
    textAlign: 'center',
    marginBottom: 12,
  },
  body: {
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    color: '#e5e7eb',
  },
  bold: {
    fontFamily: 'Inter_700Bold',
    color: '#fff',
  },
  mt12: { marginTop: 12 },
  mt16: { marginTop: 16 },
  toggleRow: {
    marginTop: 14,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  toggleLabel: {
    fontFamily: 'Inter_700Bold',
    fontSize: 14,
    color: '#eee',
    letterSpacing: 1,
  },
  label: {
    fontFamily: 'Inter_700Bold',
    fontSize: 12,
    color: '#cbd5e1',
    letterSpacing: 0.5,
    marginBottom: 6,
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
  helper: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    color: '#cbd5e1',
    textAlign: 'center',
    marginTop: 8,
  },
  btnPrimary: {
    width: '100%',
    backgroundColor: RED,
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 6,
  },
  btnPrimaryText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 16,
    color: '#fff',
    letterSpacing: 1.1,
  },
  btnGhost: {
    marginTop: 10,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderColor: '#444',
    borderWidth: 1,
    alignItems: 'center',
  },
  btnGhostText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 14,
    color: '#fff',
  },
});
