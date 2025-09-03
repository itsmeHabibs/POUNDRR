// firebase.ts
import { getApp, getApps, initializeApp } from 'firebase/app';
import { getFirestore, initializeFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

const firebaseConfig = {
  apiKey: 'AIzaSyCLqFed4zW-pSGMQXOMGPWAzYtiS259UNc',
  authDomain: 'poundrrdayls.firebaseapp.com',
  projectId: 'poundrrdayls',
  storageBucket: 'poundrrdayls.appspot.com',
  messagingSenderId: '161989336467',
  appId: '1:161989336467:web:287ddd925bea6367505c66',
  measurementId: 'G-C6TE2JWYLM',
} as const;

export const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

// 🔑 IMPORTANT: specify the non-default database id: 'poundrr'
export const db = (() => {
  try {
    return initializeFirestore(
      app,
      {
        experimentalForceLongPolling: true, // stable on RN
        ignoreUndefinedProperties: true,
      },
      'poundrr' // <-- your database id
    );
  } catch {
    // If already initialized (hot reload), get the same instance by id
    return getFirestore(app, 'poundrr'); // <-- same id here
  }
})();

export const storage = getStorage(app);

// ----- your existing lazy Auth stays the same -----
export async function getAuthInstance(): Promise<import('firebase/auth').Auth> {
  const { Platform } = await import('react-native');
  const { getAuth, initializeAuth, getReactNativePersistence } = await import('firebase/auth');
  const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;

  if (Platform.OS === 'web') return getAuth(app);
  try {
    return initializeAuth(app, { persistence: getReactNativePersistence(AsyncStorage) });
  } catch {
    return getAuth(app);
  }
}
