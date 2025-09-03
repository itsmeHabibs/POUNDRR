// lib/usernames.ts
import { Firestore, doc, getDoc, runTransaction } from 'firebase/firestore';
import { db } from '../firebase';

const USERNAME_REGEX = /^[a-z0-9._]{3,20}$/;

export function normalizeUsername(raw: string) {
  return (raw || '').trim().toLowerCase();
}

export function validateUsername(raw: string):
  | { ok: true; value: string }
  | { ok: false; reason: string } {
  const v = normalizeUsername(raw);
  if (v.length < 3) return { ok: false, reason: 'Must be at least 3 characters' };
  if (v.length > 20) return { ok: false, reason: 'Must be at most 20 characters' };
  if (!USERNAME_REGEX.test(v)) {
    return { ok: false, reason: 'Use a–z, 0–9, dot (.) or underscore (_)' };
  }
  return { ok: true, value: v };
}

export async function isUsernameAvailable(username: string) {
  const uname = normalizeUsername(username);
  if (!USERNAME_REGEX.test(uname)) return false;
  const ref = doc(db, 'usernames', uname);
  const snap = await getDoc(ref);
  return !snap.exists();
}

export async function reserveUsername(uid: string, raw: string) {
  const v = validateUsername(raw);
  if (!v.ok) throw new Error(v.reason);
  const username = v.value;
  const ref = doc(db, 'usernames', username);

  await runTransaction(db as Firestore, async (tx) => {
    const snap = await tx.get(ref);
    if (snap.exists()) throw new Error('Username already taken');
    tx.set(ref, { uid });
  });

  return username;
}

export async function getUidForUsername(username: string) {
  const uname = normalizeUsername(username);
  const ref = doc(db, 'usernames', uname);
  const snap = await getDoc(ref);
  return snap.exists() ? ((snap.data() as any).uid ?? null) : null;
}
