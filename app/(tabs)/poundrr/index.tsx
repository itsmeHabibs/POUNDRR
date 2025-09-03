// File: app/(tabs)/poundrr/index.tsx
// Rules:
// - Firestore at module scope OK.
// - Never import from 'firebase/auth' at top level.
// - Default export a React component; strict-friendly TS.
// - List perf flags included.

import { db } from '@/firebase';
import { useRouter } from 'expo-router';
import {
  Timestamp,
  collection,
  getDocs,
  limit,
  orderBy,
  query,
  where,
} from 'firebase/firestore';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

type EventDoc = {
  title?: string;
  posterUrl?: string | null;
  startAt?: Timestamp | null;
  endAt?: Timestamp | null;
  venueName?: string | null;
  city?: string | null;
  country?: string | null;
};

type FightStatus = 'queued' | 'in_progress' | 'completed' | 'cancelled' | 'upcoming';
type FightDoc = {
  redName?: string | null;
  blueName?: string | null;
  weightClass?: string | null;
  scheduledAt?: Timestamp | null;
  status?: FightStatus | null;
  order?: number | null;
};

type EventRow = EventDoc & { id: string };
type FightRow = FightDoc & { id: string };

const RED = '#f70000';
const CARD_BG = 'rgba(0,0,0,0.70)';
const BORDER = 'rgba(255,255,255,0.14)';

