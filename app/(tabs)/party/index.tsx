// // File: app/(tabs)/party/index.tsx

// import { useRouter } from 'expo-router';
// import React, { useState } from 'react';
// import { Pressable, StyleSheet, Text, View } from 'react-native';

// export default function PartyScreen(): React.ReactElement {
//   const router = useRouter();
//   const [participants, setParticipants] = useState<string[]>(['Alice', 'Bob', 'Charlie']);

//   return (
//     <View style={styles.root}>
//       <Text style={styles.title}>🎉 Party Mode</Text>

//       {/* Participants List */}
//       <View style={styles.card}>
//         <Text style={styles.subtitle}>Participants</Text>
//         {participants.map((p, idx) => (
//           <Text key={idx} style={styles.participant}>
//             {idx + 1}. {p}
//           </Text>
//         ))}
//       </View>

//       {/* Add Participant Button */}
//       <Pressable
//         onPress={() => setParticipants((prev) => [...prev, `Guest${prev.length + 1}`])}
//         style={({ pressed }) => [styles.btn, pressed && { opacity: 0.8 }]}
//       >
//         <Text style={styles.btnText}>Add Participant</Text>
//       </Pressable>

//       {/* Back Button */}
//       <Pressable
//         onPress={() => router.back()}
//         style={({ pressed }) => [styles.btn, { marginTop: 12 }, pressed && { opacity: 0.8 }]}
//       >
//         <Text style={styles.btnText}>Back to Timer</Text>
//       </Pressable>
//     </View>
//   );
// }

// const styles = StyleSheet.create({
//   root: { flex: 1, padding: 16, backgroundColor: '#0b0b0b' },
//   title: { fontSize: 28, fontWeight: '700', color: '#fff', marginBottom: 24, textAlign: 'center' },
//   card: { backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 12, padding: 16, marginBottom: 16 },
//   subtitle: { fontSize: 20, fontWeight: '600', color: '#fff', marginBottom: 8 },
//   participant: { fontSize: 16, color: '#fff', marginVertical: 2 },
//   btn: { paddingVertical: 12, paddingHorizontal: 16, backgroundColor: '#f70000', borderRadius: 8, alignItems: 'center' },
//   btnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
// });







// File: app/(tabs)/party/index.tsx

import PartyModeScreen from "./PartyModeScreen";

export default function PartyIndex() {
  return <PartyModeScreen />;
}
