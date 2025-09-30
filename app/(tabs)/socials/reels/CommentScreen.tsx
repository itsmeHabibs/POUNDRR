// app/(tabs)/socials/reels/CommentsScreen.tsx
import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, TextInput, TouchableOpacity } from 'react-native';
import { addDoc, collection, onSnapshot, serverTimestamp, query, orderBy } from 'firebase/firestore';
import { db } from '../../../../firebase';
import styles from './Reelstyles';

export default function CommentsScreen({ route }: any) {
  const { reelId } = route.params;
  const [comments, setComments] = useState<{ id: string; text: string }[]>([]);
  const [newComment, setNewComment] = useState('');

  useEffect(() => {
    const q = query(
      collection(db, 'reels', reelId, 'comments'),
      orderBy('createdAt', 'asc')
    );
    const unsub = onSnapshot(q, (snapshot) => {
      setComments(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })) as any);
    });
    return () => unsub();
  }, [reelId]);

  const handleSend = async () => {
    if (!newComment.trim()) return;
    await addDoc(collection(db, 'reels', reelId, 'comments'), {
      text: newComment.trim(),
      createdAt: serverTimestamp(),
    });
    setNewComment('');
  };

  return (
    <View style={styles.commentContainer}>
      <FlatList
        data={comments}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <Text style={{ padding: 10 }}>{item.text}</Text>}
      />

      <View style={styles.commentInputContainer}>
        <TextInput
          style={styles.commentInput}
          placeholder="Add a comment..."
          value={newComment}
          onChangeText={setNewComment}
        />
        <TouchableOpacity style={styles.sendBtn} onPress={handleSend}>
          <Text style={styles.sendBtnText}>Send</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}
