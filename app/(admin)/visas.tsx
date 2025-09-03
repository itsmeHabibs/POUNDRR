// File: app/(admin)/visas.tsx
// Firestore is allowed at module scope. No Auth imports (Auth is lazy elsewhere).

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
  TouchableOpacity,
  View,
} from 'react-native';

type VisaStatus = 'pending' | 'approved' | 'rejected' | 'expired' | 'under_review';

type VisaDoc = {
  userId?: string;
  fullName?: string;          // convenience denormalization for fast list display
  username?: string;          // optional
  country?: string;
  visaType?: string;          // e.g., "Student (Subclass 500)"
  status?: VisaStatus;
  submittedAt?: Timestamp | string | number;
  expiresAt?: Timestamp | string | number;
  documentUrl?: string;
  notes?: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
};

export interface AdminVisa {
  id: string;
  userId?: string;
  fullName: string;
  username?: string;
  country?: string;
  visaType?: string;
  status: VisaStatus;
  submittedAt?: Timestamp | string | number;
  expiresAt?: Timestamp | string | number;
  documentUrl?: string;
  notes?: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

// --- Firestore refs (allowed at module scope)
const VISAS_COL = collection(db, 'visas');
const VISAS_QUERY = query(VISAS_COL, orderBy('submittedAt', 'desc'));

function fmtDate(value?: Timestamp | string | number): string {
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

function statusPill(status: VisaStatus): { bg: string; fg: string; label: string } {
  switch (status) {
    case 'approved':
      return { bg: 'rgba(16,185,129,0.15)', fg: '#065f46', label: 'Approved' }; // green
    case 'rejected':
      return { bg: 'rgba(239,68,68,0.15)', fg: '#7f1d1d', label: 'Rejected' }; // red
    case 'expired':
      return { bg: 'rgba(107,114,128,0.18)', fg: '#111827', label: 'Expired' }; // gray
    case 'under_review':
      return { bg: 'rgba(59,130,246,0.15)', fg: '#1e3a8a', label: 'Under review' }; // blue
    case 'pending':
    default:
      return { bg: 'rgba(234,179,8,0.16)', fg: '#713f12', label: 'Pending' }; // amber
  }
}

export default function AdminVisasScreen(): React.ReactElement {
  const router = useRouter();
  const [rows, setRows] = useState<AdminVisa[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);

  useEffect(() => {
    const unsub = onSnapshot(
      VISAS_QUERY,
      (snap) => {
        const next: AdminVisa[] = snap.docs.map((d) => {
          const data = (d.data() as VisaDoc) ?? {};
          return {
            id: d.id,
            userId: data.userId,
            fullName: data.fullName ?? 'Unnamed',
            username: data.username,
            country: data.country,
            visaType: data.visaType,
            status: (data.status as VisaStatus) ?? 'pending',
            submittedAt: data.submittedAt,
            expiresAt: data.expiresAt,
            documentUrl: data.documentUrl,
            notes: data.notes,
            createdAt: data.createdAt,
            updatedAt: data.updatedAt,
          };
        });
        setRows(next);
        setLoading(false);
        setRefreshing(false);
      },
      (err) => {
        console.warn('[admin/visas] onSnapshot error:', err);
        setLoading(false);
        setRefreshing(false);
        Alert.alert('Error', 'Failed to load visas.');
      }
    );

    return () => unsub();
  }, []);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 400);
  }, []);

  const goToNew = useCallback(() => {
    router.push('/(admin)/visas/new'); // adjust if you don’t plan to create this route
  }, [router]);

  const goToDetail = useCallback(
    (id: string) => {
      router.push({ pathname: '/(admin)/visas/[id]', params: { id } }); // adjust if you don’t plan to create this route
    },
    [router]
  );

  const handleDelete = useCallback((id: string) => {
    Alert.alert('Delete Visa', 'Are you sure you want to delete this visa record?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteDoc(doc(db, 'visas', id));
          } catch (e) {
            console.warn('[admin/visas] delete error:', e);
            Alert.alert('Error', 'Failed to delete visa.');
          }
        },
      },
    ]);
  }, []);

  const empty = useMemo(
    () => (
      <View style={{ padding: 24, alignItems: 'center' }}>
        <Text style={{ color: '#666' }}>No visa records yet.</Text>
      </View>
    ),
    []
  );

  const renderItem = useCallback(
    ({ item }: { item: AdminVisa }) => {
      const pill = statusPill(item.status);
      const subtitleParts = [
        item.visaType,
        item.country,
        item.username ? `@${item.username}` : undefined,
      ].filter(Boolean);

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
          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'flex-start',
              gap: 12,
            }}
          >
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 16, fontWeight: '700' }} numberOfLines={1}>
                {item.fullName}
              </Text>
              {subtitleParts.length > 0 && (
                <Text style={{ marginTop: 4, color: '#444' }} numberOfLines={1}>
                  {subtitleParts.join(' · ')}
                </Text>
              )}
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
                <Text style={{ color: '#666' }}>Submitted: {fmtDate(item.submittedAt)}</Text>
                {!!item.expiresAt && (
                  <Text style={{ color: '#666' }}>· Expires: {fmtDate(item.expiresAt)}</Text>
                )}
              </View>
            </View>

            <View style={{ alignItems: 'flex-end', gap: 8 }}>
              <View
                style={{
                  paddingHorizontal: 8,
                  paddingVertical: 4,
                  borderRadius: 999,
                  backgroundColor: pill.bg,
                }}
              >
                <Text style={{ fontSize: 12, color: pill.fg }}>{pill.label}</Text>
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
      <FlatList
        data={rows}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        ListEmptyComponent={empty}
        contentContainerStyle={{ paddingBottom: 96 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        removeClippedSubviews
        windowSize={7}
        initialNumToRender={10}
        maxToRenderPerBatch={10}
        updateCellsBatchingPeriod={50}
      />

      {/* Floating "New Visa" button */}
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
        <Text style={{ color: '#fff', fontWeight: '700' }}>New Visa</Text>
      </TouchableOpacity>
    </View>
  );
}
