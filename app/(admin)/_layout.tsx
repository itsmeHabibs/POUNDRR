// File: app/(admin)/_layout.tsx

import { Redirect, Stack } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';

import { getAuthInstance } from '@/firebase'; // lazy and exported now
import { useAuthUid } from '@/hooks/useAuthUid';

/**
 * AdminLayout
 * - Waits for Firebase Auth to initialize (no flicker / false redirects).
 * - Redirects to /login if not authenticated.
 * - Renders a Stack for nested admin routes when authenticated.
 *
 * Rules satisfied:
 * - No top-level `firebase/auth` imports.
 * - All auth calls live inside effects/hooks.
 * - Default export component, TS-safe typing.
 */
export default function AdminLayout(): React.ReactElement | null {
  const { uid, error } = useAuthUid();
  const [authReady, setAuthReady] = useState<boolean>(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        await getAuthInstance();
      } finally {
        if (mounted) setAuthReady(true);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  if (error) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 16 }}>
        <Text style={{ textAlign: 'center' }}>Auth error: {error}</Text>
      </View>
    );
  }

  if (!authReady) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator />
      </View>
    );
  }

  if (!uid) {
    // Adjust if your login route is different
    return <Redirect href="/login" />;
  }

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        // 'ios' is not a valid native-stack animation enum – use 'default' or a specific slide/fade variant
        animation: 'default',
        presentation: 'card',
      }}
    />
  );
}
