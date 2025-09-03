// File: app/hooks/useRequireUsername.ts
// Rules followed:
// - Never import from 'firebase/auth' at module top-level.
// - Use the lazy auth wrapper (authAPI) to subscribe to auth state.
// - Firestore is safe at module scope.
// - Strict-friendly TS; proper unsubscribe cleanup.

import { doc, onSnapshot } from 'firebase/firestore';
import { useEffect, useState } from 'react';

import { db } from '@/firebase';
import { authAPI } from '@/lib/auth';

type UserDoc = {
  username?: string | null;
  waiver?: { acceptedAt?: unknown } | null;
};

type UseRequireUsername = {
  checking: boolean;
  needs: boolean; // true if user needs to complete username + waiver
  error?: string | null;
};

/** Returns {checking, needs} to gate Tabs until username + waiver are complete */
export function useRequireUsername(): UseRequireUsername {
  const [checking, setChecking] = useState<boolean>(true);
  const [needs, setNeeds] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let offAuth: (() => void) | undefined;
    let offUserDoc: (() => void) | undefined;

    (async () => {
      try {
        // Subscribe lazily to auth changes
        offAuth = await authAPI.onAuthStateChanged((u: { uid: string } | null) => {
          // Clean up doc listener on user change
          if (offUserDoc) {
            offUserDoc();
            offUserDoc = undefined;
          }

          if (!u) {
            setNeeds(true);
            setChecking(false);
            return;
          }

          // Subscribe to users/{uid}
          const ref = doc(db, 'users', u.uid);
          offUserDoc = onSnapshot(
            ref,
            (snap) => {
              const d = (snap.data() as UserDoc | undefined) ?? {};
              const hasUsername =
                typeof d.username === 'string' && d.username.trim().length >= 3;
              const waiverOk = !!d.waiver?.acceptedAt;
              setNeeds(!(hasUsername && waiverOk));
              setChecking(false);
            },
            (err) => {
              setError(String(err));
              setNeeds(true);
              setChecking(false);
            }
          );
        });
      } catch (e) {
        setError(String(e));
        setNeeds(true);
        setChecking(false);
      }
    })();

    return () => {
      if (offUserDoc) offUserDoc();
      if (offAuth) offAuth();
    };
  }, []);

  return { checking, needs, error };
}
