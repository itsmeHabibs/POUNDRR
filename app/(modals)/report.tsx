// File: app/(modals)/report.tsx
// Notes:
// - No top-level firebase/auth imports.
// - Uses eager Firestore `db` (allowed) and lazy auth via useAuthUid().
// - Default export component; strict-friendly TS.
// - Open with params, e.g.:
//   router.push({
//     pathname: '/(modals)/report',
//     params: {
//       type: 'highlight',            // any string: 'user' | 'fight' | 'highlight' | ...
//       targetId: someId,
//       targetName: 'John vs Jake',   // optional display name
//       preselect: 'abuse',           // optional reason preselect
//       returnTo: '/(tabs)/home',     // optional
//     },
//   });

import { db } from '@/firebase';
import { useAuthUid } from '@/hooks/useAuthUid';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

type Params = {
  type?: string | string[];
  targetId?: string | string[];
  targetName?: string | string[];
  preselect?: Reason | Reason[]; // optional
  returnTo?: string | string[];
};

type Reason =
  | 'spam'
  | 'abuse'
  | 'harassment'
  | 'hate'
  | 'nudity'
  | 'violent'
  | 'self_harm'
  | 'misinformation'
  | 'illegal'
  | 'other';

type ReportDoc = {
  targetType?: string;
  targetId?: string;
  targetName?: string;
  reason: Reason;
  details?: string | null;
  reporterUid: string;
  createdAt: any; // serverTimestamp FieldValue
  status: 'open' | 'reviewing' | 'closed';
  platform?: 'ios' | 'android' | 'web' | 'native';
  app?: 'poundrr';
};

const RED = '#f70000';
const CARD_BG = 'rgba(0,0,0,0.82)';
const BORDER = 'rgba(255,255,255,0.14)';

function toSingle<T extends string>(v?: T | T[]): T | undefined {
  if (v == null) return undefined;
  return Array.isArray(v) ? v[0] : v;
}

const REASONS: { key: Reason; label: string }[] = [
  { key: 'spam',           label: 'Spam / Ads' },
  { key: 'abuse',          label: 'Abusive content' },
  { key: 'harassment',     label: 'Harassment' },
  { key: 'hate',           label: 'Hate / Discrimination' },
  { key: 'nudity',         label: 'Nudity / Sexual content' },
  { key: 'violent',        label: 'Graphic / Violent' },
  { key: 'self_harm',      label: 'Self-harm / Dangerous' },
  { key: 'misinformation', label: 'Misinformation' },
  { key: 'illegal',        label: 'Illegal activity' },
  { key: 'other',          label: 'Other' },
];

