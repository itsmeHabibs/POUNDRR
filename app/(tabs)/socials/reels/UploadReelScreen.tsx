// app/(tabs)/socials/reels/UploadReelScreen.tsx
import React, { useState } from 'react';
import { View, TextInput, TouchableOpacity, Text, Alert } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../../../../firebase';
import styles from './Reelstyles';

export default function UploadReelScreen({ navigation }: any) {
  const [videoUri, setVideoUri] = useState('');
  const [description, setDescription] = useState('');

  const pickVideo = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Videos,
    });
    if (!result.canceled && result.assets[0].uri) {
      setVideoUri(result.assets[0].uri);
    }
  };

  const uploadReel = async () => {
    if (!videoUri) return Alert.alert('Please select a video');

    const response = await fetch(videoUri);
    const blob = await response.blob();

    const fileRef = ref(storage, `reels/${Date.now()}.mp4`);
    await uploadBytes(fileRef, blob);
    const downloadURL = await getDownloadURL(fileRef);

    await addDoc(collection(db, 'reels'), {
      videoUrl: downloadURL,
      description,
      username: 'currentUser', // Replace with actual logged-in user
      likes: 0,
      createdAt: serverTimestamp(),
    });

    Alert.alert('Uploaded!');
    navigation.goBack();
  };

  return (
    <View style={styles.uploadContainer}>
      <TouchableOpacity onPress={pickVideo} style={styles.uploadBtn}>
        <Text style={styles.uploadBtnText}>{videoUri ? 'Change Video' : 'Pick a Video'}</Text>
      </TouchableOpacity>

      <TextInput
        placeholder="Write a caption..."
        value={description}
        onChangeText={setDescription}
        style={{ marginVertical: 20, borderBottomWidth: 1, borderColor: '#ccc' }}
      />

      <TouchableOpacity onPress={uploadReel} style={styles.uploadBtn}>
        <Text style={styles.uploadBtnText}>Upload Reel</Text>
      </TouchableOpacity>
    </View>
  );
}
