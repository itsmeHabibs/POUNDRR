// File: app/(auth)/_layout.tsx
import { Slot } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { VideoView, useVideoPlayer } from 'expo-video';
import { StyleSheet, View } from 'react-native';

const BG_VIDEO = require('@/assets/Background480.mp4');

export default function AuthLayout() {
  const player = useVideoPlayer(BG_VIDEO, (p) => {
    p.loop = true;
    p.volume = 0;
    try { p.play(); } catch {}
  });

  return (
    <View style={styles.root}>
      <VideoView
        style={styles.bgVideo}
        player={player}
        contentFit="cover"
        nativeControls={false}
        allowsFullscreen={false}
        allowsPictureInPicture={false}
        pointerEvents="none"
      />

      <View style={styles.overlay} pointerEvents="none" />

      <View style={styles.content}>
        <Slot />
      </View>

      <StatusBar style="light" />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: 'black' },
  bgVideo: { ...StyleSheet.absoluteFillObject },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  content: {
    flex: 1,
    // If you want global padding for all auth screens, uncomment:
    // paddingHorizontal: 16,
    // paddingTop: Platform.select({ ios: 12, android: 8, default: 8 }),
  },
});
