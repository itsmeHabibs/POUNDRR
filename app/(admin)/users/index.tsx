// File: app/(admin)/users.tsx
// Firestore is allowed at module scope. Auth is NOT used/imported here.

import { db } from '@/firebase';
import { useRouter } from 'expo-router';
import {
  Timestamp,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
} from 'firebase/firestore';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  RefreshControl,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

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
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
  lastActiveAt?: Timestamp | string | number;
};

export interface AdminUser {
  id: string;
  displayName: string;
  username?: string;
  email?: string;
  role: UserRole;
  city?: string;
  country?: string;
  weightClass?: string;
  avatarUrl?: string;
  isBanned: boolean;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
  lastActiveAt?: Timestamp | string | number;
}

// --- Firestore refs (allowed at module scope)
const USERS_COL = collection(db, 'users');
const USERS_QUERY = query(USERS_COL, orderBy('createdAt', 'desc'));

function formatDate(value?: Timestamp | string | number): string {
  if (!value) return '—';
  try {
    if (value instanceof Timestamp) {
      const d = value.toDate();
      return `${d.toDateString()} ${d.toLocaleTimeString()}`;
    }
    if (typeof value === 'number') {
      const d = new Date(value);
      return `${d.toDateString()} ${d.toLocaleTimeString()}`;
    }
    const d = new Date(value);
    if (!isNaN(d.getTime())) {
      return `${d.toDateString()} ${d.toLocaleTimeString()}`;
    }
  } catch {
    // ignore
  }
  return String(value);
}

function rolePill(role: UserRole): { bg: string; fg: string; label: string } {
  switch (role) {
    case 'admin':
      return { bg: 'rgba(59,130,246,0.15)', fg: '#1e3a8a', label: 'Admin' }; // blue
    case 'moderator':
      return { bg: 'rgba(234,179,8,0.16)', fg: '#713f12', label: 'Mod' }; // amber
    case 'fighter':
      return { bg: 'rgba(16,185,129,0.15)', fg: '#065f46', label: 'Fighter' }; // green
    case 'fan':
    default:
      return { bg: 'rgba(107,114,128,0.18)', fg: '#111827', label: 'Fan' }; // gray
  }
}

