// hooks/useAuthUid.ts — get uid reactively (lazy auth)
import { useEffect, useState } from 'react';
import { authAPI } from '@/lib/auth';

export function useAuthUid() {
  const [uid, setUid] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let unsub = () => {};
    (async () => { unsub = await authAPI.onAuthStateChanged(u => setUid(u?.uid ?? null)); })()
      .catch(e => setError(String(e)));
    return () => unsub();
  }, []);
  return { uid, error };
}
