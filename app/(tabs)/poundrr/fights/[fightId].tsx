// File: app/(tabs)/poundrr/fights/[fightId].tsx
// Rules: Firestore at module scope OK; never import firebase/auth at top-level.
// Use useAuthUid() for auth-gated actions. Default export component; strict-friendly TS.

import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Pressable,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { db } from '@/firebase';
import { useAuthUid } from '@/hooks/useAuthUid';
import {
  Timestamp,
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  where,
} from 'firebase/firestore';

type Params = { fightId?: string | string[] };

type FightDoc = {
  eventId?: string;
  redName?: string;
  blueName?: string;
  redAvatarUrl?: string | null;
  blueAvatarUrl?: string | null;
  weightClass?: string | null;
  scheduledAt?: Timestamp | null;
  order?: number | null;
  result?: string | null;
  venueName?: string | null; // optional if stored on fight
};

type EventDoc = {
  title?: string;
  posterUrl?: string | null;
  venueName?: string | null;
  address?: string | null;
  city?: string | null;
  country?: string | null;
  startAt?: Timestamp | null;
};

type HighlightRow = {
  id: string;
  ownerUid?: string;
  title?: string | null;
  description?: string | null;
  videoUrl?: string;
  durationMs?: number | null;
  createdAt?: Timestamp | null;
};

const RED = '#f70000';
const CARD_BG = 'rgba(0,0,0,0.70)';
const BORDER = 'rgba(255,255,255,0.14)';

function toSingle(v?: string | string[]): string | undefined {
  if (v == null) return undefined;
  return Array.isArray(v) ? v[0] : v;
}

