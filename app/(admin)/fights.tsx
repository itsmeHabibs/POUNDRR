// File: app/(admin)/fights.tsx
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
  TouchableOpacity,
  View,
} from 'react-native';

type FightStatus = 'pending' | 'scheduled' | 'completed' | 'cancelled';

type FightDoc = {
  fighterAId?: string;
  fighterBId?: string;
  fighterAName?: string;
  fighterBName?: string;
  weightClass?: string;
  city?: string;
  venue?: string;
  scheduledAt?: Timestamp | string | number;
  status?: FightStatus;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
};

export interface AdminFight {
  id: string;
  fighterAId?: string;
  fighterBId?: string;
  fighterAName?: string;
  fighterBName?: string;
  weightClass?: string;
  city?: string;
  venue?: string;
  scheduledAt?: Timestamp | string | number;
  status: FightStatus;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

// --- Firestore refs (allowed at module scope by your rules)
const FIGHTS_COL = collection(db, 'fights');
const FIGHTS_QUERY = query(FIGHTS_COL, orderBy('scheduledAt', 'asc'));

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

function statusPillColors(status: FightStatus): { bg: string; fg: string; label: string } {
  switch (status) {
    case 'scheduled':
      return { bg: 'rgba(59,130,246,0.15)', fg: '#1e3a8a', label: 'Scheduled' };
    case 'completed':
      return { bg: 'rgba(16,185,129,0.15)', fg: '#065f46', label: 'Completed' };
    case 'cancelled':
      return { bg: 'rgba(239,68,68,0.15)', fg: '#7f1d1d', label: 'Cancelled' };
    case 'pending':
    default:
      return { bg: 'rgba(234,179,8,0.16)', fg: '#713f12', label: 'Pending' };
  }
}

export default function AdminFightsScreen(): React.ReactElement {
  const router = useRouter();
  const [rows, setRows] = useState<AdminFight[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);

  useEffect(() => {
    const unsub = onSnapshot(
      FIGHTS_QUERY,
      (snap) => {
        const next: AdminFight[] = snap.docs.map((d) => {
          const data = (d.data() as FightDoc) ?? {};
          return {
            id: d.id,
            fighterAId: data.fighterAId,
            fighterBId: data.fighterBId,
            fighterAName: data.fighterAName,
            fighterBName: data.fighterBName,
            weightClass: data.weightClass,
            city: data.city,
            venue: data.venue,
            scheduledAt: data.scheduledAt,
            status: (data.status as FightStatus) ?? 'pending',
            createdAt: data.createdAt,
            updatedAt: data.updatedAt,
          };
        });
        setRows(next);
        setLoading(false);
        setRefreshing(false);
      },
      (err) => {
        console.warn('[admin/fights] onSnapshot error:', err);
        setLoading(false);
        setRefreshing(false);
        Alert.alert('Error', 'Failed to load fights.');
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
    Alert.alert('Delete Fight', 'Are you sure you want to delete this fight?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteDoc(doc(db, 'fights', id));
          } catch (e) {
            console.warn('[admin/fights] delete error:', e);
            Alert.alert('Error', 'Failed to delete fight.');
          }
        },
      },
    ]);
  }, []);

  const goToNew = useCallback(() => {
    router.push('/(admin)/fights/new');
  }, [router]);

  const goToDetail = useCallback(
    (id: string) => {
      router.push({ pathname: '/(admin)/fights/[id]', params: { id } });
    },
    [router]
  );

  const empty = useMemo(
    () => (
      <View style={{ padding: 24, alignItems: 'center' }}>
        <Text style={{ color: '#666' }}>No fights yet.</Text>
      </View>
    ),
    []
  );

  const renderItem = useCallback(
    ({ item }: { item: AdminFight }) => {
      const title =
        (item.fighterAName || 'Fighter A') + ' vs ' + (item.fighterBName || 'Fighter B');
      const statusC = statusPillColors(item.status);

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
                {title}
              </Text>
              <Text style={{ marginTop: 4, color: '#444' }}>{formatDate(item.scheduledAt)}</Text>
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
                {!!item.weightClass && (
                  <Text style={{ color: '#666' }} numberOfLines={1}>
                    {item.weightClass}
                  </Text>
                )}
                {!!item.venue && (
                  <Text style={{ color: '#666' }} numberOfLines={1}>
                    · {item.venue}
                  </Text>
                )}
                {!!item.city && (
                  <Text style={{ color: '#666' }} numberOfLines={1}>
                    · {item.city}
                  </Text>
                )}
              </View>
            </View>

            <View style={{ alignItems: 'flex-end', gap: 8 }}>
              <View
                style={{
                  paddingHorizontal: 8,
                  paddingVertical: 4,
                  borderRadius: 999,
                  backgroundColor: statusC.bg,
                }}
              >
                <Text style={{ fontSize: 12, color: statusC.fg }}>{statusC.label}</Text>
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

      {/* Floating "New Fight" button */}
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
          backgroundColor: '#f70000', // brand red
          shadowColor: '#000',
          shadowOpacity: 0.15,
          shadowOffset: { width: 0, height: 6 },
          shadowRadius: 12,
          elevation: 6,
        }}
      >
        <Text style={{ color: '#fff', fontWeight: '700' }}>New Fight</Text>
      </TouchableOpacity>
    </View>
  );
}
