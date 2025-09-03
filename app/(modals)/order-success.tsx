// File: app/(modals)/order-success.tsx
// Notes:
// - No firebase/auth usage (not needed).
// - Default export component; strict-friendly TS.
// - Open with params; example:
//     router.push({
//       pathname: '/(modals)/order-success',
//       params: {
//         orderId: createdOrderId,
//         title: 'Premium Bundle',
//         amount: 'A$24.99',        // or use total
//         eta: 'Available immediately',
//         note: 'A receipt has been emailed to you.',
//         viewPath: '/(tabs)/orders/[id]',
//         returnTo: '/(tabs)/home'
//       },
//     });

import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useMemo } from 'react';
import {
  Dimensions,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

type Params = {
  orderId?: string | string[];
  title?: string | string[];
  amount?: string | string[];   // formatted label e.g., "A$24.99"
  total?: string | string[];    // alias for amount
  currency?: string | string[]; // optional, for future use
  eta?: string | string[];
  note?: string | string[];
  viewPath?: string | string[]; // route to push to see details
  returnTo?: string | string[]; // route to replace to when closing
};

const { width } = Dimensions.get('window');
const RED = '#f70000';
const CARD_BG = 'rgba(0,0,0,0.82)';
const GREEN = '#16a34a';

function toSingle(v?: string | string[] | null): string | undefined {
  if (v == null) return undefined;
  return Array.isArray(v) ? v[0] : v;
}

export default function OrderSuccessModal(): React.ReactElement {
  const router = useRouter();
  const params = useLocalSearchParams<Params>();

  const orderId = useMemo(() => toSingle(params.orderId), [params.orderId]);
  const title = useMemo(() => toSingle(params.title) ?? 'Order Confirmed', [params.title]);
  const amount = useMemo(
    () => toSingle(params.amount) ?? toSingle(params.total),
    [params.amount, params.total]
  );
  const eta = useMemo(() => toSingle(params.eta) ?? 'Your purchase is ready.', [params.eta]);
  const note = useMemo(
    () => toSingle(params.note) ?? 'A receipt has been emailed to you.',
    [params.note]
  );
  const viewPath = useMemo(() => toSingle(params.viewPath), [params.viewPath]);
  const returnTo = useMemo(() => toSingle(params.returnTo), [params.returnTo]);

  const handleClose = () => {
    if (returnTo) router.replace(returnTo);
    else router.back();
  };

  const handleViewOrder = () => {
    if (!viewPath) return handleClose();
    // If viewPath includes a dynamic [id], the caller should pass it resolved.
    router.replace(viewPath);
  };

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.card}>
        {/* Success badge */}
        <View style={styles.badge}>
          <Text style={styles.badgeIcon}>✓</Text>
        </View>

        <Text style={styles.heading}>Success!</Text>

        <View style={{ alignItems: 'center', marginTop: 6 }}>
          <Text style={styles.title} numberOfLines={2}>
            {title}
          </Text>
          {amount && (
            <Text style={styles.amount} numberOfLines={1}>
              {amount}
            </Text>
          )}
        </View>

        <View style={styles.divider} />

        {/* Meta */}
        <View style={{ width: '100%', gap: 6 }}>
          {!!orderId && (
            <Row label="Order ID" value={orderId} />
          )}
          {!!eta && <Row label="ETA" value={eta} />}
          {!!note && (
            <Text style={styles.note} numberOfLines={3}>
              {note}
            </Text>
          )}
        </View>

        {/* Actions */}
        <View style={styles.actions}>
          <Pressable
            onPress={handleViewOrder}
            style={({ pressed }) => [styles.btnPrimary, pressed && { opacity: 0.9 }]}
          >
            <Text style={styles.btnPrimaryText}>
              {viewPath ? 'View Order' : 'Done'}
            </Text>
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

function Row({ label, value }: { label: string; value: string }): React.ReactElement {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue} numberOfLines={2}>
        {value}
      </Text>
    </View>
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
    width: Math.min(width - 32, 420),
    backgroundColor: CARD_BG,
    borderRadius: 16,
    paddingHorizontal: 20,
    paddingVertical: 20,
    alignItems: 'center',
    borderTopWidth: 4,
    borderTopColor: RED,
  },
  badge: {
    width: 72,
    height: 72,
    borderRadius: 999,
    backgroundColor: 'rgba(22,163,74,0.16)',
    borderWidth: 2,
    borderColor: GREEN,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  badgeIcon: {
    fontSize: 40,
    color: GREEN,
    fontFamily: 'Inter_700Bold',
    lineHeight: 44,
  },
  heading: {
    marginTop: 10,
    fontFamily: 'Inter_700Bold',
    color: '#fff',
    fontSize: 22,
    letterSpacing: 0.6,
  },
  title: {
    marginTop: 2,
    fontFamily: 'Inter_700Bold',
    color: '#fff',
    fontSize: 16,
    textAlign: 'center',
  },
  amount: {
    marginTop: 2,
    fontFamily: 'Inter_700Bold',
    color: '#e5e7eb',
    fontSize: 14,
  },
  divider: {
    width: '100%',
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.12)',
    marginVertical: 14,
  },
  row: {
    width: '100%',
    flexDirection: 'row',
    gap: 10,
    alignItems: 'flex-start',
  },
  rowLabel: {
    width: 88,
    fontFamily: 'Inter_700Bold',
    color: '#cbd5e1',
    fontSize: 12,
  },
  rowValue: {
    flex: 1,
    fontFamily: 'Inter_400Regular',
    color: '#fff',
    fontSize: 13,
  },
  note: {
    marginTop: 6,
    fontFamily: 'Inter_400Regular',
    color: '#cbd5e1',
    fontSize: 12,
  },
  actions: {
    width: '100%',
    marginTop: 16,
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
});