function fmtDate(ts?: Timestamp | null): string | null {
  if (!ts) return null;
  try {
    const d = ts.toDate();
    return `${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  } catch {
    return null;
  }
}

export default function FightDetailScreen(): React.ReactElement {
  const router = useRouter();
  const { uid } = useAuthUid();

  const params = useLocalSearchParams<Params>();
  const fightId = useMemo(() => toSingle(params.fightId), [params.fightId]);

  const [loading, setLoading] = useState<boolean>(true);
  const [notFound, setNotFound] = useState<boolean>(false);
  const [fight, setFight] = useState<FightDoc | null>(null);
  const [event, setEvent] = useState<EventDoc | null>(null);
  const [highlights, setHighlights] = useState<HighlightRow[]>([]);
  const [loadingHighlights, setLoadingHighlights] = useState<boolean>(false);

  // Live-load the fight
  useEffect(() => {
    if (!fightId) {
      setLoading(false);
      setNotFound(true);
      return;
    }
    const ref = doc(db, 'fights', fightId);
    const unsub = onSnapshot(
      ref,
      (snap) => {
        if (!snap.exists()) {
          setFight(null);
          setNotFound(true);
        } else {
          setFight((snap.data() as FightDoc) ?? {});
          setNotFound(false);
        }
        setLoading(false);
      },
      (err) => {
        console.warn('[fight-detail] onSnapshot error:', err);
        setLoading(false);
      }
    );
    return () => unsub();
  }, [fightId]);

  // Load event (once) if eventId present
  useEffect(() => {
    (async () => {
      const eventId = fight?.eventId;
      if (!eventId) {
        setEvent(null);
        return;
      }
      try {
        const snap = await getDoc(doc(db, 'events', eventId));
        if (snap.exists()) {
          setEvent((snap.data() as EventDoc) ?? null);
        } else {
          setEvent(null);
        }
      } catch (e) {
        console.warn('[fight-detail] load event error:', e);
      }
    })();
  }, [fight?.eventId]);

  // Load highlights for this fight
  useEffect(() => {
    if (!fightId) return;
    setLoadingHighlights(true);
    (async () => {
      try {
        const q = query(
          collection(db, 'highlights'),
          where('fightId', '==', fightId),
          orderBy('createdAt', 'desc'),
          limit(100)
        );
        const snap = await getDocs(q);
        const rows: HighlightRow[] = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<HighlightRow, 'id'>),
        }));
        setHighlights(rows);
      } catch (e) {
        console.warn('[fight-detail] highlights load error:', e);
        // Fallback without orderBy (index may be missing)
        try {
          const q2 = query(collection(db, 'highlights'), where('fightId', '==', fightId), limit(100));
          const snap2 = await getDocs(q2);
          const rows2: HighlightRow[] = snap2.docs.map((d) => ({
            id: d.id,
            ...(d.data() as Omit<HighlightRow, 'id'>),
          }));
          setHighlights(rows2);
        } catch (e2) {
          console.warn('[fight-detail] highlights fallback error:', e2);
        }
      } finally {
        setLoadingHighlights(false);
      }
    })();
  }, [fightId]);

  const title =
    (fight?.redName && fight?.blueName)
      ? `${fight.redName} vs ${fight.blueName}`
      : 'Fight';

  const timeLabel = fmtDate(fight?.scheduledAt) ?? null;
  const eventTitle = event?.title ?? null;
  const venueLine = fight?.venueName ?? event?.venueName ?? null;

  const handleShare = useCallback(async () => {
    try {
      const parts = [
        title,
        timeLabel ? `When: ${timeLabel}` : '',
        eventTitle ? `Event: ${eventTitle}` : '',
        venueLine ? `Where: ${venueLine}` : '',
      ].filter(Boolean);
      await Share.share({ message: parts.join('\n') });
    } catch (e) {
      console.warn('[fight-detail] share error:', e);
    }
  }, [title, timeLabel, eventTitle, venueLine]);

  const handleReport = useCallback(() => {
    if (!fightId) return;
    router.push({
      pathname: '/(modals)/report',
      params: {
        type: 'fight',
        targetId: fightId,
        targetName: title,
        returnTo: `/poundrr/fights/${fightId}`,
      },
    });
  }, [router, fightId, title]);

  const handleViewEvent = useCallback(() => {
    const eventId = fight?.eventId;
    if (!eventId) return;
    router.push(`/poundrr/events/${eventId}`);
  }, [router, fight?.eventId]);

  const handleUploadHighlight = useCallback(() => {
    if (!fightId) return;
    if (!uid) {
      Alert.alert('Sign in required', 'Please log in to upload a highlight.');
      router.push('/login');
      return;
    }
    router.push({
      pathname: '/(modals)/highlight-upload',
      params: {
        fightId,
        returnTo: `/poundrr/fights/${fightId}`,
      },
    });
  }, [uid, router, fightId]);

  const openHighlight = useCallback(
    (id: string) => {
      router.push({
        pathname: '/(modals)/highlight-viewer',
        params: { id, autoplay: '1', returnTo: `/poundrr/fights/${fightId}` },
      });
    },
    [router, fightId]
  );

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#fff" />
      </View>
    );
  }

  if (notFound || !fightId) {
    return (
      <View style={styles.center}>
        <Text style={styles.muted}>Fight not found.</Text>
        <Pressable onPress={() => router.back()} style={({ pressed }) => [styles.btnGhost, pressed && { opacity: 0.85 }]}>
          <Text style={styles.btnGhostText}>Go Back</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <FlatList
      data={highlights}
      keyExtractor={(it) => it.id}
      ListHeaderComponent={
        <View>
          {/* Header: fighter vs fighter */}
          <View style={styles.headerCard}>
            <View style={styles.fightersRow}>
              <FighterCell name={fight?.redName ?? 'TBD'} avatarUrl={fight?.redAvatarUrl ?? null} align="right" />
              <Text style={styles.vsText}>VS</Text>
              <FighterCell name={fight?.blueName ?? 'TBD'} avatarUrl={fight?.blueAvatarUrl ?? null} align="left" />
            </View>

            {/* Meta */}
            <View style={styles.metaWrap}>
              {!!(fight?.weightClass || timeLabel) && (
                <Text style={styles.metaLine} numberOfLines={2}>
                  {fight?.weightClass ? `${fight.weightClass}` : ''}
                  {timeLabel ? `${fight?.weightClass ? ' • ' : ''}${timeLabel}` : ''}
                </Text>
              )}
              {!!eventTitle && (
                <Text style={styles.metaLine} numberOfLines={2}>
                  Event: {eventTitle}
                </Text>
              )}
              {!!venueLine && (
                <Text style={styles.metaLine} numberOfLines={2}>
                  Venue: {venueLine}
                </Text>
              )}
              {!!fight?.result && (
                <Text style={styles.metaResult} numberOfLines={2}>
                  Result: {fight.result}
                </Text>
              )}
            </View>

            {/* Actions */}
            <View style={styles.actionsRow}>
              <Pressable onPress={handleShare} style={({ pressed }) => [styles.btn, pressed && { opacity: 0.9 }]}>
                <Text style={styles.btnText}>Share</Text>
              </Pressable>
              <Pressable onPress={handleReport} style={({ pressed }) => [styles.btn, pressed && { opacity: 0.9 }]}>
                <Text style={styles.btnText}>Report</Text>
              </Pressable>
              {!!fight?.eventId && (
                <Pressable onPress={handleViewEvent} style={({ pressed }) => [styles.btn, pressed && { opacity: 0.9 }]}>
                  <Text style={styles.btnText}>View Event</Text>
                </Pressable>
              )}
              <Pressable
                onPress={handleUploadHighlight}
                style={({ pressed }) => [styles.btnPrimary, pressed && { opacity: 0.92 }]}
              >
                <Text style={styles.btnPrimaryText}>Upload Highlight</Text>
              </Pressable>
            </View>
          </View>

          {/* Highlights header */}
          <View style={[styles.card, { marginTop: 12 }]}>
            <Text style={styles.sectionTitle}>Highlights</Text>
            {loadingHighlights && (
              <View style={{ paddingVertical: 10 }}>
                <ActivityIndicator color="#fff" />
              </View>
            )}
            {!loadingHighlights && highlights.length === 0 && (
              <Text style={styles.muted}>No highlights yet. Be the first to upload!</Text>
            )}
          </View>
        </View>
      }
      renderItem={({ item }) => (
        <HighlightCard
          row={item}
          onOpen={() => openHighlight(item.id)}
        />
      )}
      contentContainerStyle={{ paddingBottom: 24, paddingTop: 8, gap: 12 }}
      removeClippedSubviews
      windowSize={7}
      maxToRenderPerBatch={12}
      initialNumToRender={12}
    />
  );
}

function FighterCell({
  name,
  avatarUrl,
  align,
}: {
  name: string;
  avatarUrl: string | null | undefined;
  align: 'left' | 'right';
}): React.ReactElement {
  return (
    <View style={[styles.fighterCell, align === 'left' ? { alignItems: 'flex-start' } : { alignItems: 'flex-end' }]}>
      <View style={styles.avatarWrap}>
        {avatarUrl ? (
          <Image source={{ uri: avatarUrl }} style={styles.avatar} />
        ) : (
          <View style={[styles.avatar, { backgroundColor: '#0f0f0f', alignItems: 'center', justifyContent: 'center' }]}>
            <Text style={{ color: '#fff', fontFamily: 'Inter_700Bold' }}>
              {name?.[0]?.toUpperCase() ?? '?'}
            </Text>
          </View>
        )}
      </View>
      <Text style={styles.fighterName} numberOfLines={1}>{name}</Text>
    </View>
  );
}

function HighlightCard({
  row,
  onOpen,
}: {
  row: HighlightRow;
  onOpen: () => void;
}): React.ReactElement {
  return (
    <Pressable onPress={onOpen} style={({ pressed }) => [styles.card, pressed && { opacity: 0.96 }]}>
      <View style={{ paddingHorizontal: 12, paddingVertical: 12 }}>
        <Text style={styles.highlightTitle} numberOfLines={2}>
          {row.title || 'Highlight'}
        </Text>
        {!!row.description && (
          <Text style={styles.highlightDesc} numberOfLines={2}>
            {row.description}
          </Text>
        )}
        <View style={styles.highlightMetaRow}>
          {!!row.durationMs && (
            <View style={styles.pill}>
              <Text style={styles.pillText}>
                {(row.durationMs / 1000).toFixed(0)}s
              </Text>
            </View>
          )}
          {!!row.createdAt && (
            <View style={styles.pill}>
              <Text style={styles.pillText}>
                {row.createdAt.toDate().toLocaleDateString()}
              </Text>
            </View>
          )}
        </View>
        <View style={{ marginTop: 10 }}>
          <Text style={styles.btnText}>Tap to play</Text>
        </View>
      </View>
    </Pressable>
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
  headerCard: {
    marginHorizontal: 14,
    backgroundColor: CARD_BG,
    borderRadius: 12,
    borderTopWidth: 3,
    borderTopColor: RED,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  fightersRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  fighterCell: {
    flex: 1,
    gap: 8,
  },
  vsText: {
    fontFamily: 'Inter_700Bold',
    color: '#fff',
    fontSize: 16,
    paddingHorizontal: 12,
  },
  avatarWrap: {
    width: 72,
    height: 72,
    borderRadius: 999,
    backgroundColor: 'rgba(0,0,0,0.3)',
    overflow: 'hidden',
  },
  avatar: {
    width: '100%',
    height: '100%',
    borderRadius: 999,
  },
  fighterName: {
    fontFamily: 'Inter_700Bold',
    color: '#fff',
    fontSize: 16,
  },
  metaWrap: {
    marginTop: 10,
    gap: 4,
  },
  metaLine: {
    fontFamily: 'Inter_400Regular',
    color: '#e5e7eb',
    fontSize: 13,
  },
  metaResult: {
    marginTop: 6,
    fontFamily: 'Inter_700Bold',
    color: '#e5e7eb',
    fontSize: 13,
  },
  actionsRow: {
    marginTop: 12,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    alignItems: 'center',
  },
  card: {
    marginHorizontal: 14,
    backgroundColor: CARD_BG,
    borderRadius: 12,
    borderTopWidth: 3,
    borderTopColor: RED,
    overflow: 'hidden',
  },
  sectionTitle: {
    fontFamily: 'Inter_700Bold',
    color: '#fff',
    fontSize: 16,
  },
  muted: {
    fontFamily: 'Inter_400Regular',
    color: '#cbd5e1',
    fontSize: 13,
    textAlign: 'center',
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
  btnPrimary: {
    backgroundColor: RED,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  btnPrimaryText: {
    fontFamily: 'Inter_700Bold',
    color: '#fff',
    fontSize: 14,
    letterSpacing: 0.6,
  },
  pill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  pillText: {
    fontFamily: 'Inter_700Bold',
    color: '#e5e7eb',
    fontSize: 12,
  },
  highlightTitle: {
    fontFamily: 'Inter_700Bold',
    color: '#fff',
    fontSize: 16,
  },
  highlightDesc: {
    marginTop: 4,
    fontFamily: 'Inter_400Regular',
    color: '#e5e7eb',
    fontSize: 13,
  },
  highlightMetaRow: {
    marginTop: 8,
    flexDirection: 'row',
    gap: 6,
  },
  // Back button styles for the "not found" state
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
