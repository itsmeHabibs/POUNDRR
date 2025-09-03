// File: app/(tabs)/socials/chats/[uid].tsx
// Rules followed:
// - No top-level imports from 'firebase/auth'. (We use useAuthUid() for current uid.)
// - Firestore is fine at module scope.
// - Default export a React component.
// - TS strict-friendly; FlatList perf flags; no hooks at module scope.

import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { db } from '@/firebase';
import { useAuthUid } from '@/hooks/useAuthUid';

import {
  QueryDocumentSnapshot,
  Timestamp,
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  startAfter,
} from 'firebase/firestore';

type UserDoc = {
  displayName?: string | null;
  username?: string | null;
  photoURL?: string | null;
};

type MessageDoc = {
  senderUid: string;
  text: string;
  createdAt?: Timestamp | null;
  type?: 'text';
};

type MessageRow = MessageDoc & { id: string };

type ChatDoc = {
  participants: string[]; // [uidA, uidB]
  lastMessage?: string | null;
  updatedAt?: Timestamp | null;
};

const RED = '#f70000';
const CARD_BG = 'rgba(0,0,0,0.82)';
const BUBBLE_ME = 'rgba(247,0,0,0.18)';
const BUBBLE_THEM = 'rgba(255,255,255,0.08)';
const BORDER_FAINT = 'rgba(255,255,255,0.08)';
const PAGE_SIZE = 30;

