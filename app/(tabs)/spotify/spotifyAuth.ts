// // app/(tabs)/spotify/spotifyAuth.ts
// import AsyncStorage from '@react-native-async-storage/async-storage';
// import { AuthSessionResult, makeRedirectUri } from 'expo-auth-session';
// import * as AuthSession from 'expo-auth-session';
// import * as Random from 'expo-random';

// const CLIENT_ID = '205b7a20d6df461b8d2abe82c6c7a263';
// const REDIRECT_URI = makeRedirectUri();
// const SCOPES = ['user-read-playback-state', 'user-modify-playback-state', 'streaming'];

// const SPOTIFY_AUTH_URL = 'https://accounts.spotify.com/authorize';

// export async function authenticateSpotify(): Promise<string> {
//   const state = Array.from(await Random.getRandomBytesAsync(16))
//     .map((b) => b.toString(16).padStart(2, '0'))
//     .join('');

//   const authUrl = `${SPOTIFY_AUTH_URL}?client_id=${CLIENT_ID}` +
//     `&response_type=token&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
//     `&scope=${encodeURIComponent(SCOPES.join(' '))}&state=${state}`;
//   const result = await AuthSession.startAsync({
//     authUrl,
//     returnUrl: REDIRECT_URI,
//   }) as AuthSessionResult & {
//     params?: { access_token?: string };
//   };

//   if (result.type === 'success' && result.params?.access_token) {
//     const token = result.params.access_token;
//     await AsyncStorage.setItem('spotify_access_token', token);
//     return token;
//   }

//   throw new Error('Spotify authentication failed or was cancelled');
// }


// app/(tabs)/spotify/spotifyAuth.ts
import AsyncStorage from '@react-native-async-storage/async-storage';
import { makeRedirectUri, ResponseType, useAuthRequest } from 'expo-auth-session';
import { useEffect } from 'react';

const CLIENT_ID = '205b7a20d6df461b8d2abe82c6c7a263';
const REDIRECT_URI = makeRedirectUri();
const SCOPES = ['user-read-playback-state', 'user-modify-playback-state', 'streaming'];
const DISCOVERY = {
  authorizationEndpoint: 'https://accounts.spotify.com/authorize',
  tokenEndpoint: 'https://accounts.spotify.com/api/token',
};

export function useSpotifyAuth() {
  const [request, response, promptAsync] = useAuthRequest(
    {
      clientId: CLIENT_ID,
      scopes: SCOPES,
      responseType: ResponseType.Token,
      redirectUri: REDIRECT_URI,
    },
    DISCOVERY
  );

  useEffect(() => {
    if (response?.type === 'success' && response.authentication?.accessToken) {
      AsyncStorage.setItem('spotify_access_token', response.authentication.accessToken);
    }
  }, [response]);

  return { request, promptAsync };
}

