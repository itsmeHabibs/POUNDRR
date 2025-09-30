// app/(tabs)/socials/reels/index.tsx
import React, { useEffect, useState } from 'react';
import { View, FlatList } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { collection, onSnapshot, updateDoc, doc } from 'firebase/firestore';
import { db } from '../../../../firebase';
import ReelCard from './ReelCard';
import styles from './Reelstyles';

type Reel = {
  id: string;
  videoUrl: string;
  username: string;
  description: string;
  likes: number;
};

export default function ReelsFeed() {
  const [reels, setReels] = useState<Reel[]>([]);
  const navigation = useNavigation<any>();

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'reels'), (snapshot) => {
      const data = snapshot.docs.map((d) => ({ id: d.id, ...d.data() })) as Reel[];
      setReels(data);
    });
    return () => unsub();
  }, []);

  const handleLike = async (reel: Reel) => {
    await updateDoc(doc(db, 'reels', reel.id), {
      likes: reel.likes + 1,
    });
  };

  const handleComment = (reelId: string) => {
    navigation.navigate('CommentsScreen', { reelId });
  };

  return (
    <View style={styles.container}>
      <FlatList
        data={reels}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <ReelCard
            reel={item}
            onLike={() => handleLike(item)}
            onComment={() => handleComment(item.id)}
          />
        )}
        pagingEnabled
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}
