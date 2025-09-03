// File: app/(auth)/complete-profile.tsx
// Rules: no top-level firebase/auth usage; Firestore OK; default export; strict-friendly TS.

import { db } from '@/firebase';
import { useAuthUid } from '@/hooks/useAuthUid';
import { useRouter } from 'expo-router';
import {
  FieldValue,
  Timestamp,
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  serverTimestamp,
  setDoc,
  where,
} from 'firebase/firestore';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

type UserRole = 'fan' | 'fighter';

type UserDoc = {
  displayName?: string;
  username?: string;
  usernameLower?: string;
  email?: string;
  role?: UserRole;
  city?: string;
  country?: string;
  weightKg?: number;          // NEW: store raw kg
  weightClass?: string;       // derived from kg
  avatarUrl?: string;
  createdAt?: Timestamp | FieldValue;
  updatedAt?: Timestamp | FieldValue;
};

const USERS_COL = collection(db, 'users');

// ----- Country / City options -----
type CountryKey = 'Germany' | 'UAE';
const COUNTRY_OPTIONS: CountryKey[] = ['Germany', 'UAE'];
const CITY_OPTIONS: Record<CountryKey, string[]> = {
  Germany: ['Frankfurt', 'Munich'],
  UAE: [
    'Abu Dhabi',
    'Dubai',
    'Sharjah',
    'Ajman',
    'Umm Al Quwain',
    'Ras Al Khaimah',
    'Fujairah',
  ],
};

// ----- Weight-class mapping (kg → class) -----
// Tweak thresholds anytime; these are common boxing-style buckets.
function mapWeightClassKg(kg: number): string {
  if (!isFinite(kg) || kg <= 0) return '';
  if (kg <= 52) return 'Flyweight';
  if (kg <= 57) return 'Featherweight';
  if (kg <= 61.2) return 'Lightweight';
  if (kg <= 66.7) return 'Welterweight';
  if (kg <= 72.6) return 'Middleweight';
  if (kg <= 79.4) return 'Light Heavyweight';
  if (kg <= 90.7) return 'Cruiserweight';
  return 'Heavyweight';
}

