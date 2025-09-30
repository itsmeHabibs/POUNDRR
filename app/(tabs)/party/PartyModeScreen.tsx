// File: app/(tabs)/party/PartyModeScreen.tsx

import { useNavigation } from "@react-navigation/native";
import {
    addDoc,
    collection,
    onSnapshot,
    query,
    serverTimestamp,
} from "firebase/firestore";
import { useEffect, useState } from "react";
import { Alert, Pressable, Text, View } from "react-native";
// Update the import path below to the correct relative path for your project structure.
// For example, if firebase.ts is in the root directory:
import { db } from "../../../firebase";
import PartyParticipantList from "./PartyParticipantList";
import styles from "./partyStyles";
import PartyTimer from "./PartyTimer";

export default function PartyModeScreen() {
  const navigation = useNavigation();
  const [participants, setParticipants] = useState<string[]>([]);

  // Subscribe to Firestore participants collection
  useEffect(() => {
    const q = query(collection(db, "partyParticipants"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setParticipants(snapshot.docs.map((doc) => doc.data().name as string));
    });

    return () => unsubscribe();
  }, []);

  // Add a new participant
  const addParticipant = async () => {
    try {
      const name = `Guest${participants.length + 1}`;
      await addDoc(collection(db, "partyParticipants"), {
        name,
        joinedAt: serverTimestamp(),
      });
    } catch (error) {
      console.error("Error adding participant:", error);
      Alert.alert("Error", "Could not add participant.");
    }
  };

  return (
    <View style={styles.root}>
      <Text style={styles.title}>🎉 Party Mode</Text>

      {/* Timer */}
      <PartyTimer />

      {/* Participants */}
      <PartyParticipantList participants={participants} />

      {/* Add participant button */}
      <Pressable style={styles.addBtn} onPress={addParticipant}>
        <Text style={styles.addBtnTxt}>+ Add Participant</Text>
      </Pressable>

      {/* Back button */}
      <Pressable style={styles.backBtn} onPress={() => navigation.goBack()}>
        <Text style={styles.backBtnTxt}>← Back to Timer</Text>
      </Pressable>
    </View>
  );
}
