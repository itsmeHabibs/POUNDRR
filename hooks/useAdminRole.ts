// File: app/hooks/useAdminRole.ts
// Rules followed:
// - Never import from 'firebase/auth' at module top-level.
// - Use the provided auth wrapper (authAPI) to subscribe lazily to auth state.
// - Firestore is safe at module scope.
// - Strict-friendly TS; proper unsubs and error handling.

import { doc, onSnapshot } from 'firebase/firestore';
import { useEffect, useState } from 'react';

import { db } from '@/firebase';
import { authAPI } from '@/lib/auth';

type UseAdminRole = {
  isAdmin: boolean;
  loading: boolean;
  error: string | null;
};

/** Admin flag is stored at: roles/{uid} with { admin: true } */
export function useAdminRole(): UseAdminRole {
  const [isAdmin, setIsAdmin] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let offAuth: (() => void) | undefined;
    let offRole: (() => void) | undefined;

    (async () => {
      try {
        // Subscribe to auth changes lazily via wrapper (keeps Expo/Hermes happy)
        offAuth = await authAPI.onAuthStateChanged((u: { uid: string } | null) => {
          // Clean up any previous role subscription when user changes
          if (offRole) {
            offRole();
            offRole = undefined;
          }

          if (!u) {
            setIsAdmin(false);
            setLoading(false);
            return;
          }

          // Subscribe to roles/{uid}
          const ref = doc(db, 'roles', u.uid);
          offRole = onSnapshot(
            ref,
            (snap) => {
              const data = (snap.data() as { admin?: boolean } | undefined) ?? {};
              setIsAdmin(Boolean(data.admin));
              setLoading(false);
            },
            (err) => {
              setError(String(err));
              setIsAdmin(false);
              setLoading(false);
            }
          );
        });
      } catch (e) {
        setError(String(e));
        setIsAdmin(false);
        setLoading(false);
      }
    })();

    return () => {
      if (offRole) offRole();
      if (offAuth) offAuth();
    };
  }, []);

  return { isAdmin, loading, error };
}
