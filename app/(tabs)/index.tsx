// File: app/(tabs)/index.tsx
// Purpose: Default entry for the Tabs group. Instantly redirects to /poundrr.
// Rules followed:
// - No auth imports at module scope.
// - Default-export a React component; TS strict-friendly.

import { Redirect } from 'expo-router';
import React from 'react';

export default function TabsRootIndex(): React.ReactElement {
  return <Redirect href="/poundrr" />;
}
