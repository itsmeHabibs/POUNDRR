// File: app/(tabs)/poundrr/events/[eventId].tsx
// Rules: Firestore at module scope OK; no top-level firebase/auth usage here; default export; strict-friendly TS.

import { db } from '@/firebase';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  Timestamp,
  collection,
  doc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  where,
} from 'firebase/firestore';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Linking,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';

type EventDoc = {
  title?: string;
  posterUrl?: string;
  description?: string;
  startAt?: Timestamp;
  endAt?: Timestamp;
  venueName?: string;
  address?: string;
  city?: string;
  country?: string;
  ticketUrl?: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
};

type FightDoc = {
  id?: string;
  eventId?: string;
  redName?: string;
  blueName?: string;
  weightClass?: string;
  scheduledAt?: Timestamp | null;
  order?: number | null;
  highlightCount?: number | null;
};

type Params = { eventId?: string | string[] };

const RED = '#f70000';
const CARD_BG = 'rgba(0,0,0,0.70)';
const BORDER = 'rgba(255,255,255,0.14)';

function toSingle(v?: string | string[]): string | undefined {
  if (v == null) return undefined;
  return Array.isArray(v) ? v[0] : v;
}

function fmtDate(ts?: Timestamp): string | null {
  if (!ts) return null;
  try {
    const d = ts.toDate();
    return `${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  } catch {
    return null;
  }
}

export default function EventDetailScreen(): React.ReactElement {
  const router = useRouter();
  const params = useLocalSearchParams<Params>();
  const eventId = useMemo(() => toSingle(params.eventId), [params.eventId]);

  const [loading, setLoading] = useState<boolean>(true);
  const [notFound, setNotFound] = useState<boolean>(false);
  const [event, setEvent] = useState<EventDoc | null>(null);
  const [fights, setFights] = useState<FightDoc[]>([]);
  const [loadingFights, setLoadingFights] = useState<boolean>(false);

  // Live load event doc
  useEffect(() => {
    if (!eventId) {
      setLoading(false);
      setNotFound(true);
      return;
    }
    const ref = doc(db, 'events', eventId);
    const unsub = onSnapshot(
      ref,
      (snap) => {
        if (!snap.exists()) {
          setEvent(null);
          setNotFound(true);
        } else {
          setEvent((snap.data() as EventDoc) ?? {});
          setNotFound(false);
        }
        setLoading(false);
      },
      (err) => {
        console.warn('[event-detail] onSnapshot error:', err);
        setLoading(false);
      }
    );
    return () => unsub();
  }, [eventId]);

  // Load fights for event
  useEffect(() => {
    if (!eventId) return;
    setLoadingFights(true);
    (async () => {
      try {
        const q = query(
          collection(db, 'fights'),
          where('eventId', '==', eventId),
          orderBy('order', 'asc'),
          limit(200)
        );
        const snap = await getDocs(q);
        const rows: FightDoc[] = snap.docs.map((d) => ({ id: d.id, ...(d.data() as FightDoc) }));
        setFights(rows);
      } catch (e) {
        console.warn('[event-detail] fights load error:', e);
        // Fallback without orderBy (in case index missing)
        try {
          const q2 = query(collection(db, 'fights'), where('eventId', '==', eventId), limit(200));
          const snap2 = await getDocs(q2);
          const rows2: FightDoc[] = snap2.docs.map((d) => ({ id: d.id, ...(d.data() as FightDoc) }));
          setFights(rows2);
        } catch (e2) {
          console.warn('[event-detail] fights fallback error:', e2);
        }
      } finally {
        setLoadingFights(false);
      }
    })();
  }, [eventId]);

  const title = event?.title ?? 'Event';
  const startLabel = fmtDate(event?.startAt) ?? '';
  const endLabel = fmtDate(event?.endAt) ?? '';
  const venueLine = [event?.venueName, event?.address].filter(Boolean).join(' • ');
  const cityLine = [event?.city, event?.country].filter(Boolean).join(', ');

  const handleShare = useCallback(async () => {
    try {
      const msgParts = [
        title,
        startLabel ? `When: ${startLabel}${endLabel ? ` → ${endLabel}` : ''}` : '',
        venueLine ? `Where: ${venueLine}` : '',
        cityLine || '',
        event?.ticketUrl ? `Tickets: ${event.ticketUrl}` : '',
      ].filter(Boolean);
      await Share.share({ message: msgParts.join('\n') });
    } catch (e) {
      console.warn('[event-detail] share error:', e);
    }
  }, [title, startLabel, endLabel, venueLine, cityLine, event?.ticketUrl]);

  const handleTickets = useCallback(async () => {
    const url = event?.ticketUrl;
    if (!url) {
      Alert.alert('No tickets link', 'Tickets link is not available for this event.');
      return;
    }
    try {
      const supported = await Linking.canOpenURL(url);
      if (supported) {
        await Linking.openURL(url);
      } else {
        Alert.alert('Cannot open link', url);
      }
    } catch (e) {
      console.warn('[event-detail] open tickets error:', e);
      Alert.alert('Error', 'Could not open tickets link.');
    }
  }, [event?.ticketUrl]);

  const handleReport = useCallback(() => {
    if (!eventId) return;
    router.push({
      pathname: '/(modals)/report',
      params: { type: 'event', targetId: eventId, targetName: title, returnTo: `/poundrr/events/${eventId}` },
    });
  }, [router, eventId, title]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#fff" />
      </View>
    );
  }

  if (notFound || !eventId) {
    return (
      <View style={styles.center}>
        <Text style={styles.muted}>Event not found.</Text>
        <Pressable onPress={() => router.back()} style={({ pressed }) => [styles.btnGhost, pressed && { opacity: 0.85 }]}>
          <Text style={styles.btnGhostText}>Go Back</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={{ paddingBottom: 28 }}>
      {/* Poster */}
      {event?.posterUrl ? (
        <Image source={{ uri: event.posterUrl }} style={styles.poster} resizeMode="cover" />
      ) : (
        <View style={[styles.poster, { alignItems: 'center', justifyContent: 'center', backgroundColor: '#0f0f0f' }]}>
          <Text style={styles.posterFallback}>EVENT</Text>
        </View>
      )}

      {/* Header card */}
      <View style={styles.card}>
        <Text style={styles.title}>{title}</Text>

        {!!startLabel && (
          <Text style={styles.line}>
            <Text style={styles.label}>When: </Text>
            <Text style={styles.value}>
              {startLabel}
              {endLabel ? ` → ${endLabel}` : ''}
            </Text>
          </Text>
        )}

        {!!venueLine && (
          <Text style={styles.line}>
            <Text style={styles.label}>Where: </Text>
            <Text style={styles.value}>{venueLine}</Text>
          </Text>
        )}

        {!!cityLine && (
          <Text style={styles.line}>
            <Text style={styles.label}>Location: </Text>
            <Text style={styles.value}>{cityLine}</Text>
          </Text>
        )}

        {!!event?.description && (
          <>
            <View style={styles.hr} />
            <Text style={styles.desc}>{event.description}</Text>
          </>
        )}

        {/* Actions */}
        <View style={styles.actions}>
          <Pressable onPress={handleTickets} style={({ pressed }) => [styles.btnPrimary, pressed && { opacity: 0.9 }]}>
            <Text style={styles.btnPrimaryText}>{event?.ticketUrl ? 'Get Tickets' : 'Tickets (N/A)'}</Text>
          </Pressable>

          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Pressable onPress={handleShare} style={({ pressed }) => [styles.btn, pressed && { opacity: 0.9 }]}>
              <Text style={styles.btnText}>Share</Text>
            </Pressable>
            <Pressable onPress={handleReport} style={({ pressed }) => [styles.btn, pressed && { opacity: 0.9 }]}>
              <Text style={styles.btnText}>Report</Text>
            </Pressable>
          </View>
        </View>
      </View>

      {/* Fights list */}
      <View style={[styles.card, { marginTop: 12 }]}>
        <Text style={styles.sectionTitle}>Card</Text>
        {loadingFights ? (
          <View style={{ paddingVertical: 14 }}>
            <ActivityIndicator color="#fff" />
          </View>
        ) : fights.length === 0 ? (
          <Text style={styles.muted}>No fights announced yet.</Text>
        ) : (
          <FlatList
            data={fights}
            keyExtractor={(it) => it.id ?? `${it.redName}-${it.blueName}-${it.order ?? Math.random()}`}
            renderItem={({ item }) => <FightRow fight={item} />}
            scrollEnabled={false}
            removeClippedSubviews
            windowSize={5}
            maxToRenderPerBatch={10}
            initialNumToRender={10}
            contentContainerStyle={{ gap: 10 }}
          />
        )}
      </View>
    </ScrollView>
  );
}

function FightRow({ fight }: { fight: FightDoc }): React.ReactElement {
  const when = fight.scheduledAt ? fmtDate(fight.scheduledAt) : null;
  return (
    <View style={styles.fightRow}>
      <View style={{ flex: 1 }}>
        <Text style={styles.fightNames} numberOfLines={1}>
          {fight.redName ?? 'TBD'} <Text style={{ color: '#9ca3af' }}>vs</Text> {fight.blueName ?? 'TBD'}
        </Text>
        <Text style={styles.fightMeta} numberOfLines={1}>
          {(fight.weightClass ?? '—')}{when ? ` • ${when}` : ''}
        </Text>
      </View>
      {typeof fight.order === 'number' && (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>#{fight.order}</Text>
        </View>
      )}
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
  poster: {
    width: '100%',
    height: 260,
    backgroundColor: '#111',
  },
  posterFallback: {
    fontFamily: 'Inter_700Bold',
    color: '#fff',
    fontSize: 20,
    letterSpacing: 1,
  },
  card: {
    backgroundColor: CARD_BG,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginHorizontal: 14,
    marginTop: 12,
    borderTopWidth: 3,
    borderTopColor: RED,
  },
  title: {
    fontFamily: 'Inter_700Bold',
    color: '#fff',
    fontSize: 22,
    letterSpacing: 0.5,
  },
  line: {
    marginTop: 6,
  },
  label: {
    fontFamily: 'Inter_700Bold',
    color: '#cbd5e1',
    fontSize: 12,
  },
  value: {
    fontFamily: 'Inter_400Regular',
    color: '#fff',
    fontSize: 14,
  },
  hr: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.12)',
    marginVertical: 12,
  },
  desc: {
    fontFamily: 'Inter_400Regular',
    color: '#e5e7eb',
    fontSize: 14,
  },
  actions: {
    marginTop: 14,
    gap: 10,
  },
  btnPrimary: {
    backgroundColor: RED,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  btnPrimaryText: {
    fontFamily: 'Inter_700Bold',
    color: '#fff',
    fontSize: 16,
    letterSpacing: 0.6,
  },
  btn: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderColor: BORDER,
    borderWidth: 1,
    alignItems: 'center',
  },
  btnText: {
    fontFamily: 'Inter_700Bold',
    color: '#e5e7eb',
    fontSize: 14,
  },
  sectionTitle: {
    fontFamily: 'Inter_700Bold',
    color: '#fff',
    fontSize: 16,
    marginBottom: 8,
  },
  muted: {
    fontFamily: 'Inter_400Regular',
    color: '#cbd5e1',
    fontSize: 13,
  },
  fightRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderRadius: 10,
    borderColor: BORDER,
    borderWidth: 1,
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  fightNames: {
    fontFamily: 'Inter_700Bold',
    color: '#fff',
    fontSize: 15,
  },
  fightMeta: {
    marginTop: 4,
    fontFamily: 'Inter_400Regular',
    color: '#cbd5e1',
    fontSize: 12,
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(247,0,0,0.16)',
    borderWidth: 1,
    borderColor: RED,
  },
  badgeText: {
    fontFamily: 'Inter_700Bold',
    color: '#fff',
    fontSize: 12,
  },
  // Added missing styles for back button in "not found" state
  btnGhost: {
    marginTop: 10,
    paddingVertical: 12,
    paddingHorizontal: 16,
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
});