export default function AdminUsersScreen(): React.ReactElement {
  const router = useRouter();
  const [rows, setRows] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [search, setSearch] = useState<string>("");

  useEffect(() => {
    const unsub = onSnapshot(
      USERS_QUERY,
      (snap) => {
        const next: AdminUser[] = snap.docs.map((d) => {
          const data = (d.data() as UserDoc) ?? {};
          return {
            id: d.id,
            displayName: data.displayName ?? 'Unnamed',
            username: data.username,
            email: data.email,
            role: (data.role as UserRole) ?? 'fan',
            city: data.city,
            country: data.country,
            weightClass: data.weightClass,
            avatarUrl: data.avatarUrl,
            isBanned: Boolean(data.isBanned),
            createdAt: data.createdAt,
            updatedAt: data.updatedAt,
            lastActiveAt: data.lastActiveAt,
          };
        });
        setRows(next);
        setLoading(false);
        setRefreshing(false);
      },
      (err) => {
        console.warn('[admin/users] onSnapshot error:', err);
        setLoading(false);
        setRefreshing(false);
        Alert.alert('Error', 'Failed to load users.');
      }
    );

    return () => unsub();
  }, []);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    // Live query already updates; this just shows the spinner briefly
    setTimeout(() => setRefreshing(false), 400);
  }, []);

  const handleDelete = useCallback((id: string) => {
    Alert.alert('Delete User', 'This will remove the user document. Continue?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteDoc(doc(db, 'users', id));
          } catch (e) {
            console.warn('[admin/users] delete error:', e);
            Alert.alert('Error', 'Failed to delete user.');
          }
        },
      },
    ]);
  }, []);

  const goToNew = useCallback(() => {
    router.push('/(admin)/users/new');
  }, [router]);

  const goToDetail = useCallback(
    (id: string) => {
      router.push({ pathname: '/(admin)/users/[id]', params: { id } });
    },
    [router]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((u) => {
      const hay = [
        u.displayName,
        u.username,
        u.email,
        u.city,
        u.country,
        u.weightClass,
        u.role,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }, [rows, search]);

  const empty = useMemo(
    () => (
      <View style={{ padding: 24, alignItems: 'center' }}>
        <Text style={{ color: '#666' }}>No users found.</Text>
      </View>
    ),
    []
  );

  const renderItem = useCallback(
    ({ item }: { item: AdminUser }) => {
      const pill = rolePill(item.role);
      return (
        <TouchableOpacity
          onPress={() => goToDetail(item.id)}
          style={{
            padding: 16,
            borderBottomColor: 'rgba(0,0,0,0.08)',
            borderBottomWidth: 1,
            backgroundColor: '#fff',
          }}
          activeOpacity={0.85}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            {/* Avatar placeholder */}
            <View
              style={{
                width: 40,
                height: 40,
                borderRadius: 999,
                backgroundColor: '#e5e7eb',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text style={{ fontWeight: '700' }}>
                {item.displayName?.[0]?.toUpperCase() ?? 'U'}
              </Text>
            </View>

            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 16, fontWeight: '700' }} numberOfLines={1}>
                {item.displayName}
              </Text>
              <Text style={{ marginTop: 2, color: '#444' }} numberOfLines={1}>
                {item.username ? `@${item.username}` : item.email ?? '—'}
              </Text>
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
                {!!item.city && <Text style={{ color: '#666' }}>{item.city}</Text>}
                {!!item.country && <Text style={{ color: '#666' }}>· {item.country}</Text>}
                {!!item.weightClass && <Text style={{ color: '#666' }}>· {item.weightClass}</Text>}
                {!!item.lastActiveAt && (
                  <Text style={{ color: '#666' }}>· Active {formatDate(item.lastActiveAt)}</Text>
                )}
              </View>
            </View>

            <View style={{ alignItems: 'flex-end', gap: 8 }}>
              <View
                style={{
                  paddingHorizontal: 8,
                  paddingVertical: 4,
                  borderRadius: 999,
                  backgroundColor: item.isBanned ? 'rgba(239,68,68,0.15)' : pill.bg,
                }}
              >
                <Text
                  style={{
                    fontSize: 12,
                    color: item.isBanned ? '#7f1d1d' : pill.fg,
                  }}
                >
                  {item.isBanned ? 'Banned' : pill.label}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => handleDelete(item.id)}
                style={{
                  paddingHorizontal: 10,
                  paddingVertical: 6,
                  borderRadius: 8,
                  backgroundColor: 'rgba(239,68,68,0.1)',
                }}
              >
                <Text style={{ color: '#991b1b', fontWeight: '600' }}>Delete</Text>
              </TouchableOpacity>
            </View>
          </View>
        </TouchableOpacity>
      );
    },
    [goToDetail, handleDelete]
  );

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#f5f5f5' }}>
      {/* Search bar */}
      <View
        style={{
          paddingHorizontal: 16,
          paddingTop: 12,
          paddingBottom: 8,
          backgroundColor: '#fff',
          borderBottomColor: 'rgba(0,0,0,0.06)',
          borderBottomWidth: 1,
        }}
      >
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Search users (name, @username, email, city, role...)"
          placeholderTextColor="#9ca3af"
          style={{
            backgroundColor: '#f3f4f6',
            borderRadius: 10,
            paddingHorizontal: 12,
            paddingVertical: 10,
          }}
          autoCapitalize="none"
          autoCorrect={false}
          clearButtonMode="while-editing"
        />
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        ListEmptyComponent={empty}
        contentContainerStyle={{ paddingBottom: 96 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        removeClippedSubviews
        windowSize={7}
        initialNumToRender={12}
        maxToRenderPerBatch={12}
        updateCellsBatchingPeriod={50}
      />

      {/* Floating "New User" button (optional) */}
      <TouchableOpacity
        onPress={goToNew}
        activeOpacity={0.9}
        style={{
          position: 'absolute',
          right: 16,
          bottom: 24,
          borderRadius: 999,
          paddingHorizontal: 18,
          paddingVertical: 14,
          backgroundColor: '#f70000',
          shadowColor: '#000',
          shadowOpacity: 0.15,
          shadowOffset: { width: 0, height: 6 },
          shadowRadius: 12,
          elevation: 6,
        }}
      >
        <Text style={{ color: '#fff', fontWeight: '700' }}>New User</Text>
      </TouchableOpacity>
    </View>
  );
}