function fmtDate(ts?: Timestamp | null): string | null {
  if (!ts) return null;
  try {
    const d = ts.toDate();
    return `${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  } catch {
    return null;
  }
}

export default function PoundrrHomeScreen(): React.ReactElement {
  const router = useRouter();

  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [queued, setQueued] = useState<FightRow[]>([]);
  const [upcomingFights, setUpcomingFights] = useState<FightRow[]>([]);

  const nowTs = useMemo(() => Timestamp.fromDate(new Date()), []);

  const load = useCallback(async (): Promise<void> => {
    setLoading(true);
    try {
      // Upcoming events (soonest first)
      let evSnap;
      try {
        evSnap = await getDocs(
          query(
            collection(db, 'events'),
            where('startAt', '>=', nowTs),
            orderBy('startAt', 'asc'),
            limit(12)
          )
        );
      } catch {
        // fallback without orderBy (index may be missing)
        evSnap = await getDocs(
          query(collection(db, 'events'), where('startAt', '>=', nowTs), limit(12))
        );
      }
      const evRows: EventRow[] = evSnap.docs.map((d) => ({ id: d.id, ...(d.data() as EventDoc) }));

      // Queued fights (lowest order first)
      let qSnap;
      try {
        qSnap = await getDocs(
          query(
            collection(db, 'fights'),
            where('status', '==', 'queued'),
            orderBy('order', 'asc'),
            limit(16)
          )
        );
      } catch {
        qSnap = await getDocs(
          query(collection(db, 'fights'), where('status', '==', 'queued'), limit(16))
        );
      }
      const qRows: FightRow[] = qSnap.docs.map((d) => ({ id: d.id, ...(d.data() as FightDoc) }));

      // Upcoming fights by time
      let ufSnap;
      try {
        ufSnap = await getDocs(
          query(
            collection(db, 'fights'),
            where('scheduledAt', '>=', nowTs),
            orderBy('scheduledAt', 'asc'),
            limit(16)
          )
        );
      } catch {
        ufSnap = await getDocs(
          query(collection(db, 'fights'), where('scheduledAt', '>=', nowTs), limit(16))
        );
      }
      const ufRows: FightRow[] = ufSnap.docs.map((d) => ({ id: d.id, ...(d.data() as FightDoc) }));

      setEvents(evRows);
      setQueued(qRows);
      setUpcomingFights(ufRows);
    } catch (e) {
      console.warn('[poundrr-home] load error:', e);
      setEvents([]);
      setQueued([]);
      setUpcomingFights([]);
    } finally {
      setLoading(false);
    }
  }, [nowTs]);

  useEffect(() => {
    void load();
  }, [load]);

  const onRefresh = useCallback(async (): Promise<void> => {
    setRefreshing(true);
    try {
      await load();
    } finally {
      setRefreshing(false);
    }
  }, [load]);

  const goto = useCallback((path: string) => router.push(path), [router]);

  if (loading && !refreshing && events.length === 0 && queued.length === 0 && upcomingFights.length === 0) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#fff" />
      </View>
    );
  }

  return (
    <ScrollView
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#fff" />}
      contentContainerStyle={{ paddingBottom: 24, paddingTop: 8, gap: 14 }}
    >
      {/* Quick actions */}
      <View style={styles.quickRow}>
        <QuickBtn label="Events" onPress={() => goto('/poundrr/events')} />
        <QuickBtn label="Fights" onPress={() => goto('/poundrr/fights')} />
        <QuickBtn label="Queue" onPress={() => goto('/poundrr/fights/queue')} />
        <QuickBtn label="My Tickets" onPress={() => goto('/poundrr/events/my-tickets')} />
      </View>

      {/* Upcoming Events */}
      <SectionHeader
        title="Upcoming Events"
        onSeeAll={() => goto('/poundrr/events')}
        showSeeAll
      />
      {events.length === 0 ? (
        <EmptyRow text="No upcoming events." />
      ) : (
        <FlatList
          data={events}
          keyExtractor={(it) => it.id}
          renderItem={({ item }) => (
            <EventMiniCard
              row={item}
              onPress={() => goto(`/poundrr/events/${item.id}`)}
            />
          )}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 14, gap: 10 }}
          removeClippedSubviews
          windowSize={5}
          maxToRenderPerBatch={10}
          initialNumToRender={8}
        />
      )}

      {/* Queued Fights */}
      <SectionHeader
        title="Queued Fights"
        onSeeAll={() => goto('/poundrr/fights/queue')}
        showSeeAll
      />
      {queued.length === 0 ? (
        <EmptyRow text="No fights in queue." />
      ) : (
        <FlatList
          data={queued}
          keyExtractor={(it) => it.id}
          renderItem={({ item }) => (
            <FightMiniCard
              row={item}
              subtitle="Queued"
              onPress={() => goto(`/poundrr/fights/${item.id}`)}
            />
          )}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 14, gap: 10 }}
          removeClippedSubviews
          windowSize={5}
          maxToRenderPerBatch={10}
          initialNumToRender={8}
        />
      )}

      {/* Upcoming Fights */}
      <SectionHeader
        title="Upcoming Fights"
        onSeeAll={() => goto('/poundrr/fights')}
        showSeeAll
      />
      {upcomingFights.length === 0 ? (
        <EmptyRow text="No upcoming fights." />
      ) : (
        <FlatList
          data={upcomingFights}
          keyExtractor={(it) => it.id}
          renderItem={({ item }) => {
            const when = fmtDate(item.scheduledAt) ?? 'TBA';
            return (
              <FightMiniCard
                row={item}
                subtitle={when}
                onPress={() => goto(`/poundrr/fights/${item.id}`)}
              />
            );
          }}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 14, gap: 10 }}
          removeClippedSubviews
          windowSize={5}
          maxToRenderPerBatch={10}
          initialNumToRender={8}
        />
      )}
    </ScrollView>
  );
}

/* ---------- small components ---------- */
function SectionHeader({
  title,
  onSeeAll,
  showSeeAll,
}: {
  title: string;
  onSeeAll?: () => void;
  showSeeAll?: boolean;
}): React.ReactElement {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {showSeeAll && onSeeAll && (
        <Pressable onPress={onSeeAll} style={({ pressed }) => [styles.btn, pressed && { opacity: 0.9 }]}>
          <Text style={styles.btnText}>See All</Text>
        </Pressable>
      )}
    </View>
  );
}

function QuickBtn({ label, onPress }: { label: string; onPress: () => void }): React.ReactElement {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.quickBtn, pressed && { opacity: 0.95 }]}>
      <Text style={styles.quickBtnText}>{label}</Text>
    </Pressable>
  );
}

function EventMiniCard({
  row,
  onPress,
}: {
  row: EventRow;
  onPress: () => void;
}): React.ReactElement {
  const when = fmtDate(row.startAt) ?? 'TBA';
  const loc = [row.city, row.country].filter(Boolean).join(', ');
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.cardMini, pressed && { opacity: 0.96 }]}>
      {row.posterUrl ? (
        <Image source={{ uri: row.posterUrl }} style={styles.posterMini} resizeMode="cover" />
      ) : (
        <View style={[styles.posterMini, { alignItems: 'center', justifyContent: 'center', backgroundColor: '#0f0f0f' }]}>
          <Text style={styles.posterFallback}>EVENT</Text>
        </View>
      )}
      <View style={{ padding: 10, gap: 4 }}>
        <Text style={styles.titleMini} numberOfLines={2}>
          {row.title ?? 'Event'}
        </Text>
        <Text style={styles.metaMini} numberOfLines={1}>{when}</Text>
        {!!loc && <Text style={styles.metaMini} numberOfLines={1}>{loc}</Text>}
      </View>
    </Pressable>
  );
}

function FightMiniCard({
  row,
  subtitle,
  onPress,
}: {
  row: FightRow;
  subtitle?: string;
  onPress: () => void;
}): React.ReactElement {
  const names =
    row.redName && row.blueName
      ? `${row.redName} vs ${row.blueName}`
      : row.redName || row.blueName || 'Fight';
  const line = [row.weightClass ?? undefined, subtitle].filter(Boolean).join(' • ');
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.cardMini, pressed && { opacity: 0.96 }]}>
      <View style={[styles.posterMini, { alignItems: 'center', justifyContent: 'center', backgroundColor: '#0f0f0f' }]}>
        <Text style={styles.posterFallback}>FIGHT</Text>
      </View>
      <View style={{ padding: 10, gap: 4 }}>
        <Text style={styles.titleMini} numberOfLines={2}>{names}</Text>
        {!!line && <Text style={styles.metaMini} numberOfLines={1}>{line}</Text>}
        {typeof row.order === 'number' && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>#{row.order}</Text>
          </View>
        )}
      </View>
    </Pressable>
  );
}

function EmptyRow({ text }: { text: string }): React.ReactElement {
  return (
    <View style={styles.emptyRow}>
      <Text style={styles.muted}>{text}</Text>
    </View>
  );
}

/* ---------- styles ---------- */
const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  quickRow: {
    paddingHorizontal: 14,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  quickBtn: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  quickBtnText: {
    fontFamily: 'Inter_700Bold',
    color: '#e5e7eb',
    fontSize: 14,
  },

  sectionHeader: {
    marginTop: 4,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionTitle: {
    fontFamily: 'Inter_700Bold',
    color: '#fff',
    fontSize: 16,
  },
  btn: {
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 10,
    borderColor: BORDER,
    borderWidth: 1,
  },
  btnText: {
    fontFamily: 'Inter_700Bold',
    color: '#e5e7eb',
    fontSize: 12,
  },

  cardMini: {
    width: 220,
    backgroundColor: CARD_BG,
    borderRadius: 12,
    borderTopWidth: 3,
    borderTopColor: RED,
    overflow: 'hidden',
  },
  posterMini: {
    width: '100%',
    height: 120,
    backgroundColor: '#111',
  },
  posterFallback: {
    fontFamily: 'Inter_700Bold',
    color: '#fff',
    fontSize: 14,
    letterSpacing: 1,
  },
  titleMini: {
    fontFamily: 'Inter_700Bold',
    color: '#fff',
    fontSize: 14,
  },
  metaMini: {
    fontFamily: 'Inter_400Regular',
    color: '#e5e7eb',
    fontSize: 12,
  },
  badge: {
    alignSelf: 'flex-start',
    marginTop: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(247,0,0,0.16)',
    borderWidth: 1,
    borderColor: RED,
  },
  badgeText: {
    fontFamily: 'Inter_700Bold',
    color: '#fff',
    fontSize: 10,
  },

  emptyRow: {
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  muted: {
    fontFamily: 'Inter_400Regular',
    color: '#cbd5e1',
    fontSize: 13,
  },
});
