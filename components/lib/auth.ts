// lib/auth.ts — thin lazy-auth wrapper
import { getAuthInstance } from '@/firebase';

export const authAPI = {
  onAuthStateChanged: async (cb: (u: any) => void) => {
    const auth = await getAuthInstance();
    const { onAuthStateChanged } = await import('firebase/auth');
    return onAuthStateChanged(auth, cb);
  },
  signInWithEmailAndPassword: async (email: string, password: string) => {
    const auth = await getAuthInstance();
    const { signInWithEmailAndPassword } = await import('firebase/auth');
    return signInWithEmailAndPassword(auth, email, password);
  },
  signOut: async () => {
    const auth = await getAuthInstance();
    const { signOut } = await import('firebase/auth');
    return signOut(auth);
  },
};