/* ---------- helpers ---------- */
function makeChatId(a: string, b: string): string {
  return a < b ? `${a}_${b}` : `${b}_${a}`;
}
function formatTime(ts?: Timestamp | null): string {
  if (!ts) return '';
  try {
    const d = ts.toDate();
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}
function asStringParam(v: string | string[] | undefined): string | null {
  if (!v) return null;
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

/* ---------- screen ---------- */
export default function ChatWithUserScreen(): React.ReactElement {
  const router = useRouter();
  const { uid: otherUidParam } = useLocalSearchParams<{ uid?: string | string[] }>();
  const otherUid = asStringParam(otherUidParam);

  const { uid: myUid, error: authErr } = useAuthUid();

  const [otherUser, setOtherUser] = useState<UserDoc | null>(null);

  const [input, setInput] = useState<string>('');
  const [sending, setSending] = useState<boolean>(false);

  const [loading, setLoading] = useState<boolean>(true);
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [cursor, setCursor] = useState<QueryDocumentSnapshot | null>(null);
  const [hasMore, setHasMore] = useState<boolean>(true);
  const [loadingMore, setLoadingMore] = useState<boolean>(false);

  const flatRef = useRef<FlatList<MessageRow>>(null);

  const chatId = useMemo(() => {
    if (!myUid || !otherUid) return null;
    return makeChatId(myUid, otherUid);
  }, [myUid, otherUid]);

  const messagesColRef = useMemo(() => {
    if (!chatId) return null;
    return collection(db, 'chats', chatId, 'messages');
  }, [chatId]);

  // Ensure chat doc exists so message reads pass rules (participants gate)
  useEffect(() => {
    (async () => {
      if (!myUid || !otherUid || !chatId) return;
      try {
        const chatRef = doc(db, 'chats', chatId);
        const snap = await getDoc(chatRef);
        if (!snap.exists()) {
          await setDoc(
            chatRef,
            {
              participants: [myUid, otherUid],
              updatedAt: serverTimestamp(),
              lastMessage: '',
            } as ChatDoc,
            { merge: true }
          );
        } else {
          const data = (snap.data() as ChatDoc) ?? { participants: [] };
          const p = Array.isArray(data.participants) ? data.participants : [];
          if (!p.includes(myUid) || !p.includes(otherUid)) {
            await setDoc(
              chatRef,
              {
                participants: Array.from(new Set([...p, myUid, otherUid])),
                updatedAt: serverTimestamp(),
              } as Partial<ChatDoc>,
              { merge: true }
            );
          }
        }
      } catch (e) {
        console.warn('[chat] ensureChat error:', e);
      }
    })();
  }, [myUid, otherUid, chatId]);

  // Load other user's profile
  useEffect(() => {
    (async () => {
      if (!otherUid) return;
      try {
        const snap = await getDoc(doc(db, 'users', otherUid));
        setOtherUser(snap.exists() ? ((snap.data() as UserDoc) ?? null) : null);
      } catch (e) {
        console.warn('[chat] other user fetch error:', e);
      }
    })();
  }, [otherUid]);

  // Subscribe to latest messages
  useEffect(() => {
    if (!messagesColRef) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const q = query(messagesColRef, orderBy('createdAt', 'desc'), limit(PAGE_SIZE));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const rows: MessageRow[] = snap.docs.map((d) => ({ id: d.id, ...(d.data() as MessageDoc) }));
        setMessages(rows);
        const last = snap.docs[snap.docs.length - 1] ?? null;
        setCursor(last);
        setHasMore(Boolean(last) && snap.docs.length === PAGE_SIZE);
        setLoading(false);
      },
      (err) => {
        console.warn('[chat] onSnapshot error:', err);
        setLoading(false);
      }
    );
    return () => unsub();
  }, [messagesColRef]);

  const loadMore = useCallback(async () => {
    if (!messagesColRef || !cursor || !hasMore || loadingMore) return;
    setLoadingMore(true);
    try {
      const qMore = query(messagesColRef, orderBy('createdAt', 'desc'), startAfter(cursor), limit(PAGE_SIZE));
      const snap = await getDocs(qMore);
      const more: MessageRow[] = snap.docs.map((d) => ({ id: d.id, ...(d.data() as MessageDoc) }));
      setMessages((prev) => [...prev, ...more]);
      const last = snap.docs[snap.docs.length - 1] ?? null;
      setCursor(last);
      setHasMore(Boolean(last) && snap.docs.length === PAGE_SIZE);
    } catch (e) {
      console.warn('[chat] load more error:', e);
      setHasMore(false);
    } finally {
      setLoadingMore(false);
    }
  }, [messagesColRef, cursor, hasMore, loadingMore]);

  const sendMessage = useCallback(async () => {
    const text = input.trim();
    if (!text) return;
    if (!myUid || !otherUid || !chatId || !messagesColRef) return;

    try {
      setSending(true);
      // Ensure chat doc exists / update metadata
      const chatRef = doc(db, 'chats', chatId);
      await setDoc(
        chatRef,
        {
          participants: [myUid, otherUid],
          lastMessage: text,
          updatedAt: serverTimestamp(),
        } as ChatDoc,
        { merge: true }
      );

      await addDoc(messagesColRef, {
        senderUid: myUid,
        text,
        type: 'text',
        createdAt: serverTimestamp(),
      } as MessageDoc);

      setInput('');
      // Scroll to bottom (index 0 because inverted)
      requestAnimationFrame(() => {
        flatRef.current?.scrollToOffset({ offset: 0, animated: true });
      });
    } catch (e) {
      console.warn('[chat] send error:', e);
      Alert.alert('Error', 'Failed to send message.');
    } finally {
      setSending(false);
    }
  }, [input, myUid, otherUid, chatId, messagesColRef]);

  // Guards
  if (authErr) {
    return (
      <SafeAreaView style={styles.center}>
        <Text style={styles.muted}>Auth error: {authErr}</Text>
      </SafeAreaView>
    );
  }
  if (!myUid) {
    return (
      <SafeAreaView style={styles.center}>
        <Text style={styles.muted}>You’re signed out. Please log in to chat.</Text>
        <Pressable
          onPress={() => router.replace('/login')}
          style={({ pressed }) => [styles.btnPrimary, pressed && { opacity: 0.9 }]}
        >
          <Text style={styles.btnPrimaryText}>Go to Login</Text>
        </Pressable>
      </SafeAreaView>
    );
  }
  if (!otherUid) {
    return (
      <SafeAreaView style={styles.center}>
        <Text style={styles.muted}>No user selected.</Text>
      </SafeAreaView>
    );
  }

  const title = otherUser?.displayName || otherUser?.username || 'Chat';

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.select({ ios: 'padding', android: undefined })}
      keyboardVerticalOffset={Platform.select({ ios: 64, android: 0 })}
    >
      <SafeAreaView style={{ flex: 1 }}>
        {/* Header */}
        <View style={styles.topBar}>
          <Pressable onPress={() => router.back()} style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.9 }]}>
            <Text style={styles.backTxt}>‹</Text>
          </Pressable>
          <View style={styles.otherRow}>
            <View style={styles.avatarWrap}>
              {otherUser?.photoURL ? (
                <Image source={{ uri: otherUser.photoURL }} style={styles.avatar} />
              ) : (
                <View style={[styles.avatar, styles.avatarFallbackBg]}>
                  <Text style={styles.avatarFallback}>
                    {(title?.[0] ?? '?').toUpperCase()}
                  </Text>
                </View>
              )}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.title} numberOfLines={1}>
                {title}
              </Text>
              {!!otherUser?.username && (
                <Text style={styles.subtitle} numberOfLines={1}>
                  @{otherUser.username}
                </Text>
              )}
            </View>
          </View>
          <View style={{ width: 36 }} />
        </View>

        {/* Messages */}
        {loading && messages.length === 0 ? (
          <View style={[styles.center, { paddingTop: 40 }]}>
            <ActivityIndicator color="#fff" />
          </View>
        ) : (
          <FlatList
            ref={flatRef}
            data={messages}
            inverted
            keyExtractor={(it) => it.id}
            renderItem={({ item }) => (
              <ChatBubble
                row={item}
                isMe={item.senderUid === myUid}
              />
            )}
            contentContainerStyle={{ paddingHorizontal: 12, paddingTop: 8, paddingBottom: 10 }}
            onEndReachedThreshold={0.25}
            onEndReached={() => {
              if (!loading && hasMore && !loadingMore) void loadMore();
            }}
            ListFooterComponent={
              loadingMore ? (
                <View style={{ paddingVertical: 8 }}>
                  <ActivityIndicator color="#fff" />
                </View>
              ) : null
            }
            removeClippedSubviews
            windowSize={9}
            maxToRenderPerBatch={28}
            initialNumToRender={28}
          />
        )}

        {/* Composer */}
        <View style={styles.composerWrap}>
          <TextInput
            style={styles.input}
            placeholder="Message…"
            placeholderTextColor="#9ca3af"
            value={input}
            onChangeText={setInput}
            multiline
            maxLength={2000}
          />
          <Pressable
            onPress={sendMessage}
            disabled={!input.trim() || sending}
            style={({ pressed }) => [styles.sendBtn, (pressed || !input.trim() || sending) && { opacity: 0.9 }]}
          >
            <Text style={styles.sendTxt}>{sending ? '…' : 'Send'}</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}

