// app/(tabs)/spotify/spotify.ts
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';

let accessToken: string | null = null;

export async function getToken(): Promise<string> {
  if (accessToken) return accessToken;

  const token = await AsyncStorage.getItem('spotify_access_token');
  if (token) {
    accessToken = token;
    return token;
  }
  throw new Error('Spotify token not found. Authenticate first.');
}

export async function togglePlayPause() {
  const token = await getToken();
  const playback = await axios.get('https://api.spotify.com/v1/me/player', {
    headers: { Authorization: `Bearer ${token}` },
  });

  const isPlaying = playback.data?.is_playing ?? false;
  const url = `https://api.spotify.com/v1/me/player/${isPlaying ? 'pause' : 'play'}`;
  await axios.put(url, {}, { headers: { Authorization: `Bearer ${token}` } });
}

export async function getCurrentTrack() {
  try {
    const token = await getToken();
    const res = await axios.get('https://api.spotify.com/v1/me/player/currently-playing', {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.data) return null;
    return {
      name: res.data.item.name,
      artist: res.data.item.artists.map((a: any) => a.name).join(', '),
      playing: res.data.is_playing,
      albumArt: res.data.item.album.images[0].url,
    };
  } catch {
    return null;
  }
}
