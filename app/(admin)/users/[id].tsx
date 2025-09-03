// File: app/(admin)/users/[id].tsx
// Firestore allowed at module scope; no Auth imports here.

import { db } from '@/firebase';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { FieldValue, Timestamp, deleteDoc, doc, getDoc, serverTimestamp, updateDoc } from 'firebase/firestore';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';

type UserRole = 'fan' | 'fighter' | 'admin' | 'moderator';

type UserDoc = {
  displayName?: string;
  username?: string;
  email?: string;
  role?: UserRole;
  city?: string;
  country?: string;
  weightClass?: string;
  avatarUrl?: string;
  isBanned?: boolean;
  createdAt?: Timestamp | FieldValue;
  updatedAt?: Timestamp | FieldValue;
};

export default function AdminUserDetailScreen(): React.ReactElement {
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const router = useRouter();

  // normalize id param
  const userId = useMemo(() => {
    const raw = params.id;
    return Array.isArray(raw) ? raw[0] : raw;
  }, [params.id]);

  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [deleting, setDeleting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // form state
  const [displayName, setDisplayName] = useState<string>('');
  const [username, setUsername] = useState<string>('');
  const [email, setEmail] = useState<string>('');
  const [role, setRole] = useState<UserRole>('fan');
  const [city, setCity] = useState<string>('');
  const [country, setCountry] = useState<string>('');
  const [weightClass, setWeightClass] = useState<string>('');
  const [isBanned, setIsBanned] = useState<boolean>(false);

  useEffect(() => {
    if (!userId) {
      setError('Missing user id');
      setLoading(false);
      return;
    }

    (async () => {
      try {
        const ref = doc(db, 'users', userId);
        const snap = await getDoc(ref);
        if (!snap.exists()) {
          setError('User not found');
          setLoading(false);
          return;
        }
        const data = (snap.data() as UserDoc) ?? {};
        setDisplayName(data.displayName ?? '');
        setUsername(data.username ?? '');
        setEmail(data.email ?? '');
        setRole((data.role as UserRole) ?? 'fan');
        setCity(data.city ?? '');
        setCountry(data.country ?? '');
        setWeightClass(data.weightClass ?? '');
        setIsBanned(Boolean(data.isBanned));
        setLoading(false);
      } catch (e: unknown) {
        setError(String(e));
        setLoading(false);
      }
    })();
  }, [userId]);

  const handleSave = useCallback(async () => {
    if (!userId) return;
    setSaving(true);
    try {
      const ref = doc(db, 'users', userId);
      const payload: Partial<UserDoc> = {
        displayName: displayName.trim() || undefined,
        username: username.trim() || undefined,
        email: email.trim() || undefined,
        role,
        city: city.trim() || undefined,
        country: country.trim() || undefined,
        weightClass: weightClass.trim() || undefined,
        isBanned,
        updatedAt: serverTimestamp(), // FieldValue allowed by type
      };
      await updateDoc(ref, payload);
      Alert.alert('Saved', 'User updated successfully.');
    } catch (e: unknown) {
      Alert.alert('Error', 'Failed to save user.');
      console.warn('[admin/users/[id]] save error:', e);
    } finally {
      setSaving(false);
    }
  }, [userId, displayName, username, email, role, city, country, weightClass, isBanned]);

  const handleDelete = useCallback(() => {
    if (!userId) return;
    Alert.alert('Delete User', 'This will remove the user document. Continue?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          setDeleting(true);
          try {
            await deleteDoc(doc(db, 'users', userId));
            router.back();
          } catch (e: unknown) {
            Alert.alert('Error', 'Failed to delete user.');
            console.warn('[admin/users/[id]] delete error:', e);
          } finally {
            setDeleting(false);
          }
        },
      },
    ]);
  }, [userId, router]);

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator />
      </View>
    );
  }
  if (error) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 16 }}>
        <Text style={{ textAlign: 'center' }}>Error: {error}</Text>
      </View>
    );
  }

  return (
    <ScrollView style={{ flex: 1, backgroundColor: '#fff' }} contentContainerStyle={{ padding: 16, paddingBottom: 48 }}>
      <Text style={{ fontSize: 18, fontWeight: '700', marginBottom: 12 }}>Edit User</Text>

      <Field label="Display Name">
        <TextInput value={displayName} onChangeText={setDisplayName} style={inputStyle} placeholder="e.g. John Doe" />
      </Field>

      <Field label="Username">
        <TextInput value={username} onChangeText={setUsername} style={inputStyle} autoCapitalize="none" placeholder="e.g. johndoe" />
      </Field>

      <Field label="Email">
        <TextInput value={email} onChangeText={setEmail} style={inputStyle} autoCapitalize="none" keyboardType="email-address" placeholder="e.g. john@example.com" />
      </Field>

      <Field label="Role">
        <TextInput value={role} onChangeText={(t) => setRole((t as UserRole) || 'fan')} style={inputStyle} placeholder="fan | fighter | admin | moderator" />
      </Field>

      <Field label="City">
        <TextInput value={city} onChangeText={setCity} style={inputStyle} placeholder="City" />
      </Field>

      <Field label="Country">
        <TextInput value={country} onChangeText={setCountry} style={inputStyle} placeholder="Country" />
      </Field>

      <Field label="Weight Class">
        <TextInput value={weightClass} onChangeText={setWeightClass} style={inputStyle} placeholder="e.g. Lightweight" />
      </Field>

      <Field label="Banned">
        <TouchableOpacity
          onPress={() => setIsBanned((v) => !v)}
          style={{ padding: 12, borderRadius: 10, backgroundColor: isBanned ? 'rgba(239,68,68,0.15)' : '#f3f4f6' }}
        >
          <Text style={{ fontWeight: '600', color: isBanned ? '#7f1d1d' : '#111827' }}>
            {isBanned ? 'Yes (tap to toggle)' : 'No (tap to toggle)'}
          </Text>
        </TouchableOpacity>
      </Field>

      <View style={{ flexDirection: 'row', gap: 12, marginTop: 12 }}>
        <TouchableOpacity
          onPress={handleSave}
          disabled={saving}
          style={{
            flex: 1,
            borderRadius: 10,
            paddingVertical: 14,
            alignItems: 'center',
            backgroundColor: '#f70000',
            opacity: saving ? 0.7 : 1,
          }}
        >
          <Text style={{ color: '#fff', fontWeight: '700' }}>{saving ? 'Saving…' : 'Save'}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={handleDelete}
          disabled={deleting}
          style={{
            width: 120,
            borderRadius: 10,
            paddingVertical: 14,
            alignItems: 'center',
            backgroundColor: 'rgba(239,68,68,0.1)',
            opacity: deleting ? 0.7 : 1,
          }}
        >
          <Text style={{ color: '#991b1b', fontWeight: '700' }}>{deleting ? 'Deleting…' : 'Delete'}</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }): React.ReactElement {
  return (
    <View style={{ marginBottom: 12 }}>
      <Text style={{ marginBottom: 6, color: '#374151', fontWeight: '600' }}>{label}</Text>
      {children}
    </View>
  );
}

const inputStyle = {
  backgroundColor: '#f3f4f6',
  borderRadius: 10,
  paddingHorizontal: 12,
  paddingVertical: 10,
} as const;
