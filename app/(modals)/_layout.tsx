// File: app/(modals)/_layout.tsx
// Notes:
// - No Auth here (not needed).
// - Default export component; strict-friendly typing.
// - Presents all screens in this group as native modals, sliding up from bottom.
// - Transparent content so individual modals can render their own cards/backdrops.

import { Stack } from 'expo-router';
import React from 'react';

export default function ModalsLayout(): React.ReactElement {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        presentation: 'modal',
        animation: 'slide_from_bottom',
        contentStyle: { backgroundColor: 'transparent' },
      }}
    />
  );
}