/* ---------- row component ---------- */
function ChatBubble({ row, isMe }: { row: MessageRow; isMe: boolean }): React.ReactElement {
  const time = formatTime(row.createdAt ?? undefined);
  return (
    <View style={[styles.bubbleRow, isMe ? { justifyContent: 'flex-end' } : { justifyContent: 'flex-start' }]}>
      <View
        style={[
          styles.bubble,
          isMe ? styles.bubbleMe : styles.bubbleThem,
          isMe ? { borderTopRightRadius: 4 } : { borderTopLeftRadius: 4 },
        ]}
      >
        <Text style={styles.bubbleText}>{row.text}</Text>
        <Text style={styles.bubbleTime}>{time}</Text>
      </View>
    </View>
  );
}

/* ---------- styles ---------- */
const styles = StyleSheet.create({
  center: {
    flex: 1,
    backgroundColor: 'black',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  muted: {
    fontFamily: 'Inter_400Regular',
    color: '#cbd5e1',
    fontSize: 13,
    textAlign: 'center',
  },

  topBar: {
    height: 54,
    paddingHorizontal: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: BORDER_FAINT,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backTxt: {
    fontFamily: 'Inter_700Bold',
    color: '#fff',
    fontSize: 22,
    lineHeight: 22,
  },
  otherRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  avatarWrap: {
    width: 36,
    height: 36,
    borderRadius: 999,
    overflow: 'hidden',
    backgroundColor: '#0f0f0f',
  },
  avatar: {
    width: '100%',
    height: '100%',
    borderRadius: 999,
  },
  avatarFallbackBg: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0f0f0f',
  },
  avatarFallback: {
    fontFamily: 'Inter_700Bold',
    color: '#fff',
    fontSize: 14,
  },
  title: {
    fontFamily: 'Inter_700Bold',
    color: '#fff',
    fontSize: 16,
  },
  subtitle: {
    marginTop: 1,
    fontFamily: 'Inter_400Regular',
    color: '#cbd5e1',
    fontSize: 12,
  },

  bubbleRow: {
    width: '100%',
    paddingVertical: 6,
  },
  bubble: {
    maxWidth: '80%',
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: BORDER_FAINT,
  },
  bubbleMe: {
    alignSelf: 'flex-end',
    backgroundColor: BUBBLE_ME,
  },
  bubbleThem: {
    alignSelf: 'flex-start',
    backgroundColor: BUBBLE_THEM,
  },
  bubbleText: {
    fontFamily: 'Inter_400Regular',
    color: '#fff',
    fontSize: 14,
  },
  bubbleTime: {
    marginTop: 4,
    alignSelf: 'flex-end',
    fontFamily: 'Inter_400Regular',
    color: '#cbd5e1',
    fontSize: 10,
  },

  composerWrap: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: BORDER_FAINT,
    backgroundColor: CARD_BG,
  },
  input: {
    flex: 1,
    minHeight: 40,
    maxHeight: 140,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: 'rgba(0,0,0,0.25)',
    color: '#fff',
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
  },
  sendBtn: {
    backgroundColor: RED,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendTxt: {
    fontFamily: 'Inter_700Bold',
    color: '#fff',
    fontSize: 14,
    letterSpacing: 0.4,
  },

  // Missing earlier: primary button styles for login guard
  btnPrimary: {
    backgroundColor: RED,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 10,
    alignItems: 'center',
  },
  btnPrimaryText: {
    fontFamily: 'Inter_700Bold',
    color: '#fff',
    fontSize: 16,
    letterSpacing: 0.6,
  },
});
