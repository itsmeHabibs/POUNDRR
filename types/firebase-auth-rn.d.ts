// types/firebase-auth-rn.d.ts
import type { Persistence } from 'firebase/auth';
declare module 'firebase/auth' {
  export function getReactNativePersistence(storage: any): Persistence;
}
