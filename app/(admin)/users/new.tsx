// File: app/(admin)/users/new.tsx
// Firestore allowed at module scope; no Auth imports here.

import { db } from '@/firebase';
import { useRouter } from 'expo-router';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';

type UserRole = 'fan' | 'fighter' | 'admin' | 'moderator';

type CreateUserPayload = {
  displayName?: string;
  username?: string;
  email?: string;
  role?: UserRole;
  city?: string;
  country?: string;
  weightClass?: string;
  isBanned?: boolean;
  createdAt?: any;
  updatedAt?: any;
};

const USERS_COL = collection(db, 'users');

export default function AdminUserNewScreen(): React.ReactElement {
  const router = useRouter();

  const [displayName, setDisplayName] = useState<string>('');
  const [username, setUsername] = useState<string>('');
  const [email, setEmail] = useState<string>('');
  const [role, setRole] = useState<UserRole>('fan');
  const [city, setCity] = useState<string>('');
  const [country, setCountry] = useState<string>('');
  const [weightClass, setWeightClass] = useState<string>('');
  const [submitting, setSubmitting] = useState<boolean>(false);

  const handleCreate = useCallback(async () => {
    if (!displayName.trim()) {
      Alert.alert('Missing', 'Display name is required.');
      return;
    }
    setSubmitting(true);
    try {
      const payload: CreateUserPayload = {
        displayName: displayName.trim(),
        username: username.trim() || undefined,
        email: email.trim() || undefined,
        role,
        city: city.trim() || undefined,
        country: country.trim() || undefined,
        weightClass: weightClass.trim() || undefined,
        isBanned: false,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      const ref = await addDoc(USERS_COL, payload);
      // Navigate to detail after creation
      router.replace({ pathname: '/(admin)/users/[id]', params: { id: ref.id } });
    } catch (e: unknown) {
      console.warn('[admin/users/new] create error:', e);
      Alert.alert('Error', 'Failed to create user.');
    } finally {
      setSubmitting(false);
    }
  }, [displayName, username, email, role, city, country, weightClass, router]);

  return (
    <ScrollView style={{ flex: 1, backgroundColor: '#fff' }} contentContainerStyle={{ padding: 16, paddingBottom: 48 }}>
      <Text style={{ fontSize: 18, fontWeight: '700', marginBottom: 12 }}>New User</Text>

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

      <TouchableOpacity
        onPress={handleCreate}
        disabled={submitting}
        style={{
          marginTop: 12,
          borderRadius: 10,
          paddingVertical: 14,
          alignItems: 'center',
          backgroundColor: '#f70000',
          opacity: submitting ? 0.7 : 1,
        }}
      >
        {submitting ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff', fontWeight: '700' }}>Create</Text>}
      </TouchableOpacity>
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
