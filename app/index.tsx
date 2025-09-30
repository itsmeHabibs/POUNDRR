// app/index.tsx
import { Redirect } from 'expo-router';

export default function Root() {
  return <Redirect href="/tabs/timer" />; // Redirects to timer inside tabs
}