// Minimal inline dropdown
// Replace your Dropdown component with this
function Dropdown({
  value,
  placeholder,
  options,
  onChange,
  disabled,
}: {
  value: string;
  placeholder: string;
  options: string[];
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <View>
      <TouchableOpacity
        onPress={() => !disabled && setOpen((s) => !s)}
        activeOpacity={0.9}
        // ❌ removed styles.fontRegular here (view-only)
        style={[
          styles.input,
          disabled && { opacity: 0.6 },
        ]}
      >
        {/* ✅ keep font style on Text (text-only) */}
        <Text style={[{ color: value ? '#fff' : '#9ca3af' }, styles.fontRegular]}>
          {value || placeholder}
        </Text>
      </TouchableOpacity>

      {open && !disabled && (
        <View
          style={{
            marginTop: 6,
            borderRadius: 10,
            borderWidth: 1,
            borderColor: 'rgba(255,255,255,0.18)',
            backgroundColor: 'rgba(0,0,0,0.6)',
            overflow: 'hidden',
          }}
        >
          {options.map((opt) => (
            <TouchableOpacity
              key={opt}
              onPress={() => { onChange(opt); setOpen(false); }}
              activeOpacity={0.9}
              style={{ paddingVertical: 10, paddingHorizontal: 12 }}
            >
              <Text style={[{ fontSize: 14, color: '#fff' }, styles.fontRegular]}>{opt}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );
}


export default function CompleteProfileScreen(): React.ReactElement {
  const router = useRouter();
  const { uid, error: authError } = useAuthUid();

  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);

  // form
  const [role, setRole] = useState<UserRole>('fan');
  const [displayName, setDisplayName] = useState<string>('');
  const [username, setUsername] = useState<string>('');
  const [country, setCountry] = useState<CountryKey | ''>('');
  const [city, setCity] = useState<string>('');
  const [weightKgStr, setWeightKgStr] = useState<string>(''); // keep as string for input control

  // legacy (we still read it so existing users don’t lose it)
  const [legacyWeightClass, setLegacyWeightClass] = useState<string>('');

  // auth error unblocks loader
  useEffect(() => {
    if (authError) setLoading(false);
  }, [authError]);

  // preload existing profile to let users edit/continue
  useEffect(() => {
    if (!uid) return;
    (async () => {
      try {
        const ref = doc(db, 'users', uid);
        const snap = await getDoc(ref);
        if (snap.exists()) {
          const data = (snap.data() as UserDoc) ?? {};
          setRole((data.role as UserRole) ?? 'fan');
          setDisplayName(data.displayName ?? '');
          setUsername(data.username ?? '');
          setCountry(((data.country ?? '') as CountryKey) || '');
          setCity(data.city ?? '');
          if (typeof data.weightKg === 'number') setWeightKgStr(String(data.weightKg));
          setLegacyWeightClass(data.weightClass ?? '');
        }
      } catch (e) {
        console.warn('[complete-profile] preload error:', e);
      } finally {
        setLoading(false);
      }
    })();
  }, [uid]);

  // keep city in sync with country
  useEffect(() => {
    if (!country) {
      setCity('');
      return;
    }
    const allowed = CITY_OPTIONS[country];
    if (!allowed.includes(city)) setCity('');
  }, [country]); // eslint-disable-line react-hooks/exhaustive-deps

  const usernameLower = useMemo(() => username.trim().toLowerCase(), [username]);

  const weightKg = useMemo(() => {
    const n = parseFloat(weightKgStr);
    return isFinite(n) ? n : NaN;
  }, [weightKgStr]);

  const autoClass = useMemo(() => mapWeightClassKg(weightKg), [weightKg]);

  const validate = useCallback(async (): Promise<boolean> => {
    if (!uid) {
      Alert.alert('Not signed in', 'Please log in again.');
      return false;
    }
    if (!displayName.trim()) {
      Alert.alert('Missing name', 'Please enter your display name.');
      return false;
    }
    if (!usernameLower) {
      Alert.alert('Missing username', 'Please choose a username.');
      return false;
    }
    // very basic username format check
    if (!/^[a-z0-9._-]{3,20}$/.test(usernameLower)) {
      Alert.alert(
        'Invalid username',
        'Use 3–20 characters: a–z, 0–9, dot, underscore, or dash.'
      );
      return false;
    }
    if (role === 'fighter') {
      if (!isFinite(weightKg) || weightKg <= 0) {
        Alert.alert('Missing weight', 'Enter your body weight in kg.');
        return false;
      }
      if (!autoClass) {
        Alert.alert('Weight class error', 'Please check your kg value.');
        return false;
      }
    }

    // uniqueness check (ignoring current user)
    try {
      const q = query(USERS_COL, where('usernameLower', '==', usernameLower), limit(1));
      const snap = await getDocs(q);
      if (!snap.empty) {
        const hit = snap.docs[0];
        if (hit.id !== uid) {
          Alert.alert('Username taken', 'Please choose a different username.');
          return false;
        }
      }
    } catch (e) {
      console.warn('[complete-profile] username check failed:', e);
      // Don’t block user on transient errors — server rules should also protect
    }

    return true;
  }, [uid, displayName, usernameLower, role, weightKg, autoClass]);

  const handleSave = useCallback(async () => {
    if (!(await validate())) return;
    if (!uid) return;

    setSaving(true);
    try {
      const ref = doc(db, 'users', uid);

      const payload: Partial<UserDoc> = {
        displayName: displayName.trim(),
        username: usernameLower,
        usernameLower,
        role,
        // Dropdowns save clean values or undefined
        city: city || undefined,
        country: country || undefined,
        // Fighters: persist weightKg and the derived class
        weightKg: role === 'fighter' ? weightKg : undefined,
        weightClass: role === 'fighter' ? autoClass : undefined,
        updatedAt: serverTimestamp(),
        // If doc is new, also set createdAt (merge-safe)
        createdAt: serverTimestamp(),
      };

      await setDoc(ref, payload, { merge: true });

      // Go to your main app — adjust to your initial tab route if different.
      router.replace('/(tabs)');
    } catch (e) {
      console.warn('[complete-profile] save error:', e);
      Alert.alert('Error', 'Failed to save your profile. Please try again.');
    } finally {
      setSaving(false);
    }
  }, [validate, uid, displayName, usernameLower, role, city, country, weightKg, autoClass, router]);

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
        <Text style={[{ color: '#e5e7eb', fontSize: 14 }, styles.fontRegular]}>
          You’re signed out. Please log in again.
        </Text>
      </View>
    );
  }

  const citiesForCountry = country ? CITY_OPTIONS[country] : [];

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.select({ ios: 'padding', android: undefined })}
      keyboardVerticalOffset={Platform.select({ ios: 64, android: 0 })}
    >
      <ScrollView
        contentContainerStyle={{ padding: 20, paddingBottom: 48 }}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={[styles.title, styles.fontBold]}>Complete your profile</Text>
        <Text style={[styles.subtitle, styles.fontRegular]}>
          Tell us who you are to get started.
        </Text>

        {/* Role selector */}
        <Text style={[styles.label, styles.fontBold]}>I’m signing up as</Text>
        <View style={{ flexDirection: 'row', gap: 12, marginBottom: 16 }}>
          <Pill label="Fan" selected={role === 'fan'} onPress={() => setRole('fan')} />
          <Pill label="Fighter" selected={role === 'fighter'} onPress={() => setRole('fighter')} />
        </View>

        {/* Display Name */}
        <Field label="Display name">
          <TextInput
            value={displayName}
            onChangeText={setDisplayName}
            placeholder="e.g. John Doe"
            placeholderTextColor="#9ca3af"
            style={[styles.input, styles.fontRegular]}
          />
        </Field>

        {/* Username */}
        <Field label="Username">
          <TextInput
            value={username}
            onChangeText={setUsername}
            autoCapitalize="none"
            autoCorrect={false}
            placeholder="e.g. johndoe"
            placeholderTextColor="#9ca3af"
            style={[styles.input, styles.fontRegular]}
          />
          <Text style={[styles.helper, styles.fontRegular]}>
            Allowed: a–z, 0–9, dot, underscore, dash (3–20 chars).
          </Text>
        </Field>

        {/* Country */}
        <Field label="Country">
          <Dropdown
            value={country}
            placeholder="Select country"
            options={COUNTRY_OPTIONS}
            onChange={(c) => setCountry(c as CountryKey)}
          />
        </Field>

        {/* City (depends on country) */}
        <Field label="City">
          <Dropdown
            value={city}
            placeholder={country ? 'Select city' : 'Select a country first'}
            options={citiesForCountry}
            onChange={setCity}
            disabled={!country}
          />
        </Field>

        {/* Fighter-only: weight in kg (auto-derives class) */}
        {role === 'fighter' && (
          <Field label="Weight (kg)">
            <TextInput
              value={weightKgStr}
              onChangeText={(t) => setWeightKgStr(t.replace(',', '.'))}
              placeholder="e.g. 70.5"
              placeholderTextColor="#9ca3af"
              inputMode="decimal"
              keyboardType="numeric"
              style={[styles.input, styles.fontRegular]}
            />
            <Text style={[styles.helper, styles.fontRegular]}>
              Class (auto): {autoClass || (legacyWeightClass ? `current: ${legacyWeightClass}` : '—')}
            </Text>
          </Field>
        )}

        <TouchableOpacity
          onPress={handleSave}
          disabled={saving}
          activeOpacity={0.9}
          style={[styles.primaryBtn, saving && { opacity: 0.7 }]}
        >
          {saving ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={[styles.primaryText, styles.fontBold]}>Save & Continue</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <View style={{ marginBottom: 14 }}>
      <Text style={[styles.label, styles.fontBold]}>{label}</Text>
      {children}
    </View>
  );
}

function Pill({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}): React.ReactElement {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.9}
      style={[
        {
          paddingHorizontal: 14,
          paddingVertical: 10,
          borderRadius: 999,
          borderWidth: 1,
          borderColor: selected ? '#f70000' : 'rgba(255,255,255,0.35)',
          backgroundColor: selected ? 'rgba(247,0,0,0.16)' : 'rgba(0,0,0,0.2)',
        },
      ]}
    >
      <Text
        style={[{ color: selected ? '#fff' : '#e5e7eb', fontSize: 14 }, styles.fontBold]}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}

const styles = {
  center: {
    flex: 1,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: 'transparent',
  },
  title: { fontSize: 24, color: '#fff', marginBottom: 6 },
  subtitle: { fontSize: 14, color: '#e5e7eb', marginBottom: 16 },
  label: { fontSize: 13, color: '#e5e7eb', marginBottom: 6 },
  helper: { fontSize: 12, color: '#cbd5e1', marginTop: 6 },
  input: {
    backgroundColor: 'rgba(0,0,0,0.38)',
    borderColor: 'rgba(255,255,255,0.18)',
    borderWidth: 1,
    color: '#fff',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  primaryBtn: {
    marginTop: 12,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center' as const,
    backgroundColor: '#f70000',
  },
  primaryText: { color: '#fff', fontSize: 16 },
  fontRegular: { fontFamily: 'Inter_400Regular' },
  fontBold: { fontFamily: 'Inter_700Bold' },
} as const;