export default function ReportModal(): React.ReactElement {
  const router = useRouter();
  const { uid } = useAuthUid();

  const params = useLocalSearchParams<Params>();
  const targetType = useMemo(() => toSingle(params.type), [params.type]);
  const targetId = useMemo(() => toSingle(params.targetId), [params.targetId]);
  const targetName = useMemo(() => toSingle(params.targetName), [params.targetName]);
  const preselected = useMemo(() => toSingle(params.preselect), [params.preselect]);
  const returnTo = useMemo(() => toSingle(params.returnTo), [params.returnTo]);

  const [reason, setReason] = useState<Reason>(preselected ?? 'spam');
  const [details, setDetails] = useState<string>('');
  const [submitting, setSubmitting] = useState<boolean>(false);

  const needsDetails = reason === 'other';
  const canSubmit =
    !!uid && !!reason && (!needsDetails || details.trim().length >= 8) && !submitting;

  const handleClose = useCallback(() => {
    if (returnTo) router.replace(returnTo);
    else router.back();
  }, [returnTo, router]);

  const handleSubmit = useCallback(async () => {
    if (!uid) {
      Alert.alert('Sign in required', 'Please log in to submit a report.');
      return;
    }
    if (!reason) return;

    if (needsDetails && details.trim().length < 8) {
      Alert.alert('Add details', 'Please describe the issue (at least 8 characters).');
      return;
    }

    try {
      setSubmitting(true);
      const payload: ReportDoc = {
        targetType: targetType ?? undefined,
        targetId: targetId ?? undefined,
        targetName: targetName ?? undefined,
        reason,
        details: details.trim() ? details.trim() : null,
        reporterUid: uid,
        createdAt: serverTimestamp(),
        status: 'open',
        platform: Platform.OS === 'ios' ? 'ios' : Platform.OS === 'android' ? 'android' : 'native',
        app: 'poundrr',
      };
      await addDoc(collection(db, 'reports'), payload);

      Alert.alert('Thank you', 'Your report has been submitted.');
      handleClose();
    } catch (e: unknown) {
      console.warn('[report] submit error:', e);
      const msg = (e as { message?: string })?.message ?? 'Failed to submit report.';
      Alert.alert('Error', msg);
      setSubmitting(false);
    }
  }, [uid, reason, details, needsDetails, targetType, targetId, targetName, handleClose]);

  // Signed-out fallback
  if (!uid) {
    return (
      <SafeAreaView style={styles.root}>
        <View style={styles.card}>
          <Text style={styles.heading}>Report content</Text>
          <Text style={styles.body}>
            You need to be signed in to submit a report.
          </Text>
          <View style={styles.actions}>
            <Pressable
              onPress={() => router.replace('/login')}
              style={({ pressed }) => [styles.btnPrimary, pressed && { opacity: 0.9 }]}
            >
              <Text style={styles.btnPrimaryText}>Go to Login</Text>
            </Pressable>
            <Pressable
              onPress={handleClose}
              style={({ pressed }) => [styles.btnGhost, pressed && { opacity: 0.85 }]}
            >
              <Text style={styles.btnGhostText}>Close</Text>
            </Pressable>
          </View>
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
        <View style={styles.card}>
          <Text style={styles.heading}>Report {targetType ?? 'content'}</Text>
          {!!(targetName || targetId) && (
            <Text style={[styles.body, { marginTop: 4 }]}>
              {targetName ?? `ID: ${targetId}`}
            </Text>
          )}

          {/* Reasons */}
          <Text style={[styles.label, { marginTop: 14 }]}>Reason</Text>
          <View style={styles.pillsWrap}>
            {REASONS.map((r) => {
              const selected = r.key === reason;
              return (
                <Pressable
                  key={r.key}
                  onPress={() => setReason(r.key)}
                  style={({ pressed }) => [
                    styles.pill,
                    selected && styles.pillSelected,
                    pressed && { opacity: 0.9 },
                  ]}
                >
                  <Text style={[styles.pillText, selected && styles.pillTextSelected]}>
                    {r.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {/* Details */}
          <Text style={[styles.label, { marginTop: 16 }]}>
            Additional details {needsDetails ? '(required)' : '(optional)'}
          </Text>
          <TextInput
            style={[styles.input, styles.inputMultiline]}
            placeholder="Tell us what happened…"
            placeholderTextColor="#9ca3af"
            value={details}
            onChangeText={setDetails}
            multiline
          />

          {/* Actions */}
          <View style={styles.actions}>
            <Pressable
              onPress={handleSubmit}
              disabled={!canSubmit}
              style={({ pressed }) => [
                styles.btnPrimary,
                (pressed || submitting || !canSubmit) && { opacity: 0.85 },
              ]}
            >
              {submitting ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.btnPrimaryText}>Submit Report</Text>
              )}
            </Pressable>

            <Pressable
              onPress={handleClose}
              style={({ pressed }) => [styles.btnGhost, pressed && { opacity: 0.85 }]}
            >
              <Text style={styles.btnGhostText}>Cancel</Text>
            </Pressable>
          </View>

          <Text style={styles.helper}>
            Reports are reviewed by moderators. Misuse of this tool may result in account restrictions.
          </Text>
        </View>
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}

/* ---------- styles ---------- */
const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.9)', // modal backdrop
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  card: {
    width: '100%',
    maxWidth: 460,
    backgroundColor: CARD_BG,
    borderRadius: 16,
    paddingHorizontal: 18,
    paddingVertical: 18,
    borderTopWidth: 4,
    borderTopColor: RED,
  },
  heading: {
    fontFamily: 'Inter_700Bold',
    color: '#fff',
    fontSize: 20,
    letterSpacing: 0.6,
  },
  body: {
    fontFamily: 'Inter_400Regular',
    color: '#e5e7eb',
    fontSize: 14,
  },
  label: {
    fontFamily: 'Inter_700Bold',
    color: '#cbd5e1',
    fontSize: 12,
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  pillsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  pill: {
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  pillSelected: {
    borderColor: '#fff',
    backgroundColor: 'rgba(247,0,0,0.16)',
  },
  pillText: {
    fontFamily: 'Inter_700Bold',
    color: '#e5e7eb',
    fontSize: 12,
  },
  pillTextSelected: {
    color: '#fff',
  },
  input: {
    backgroundColor: '#161616',
    borderColor: '#333',
    borderWidth: 1.5,
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    color: '#eee',
    fontFamily: 'Inter_700Bold',
    fontSize: 14,
  },
  inputMultiline: {
    minHeight: 96,
    textAlignVertical: 'top',
  },
  actions: {
    marginTop: 14,
    gap: 10,
  },
  btnPrimary: {
    width: '100%',
    backgroundColor: RED,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  btnPrimaryText: {
    fontFamily: 'Inter_700Bold',
    color: '#fff',
    fontSize: 16,
    letterSpacing: 0.8,
  },
  btnGhost: {
    width: '100%',
    paddingVertical: 12,
    borderRadius: 10,
    borderColor: '#444',
    borderWidth: 1,
    alignItems: 'center',
  },
  btnGhostText: {
    fontFamily: 'Inter_700Bold',
    color: '#fff',
    fontSize: 14,
  },
  helper: {
    marginTop: 8,
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    color: '#9ca3af',
    textAlign: 'center',
  },
});
