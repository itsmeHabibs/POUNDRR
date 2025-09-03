// lib/auth.ts
// Lazy Auth wrapper utilities. Never import from 'firebase/auth' at module scope.

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
  createUserWithEmailAndPassword: async (email: string, password: string) => {
    const auth = await getAuthInstance();
    const { createUserWithEmailAndPassword } = await import('firebase/auth');
    return createUserWithEmailAndPassword(auth, email, password);
  },
  sendEmailVerification: async () => {
    const auth = await getAuthInstance();
    const { sendEmailVerification } = await import('firebase/auth');
    if (!auth.currentUser) throw new Error('No current user');
    return sendEmailVerification(auth.currentUser);
  },
  signOut: async () => {
    const auth = await getAuthInstance();
    const { signOut } = await import('firebase/auth');
    return signOut(auth);
  },
  updateProfile: async (displayName?: string, photoURL?: string) => {
    const auth = await getAuthInstance();
    const { updateProfile } = await import('firebase/auth');
    if (!auth.currentUser) throw new Error('No current user');
    return updateProfile(auth.currentUser, { displayName, photoURL });
  },
};
