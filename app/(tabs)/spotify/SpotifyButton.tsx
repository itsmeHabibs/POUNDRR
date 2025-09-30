// File: app/(tabs)/spotify/SpotifyButton.tsx
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';
import { Image, Pressable, Text, View } from 'react-native';
import { getCurrentTrack, togglePlayPause } from './spotify';
import { useSpotifyAuth } from './spotifyAuth';

export function SpotifyButton() {
  const [track, setTrack] = useState<any>(null);
  const { request, promptAsync } = useSpotifyAuth();

  useEffect(() => {
    (async () => {
      const current = await getCurrentTrack();
      setTrack(current);
    })();
  }, []);

  const handlePress = async () => {
    try {
      let token = await AsyncStorage.getItem('spotify_access_token');

      if (!token && request) {
        // Trigger authentication flow
        const result = await promptAsync();
        token = await AsyncStorage.getItem('spotify_access_token');
      }

      if (token) {
        await togglePlayPause();
        const updated = await getCurrentTrack();
        setTrack(updated);
      }
    } catch (err) {
      console.log(err);
    }
  };

  return (
    <Pressable
      onPress={handlePress}
      style={{
        backgroundColor: '#1DB954',
        padding: 16,
        borderRadius: 999,
        alignItems: 'center',
        flexDirection: 'row',
      }}
    >
      {track?.albumArt && (
        <Image
          source={{ uri: track.albumArt }}
          style={{ width: 40, height: 40, marginRight: 8 }}
        />
      )}
      <View>
        <Text style={{ color: 'white', fontWeight: 'bold' }}>
          {track?.playing ? 'Pause' : 'Play'}
        </Text>
        {track && (
          <Text style={{ color: 'white', fontSize: 12 }}>
            {track.name} - {track.artist}
          </Text>
        )}
      </View>
    </Pressable>
  );
}
