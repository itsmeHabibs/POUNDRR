// File: app/(tabs)/profile/settings/index.tsx
// Rules followed:
// - No top-level imports from 'firebase/auth' (not needed here).
// - Firestore not used (no data), so nothing at module scope.
// - Default export a React component; strict-friendly TS.

import { useRouter } from 'expo-router';
import React, { useCallback } from 'react';
import {
  Alert,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

type Item = {
  title: string;
  subtitle?: string;
  onPress: () => void;
};

const RED = '#f70000';
const CARD_BG = 'rgba(0,0,0,0.82)';
const BORDER = 'rgba(255,255,255,0.14)';

export default function SettingsIndexScreen(): React.ReactElement {
  const router = useRouter();

  const goAccount = useCallback(() => {
    router.push('/profile/settings/account');
  }, [router]);

  const goMyTickets = useCallback(() => {
    router.push('/poundrr/events/my-tickets');
  }, [router]);

  const openWalletTopup = useCallback(() => {
    router.push({
      pathname: '/(modals)/wallet-topup',
      params: { returnTo: '/profile/settings' },
    });
  }, [router]);

  const showComingSoon = useCallback(() => {
    Alert.alert('Coming soon', 'This setting will be available in a future update.');
  }, []);

  const sections: { header: string; items: Item[] }[] = [
    {
      header: 'Account',
      items: [
        { title: 'Account details', subtitle: 'Name, email, password', onPress: goAccount },
        // Add more later (e.g., Privacy) — wire to `showComingSoon` until built:
        // { title: 'Privacy', subtitle: 'Blocking & visibility', onPress: showComingSoon },
      ],
    },
    {
      header: 'Wallet & Tickets',
      items: [
        { title: 'My tickets', subtitle: 'View your purchased tickets', onPress: goMyTickets },
        { title: 'Top up wallet', subtitle: 'Add funds via secure checkout', onPress: openWalletTopup },
      ],
    },
    {
      header: 'About',
      items: [
        { title: 'Terms of Service', onPress: showComingSoon },
        { title: 'Privacy Policy', onPress: showComingSoon },
      ],
    },
  ];

  return (
    <SafeAreaView style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: 24, gap: 14 }}>
        <Text style={styles.screenTitle}>Settings</Text>

        {sections.map((section) => (
          <View key={section.header} style={styles.card}>
            <Text style={styles.sectionHeader}>{section.header}</Text>
            <View style={styles.divider} />
            {section.items.map((item, idx) => (
              <Pressable
                key={`${section.header}-${item.title}`}
                onPress={item.onPress}
                style={({ pressed }) => [
                  styles.row,
                  pressed && { opacity: 0.95 },
                  idx < section.items.length - 1 && styles.rowDivider,
                ]}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowTitle}>{item.title}</Text>
                  {!!item.subtitle && <Text style={styles.rowSubtitle}>{item.subtitle}</Text>}
                </View>
                <Text style={styles.chev}>{'›'}</Text>
              </Pressable>
            ))}
          </View>
        ))}

        <View style={[styles.card, { borderTopColor: 'rgba(239,68,68,0.9)' }]}>
          <Text style={styles.sectionHeader}>Danger zone</Text>
          <View style={styles.divider} />
          <Pressable
            onPress={goAccount}
            style={({ pressed }) => [styles.row, pressed && { opacity: 0.95 }]}
          >
            <View style={{ flex: 1 }}>
              <Text style={[styles.rowTitle, { color: '#fff' }]}>Sign out / Delete account</Text>
              <Text style={styles.rowSubtitle}>Manage from Account details</Text>
            </View>
            <Text style={styles.chev}>{'›'}</Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

/* ---------- styles ---------- */
const styles = StyleSheet.create({
  screenTitle: {
    fontFamily: 'Inter_700Bold',
    color: '#fff',
    fontSize: 22,
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  card: {
    backgroundColor: CARD_BG,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderTopWidth: 3,
    borderTopColor: RED,
  },
  sectionHeader: {
    fontFamily: 'Inter_700Bold',
    color: '#fff',
    fontSize: 14,
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.12)',
    marginTop: 10,
    marginBottom: 6,
  },
  row: {
    paddingVertical: 12,
    paddingHorizontal: 4,
    flexDirection: 'row',
    alignItems: 'center',
  },
  rowDivider: {
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  rowTitle: {
    fontFamily: 'Inter_700Bold',
    color: '#e5e7eb',
    fontSize: 14,
  },
  rowSubtitle: {
    marginTop: 3,
    fontFamily: 'Inter_400Regular',
    color: '#9ca3af',
    fontSize: 12,
  },
  chev: {
    marginLeft: 10,
    fontFamily: 'Inter_700Bold',
    color: '#cbd5e1',
    fontSize: 22,
    lineHeight: 22,
  },
});
