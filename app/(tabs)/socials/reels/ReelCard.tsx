// app/(tabs)/socials/reels/ReelCard.tsx
import React, { useRef } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Video, ResizeMode } from 'expo-av';
import styles from './Reelstyles';

// import styles from './temp.ts';
type Reel = {
  id: string;
  videoUrl: string;
  username: string;
  description: string;
  likes: number;
};

interface ReelCardProps {
  reel: Reel;
  onLike: () => void;
  onComment: () => void;
}

export default function ReelCard({ reel, onLike, onComment }: ReelCardProps) {
  const videoRef = useRef<Video | null>(null);

  return (
    <View style={styles.reelContainer}>
      <Video
        ref={videoRef}
        source={{ uri: reel.videoUrl }}
        style={styles.video}
        resizeMode={ResizeMode.COVER}
        shouldPlay
        isLooping
      />

      <View style={styles.overlay}>
        <Text style={styles.username}>@{reel.username}</Text>
        <Text style={styles.description}>{reel.description}</Text>
      </View>

      <View style={styles.actions}>
        <TouchableOpacity style={styles.actionBtn} onPress={onLike}>
          <Text style={styles.actionText}>❤️ {reel.likes}</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.actionBtn} onPress={onComment}>
          <Text style={styles.actionText}>💬 Comment</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}
