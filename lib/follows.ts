import {
    collection,
    deleteDoc,
    doc,
    getCountFromServer,
    getDoc,
    getDocs,
    limit,
    query,
    setDoc,
    where,
} from "firebase/firestore";
import { db } from "../firebase";


const FOLLOWS = "follows"; // follows/{fromUid_toUid} -> { from, to, ts }


export async function follow(currentUid: string, targetUid: string) {
if (currentUid === targetUid) return;
const id = `${currentUid}_${targetUid}`;
const ref = doc(db, FOLLOWS, id);
await setDoc(ref, { from: currentUid, to: targetUid, ts: Date.now() });
}


export async function unfollow(currentUid: string, targetUid: string) {
const id = `${currentUid}_${targetUid}`;
await deleteDoc(doc(db, FOLLOWS, id));
}


export async function isFollowing(currentUid: string, targetUid: string) {
const id = `${currentUid}_${targetUid}`;
const snap = await getDoc(doc(db, FOLLOWS, id));
return snap.exists();
}


export async function getFollowerCount(uid: string) {
const q = query(collection(db, FOLLOWS), where("to", "==", uid));
const agg = await getCountFromServer(q);
return agg.data().count;
}


export async function getFollowingCount(uid: string) {
const q = query(collection(db, FOLLOWS), where("from", "==", uid));
const agg = await getCountFromServer(q);
return agg.data().count;
}


export type FollowEdge = { from: string; to: string; ts: number };


export async function listFollowers(uid: string, pageSize = 30) {
const q = query(collection(db, FOLLOWS), where("to", "==", uid), limit(pageSize));
const snaps = await getDocs(q);
return snaps.docs.map((d) => d.data() as FollowEdge);
}

