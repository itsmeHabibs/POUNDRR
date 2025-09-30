// // File: app/(tabs)/party/partyStyles.ts

// import { StyleSheet } from 'react-native';

// const styles = StyleSheet.create({
//   root: { flex: 1, backgroundColor: '#0b0b0b', padding: 16, gap: 12 },
//   title: { fontSize: 24, fontWeight: '700', color: '#fff', textAlign: 'center', marginBottom: 16 },
//   timerCard: { backgroundColor: '#1f1f1f', padding: 16, borderRadius: 12, alignItems: 'center' },
//   timerText: { fontSize: 48, color: '#ff3b30', fontWeight: '700', marginBottom: 12 },
//   startBtn: { backgroundColor: '#ff3b30', paddingVertical: 10, paddingHorizontal: 20, borderRadius: 8 },
//   startBtnTxt: { color: '#fff', fontWeight: '700', fontSize: 16 },
//   participantCard: { backgroundColor: '#121212', padding: 12, borderRadius: 12 },
//   participantTitle: { color: '#fff', fontWeight: '700', fontSize: 16, marginBottom: 8 },
//   participantName: { color: '#e0e0e0', fontSize: 14, marginBottom: 4 },
//   addBtn: { backgroundColor: '#0a84ff', padding: 10, borderRadius: 8, alignItems: 'center', marginTop: 12 },
//   addBtnTxt: { color: '#fff', fontWeight: '700' },
//   backBtn: { marginTop: 16, alignItems: 'center' },
//   backBtnTxt: { color: '#fff', textDecorationLine: 'underline' },
// });


// File: app/(tabs)/party/partyStyles.ts

import { StyleSheet } from "react-native";

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#111",
    padding: 20,
  },
  title: {
    fontSize: 26,
    fontWeight: "bold",
    color: "#fff",
    textAlign: "center",
    marginBottom: 20,
  },
  subTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#fff",
    marginBottom: 8,
  },
  participantBox: {
    marginTop: 20,
    backgroundColor: "#222",
    padding: 16,
    borderRadius: 12,
  },
  participantItem: {
    fontSize: 16,
    color: "#eee",
    paddingVertical: 4,
  },
  addBtn: {
    backgroundColor: "#1DB954",
    padding: 14,
    borderRadius: 10,
    marginTop: 20,
  },
  addBtnTxt: {
    color: "#fff",
    fontSize: 16,
    textAlign: "center",
    fontWeight: "600",
  },
  backBtn: {
    backgroundColor: "#333",
    padding: 14,
    borderRadius: 10,
    marginTop: 12,
  },
  backBtnTxt: {
    color: "#ccc",
    fontSize: 16,
    textAlign: "center",
  },
  timerBox: {
    backgroundColor: "#222",
    padding: 16,
    borderRadius: 12,
  },
  timerText: {
    fontSize: 32,
    fontWeight: "bold",
    color: "#1DB954",
    textAlign: "center",
  },
});

export default styles;
