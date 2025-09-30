// // File: app/(tabs)/party/PartyTimer.tsx

// import { useEffect, useRef, useState } from 'react';
// import { Pressable, Text, View } from 'react-native';
// import styles from './partyStyles';

// export default function PartyTimer() {
//   const [running, setRunning] = useState(false);
//   const [secondsLeft, setSecondsLeft] = useState(60); // default 1 min timer
// //   const intervalRef = useRef<NodeJS.Timer | null>(null);
//   const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);


//   const toggleRun = () => setRunning((r) => !r);

//   useEffect(() => {
//     if (running) {
//       intervalRef.current = setInterval(() => {
//         setSecondsLeft((s) => (s > 0 ? s - 1 : 0));
//       }, 1000);
//     } else if (intervalRef.current) {
//       clearInterval(intervalRef.current);
//       intervalRef.current = null;
//     }

//     return () => {
//       if (intervalRef.current) clearInterval(intervalRef.current);
//     };
//   }, [running]);

//   const fmtTime = (s: number) => {
//     const m = Math.floor(s / 60);
//     const sec = s % 60;
//     return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
//   };

//   return (
//     <View style={styles.timerCard}>
//       <Text style={styles.timerText}>{fmtTime(secondsLeft)}</Text>
//       <Pressable style={styles.startBtn} onPress={toggleRun}>
//         <Text style={styles.startBtnTxt}>{running ? 'Pause' : 'Start'}</Text>
//       </Pressable>
//     </View>
//   );
// }

/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// import { useCallback, useEffect, useRef, useState } from 'react';
// import { Pressable, Text, View } from 'react-native';
// import styles from './partyStyles';

// export default function PartyTimer() {
//   const [running, setRunning] = useState(false);
//   const [secondsLeft, setSecondsLeft] = useState(60); // default 1 min timer
// //   const intervalRef = useRef<NodeJS.Timer | null>(null);
//   const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

//   const toggleTimer = useCallback(() => {
//     setRunning((r) => !r);
//   }, []);

//   useEffect(() => {
//     if (running) {
//       intervalRef.current = setInterval(() => {
//         setSecondsLeft((s) => (s > 0 ? s - 1 : 0));
//       }, 1000);
//     } else if (intervalRef.current) {
//       clearInterval(intervalRef.current);
//       intervalRef.current = null;
//     }

//     return () => {
//       if (intervalRef.current) clearInterval(intervalRef.current);
//     };
//   }, [running]);

//   const formatTime = (sec: number) => {
//     const m = Math.floor(sec / 60)
//       .toString()
//       .padStart(2, '0');
//     const s = (sec % 60).toString().padStart(2, '0');
//     return `${m}:${s}`;
//   };

//   return (
//     <View style={styles.timerCard}>
//       <Text style={styles.timerText}>{formatTime(secondsLeft)}</Text>
//       <Pressable onPress={toggleTimer} style={styles.timerBtn}>
//         <Text style={styles.timerBtnText}>{running ? 'Pause' : 'Start'}</Text>
//       </Pressable>
//     </View>
//   );
// }






// // File: app/(tabs)/party/PartyTimer.tsx
// import { doc, onSnapshot, updateDoc } from 'firebase/firestore';
// import { useEffect, useRef, useState } from 'react';
// import { Pressable, Text, View } from 'react-native';
// import { db } from '../../firebase';
// import styles from './partyStyles';

// export default function PartyTimer() {
//   const [secondsLeft, setSecondsLeft] = useState(60); // default 1 min
//   const [running, setRunning] = useState(false);
//   const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

//   // Sync with Firestore
//   useEffect(() => {
//     const unsub = onSnapshot(doc(db, 'parties', 'main'), (snap) => {
//       if (snap.exists()) {
//         const data = snap.data();
//         setSecondsLeft(data.timer ?? 60);
//         setRunning(data.running ?? false);
//       }
//     });
//     return unsub;
//   }, []);

//   // Start / Stop Timer
//   const toggleTimer = async () => {
//     const ref = doc(db, 'parties', 'main');
//     await updateDoc(ref, { running: !running });
//   };

//   // Reset Timer
//   const resetTimer = async () => {
//     const ref = doc(db, 'parties', 'main');
//     await updateDoc(ref, { timer: 60, running: false });
//   };

//   // Local countdown effect
//   useEffect(() => {
//     if (running) {
//       intervalRef.current = setInterval(() => {
//         setSecondsLeft((prev) => {
//           if (prev > 0) return prev - 1;
//           clearInterval(intervalRef.current!);
//           return 0;
//         });
//       }, 1000);
//     } else {
//       if (intervalRef.current) clearInterval(intervalRef.current);
//     }
//     return () => {
//       if (intervalRef.current) clearInterval(intervalRef.current);
//     };
//   }, [running]);

//   // Push updates to Firestore when secondsLeft changes
//   useEffect(() => {
//     const ref = doc(db, 'parties', 'main');
//     updateDoc(ref, { timer: secondsLeft }).catch(() => {});
//   }, [secondsLeft]);

//   return (
//     <View style={styles.section}>
//       <Text style={styles.sectionTitle}>Party Timer</Text>
//       <Text style={styles.timerText}>{secondsLeft}s</Text>
//       <View style={styles.buttonRow}>
//         <Pressable style={styles.btn} onPress={toggleTimer}>
//           <Text style={styles.btnTxt}>{running ? 'Pause' : 'Start'}</Text>
//         </Pressable>
//         <Pressable style={styles.btn} onPress={resetTimer}>
//           <Text style={styles.btnTxt}>Reset</Text>
//         </Pressable>
//       </View>
//     </View>
//   );
// }



// // File: app/(tabs)/party/PartyTimer.tsx

// import { useEffect, useState } from "react";
// import { Text, View } from "react-native";
// import styles from "./partyStyles";

// export default function PartyTimer() {
//   const [seconds, setSeconds] = useState(60);

//   useEffect(() => {
//     if (seconds <= 0) return;
//     const interval = setInterval(() => {
//       setSeconds((prev) => prev - 1);
//     }, 1000);
//     return () => clearInterval(interval);
//   }, [seconds]);

//   return (
//     <View style={styles.timerBox}>
//       <Text style={styles.subTitle}>⏱ Party Timer</Text>
//       <Text style={styles.timerText}>{seconds}s</Text>
//     </View>
//   );
// }



// File: app/(tabs)/party/PartyTimer.tsx

import { doc, onSnapshot, serverTimestamp, setDoc } from "firebase/firestore";
import { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { db } from "../../../firebase";
import styles from "./partyStyles";

const PARTY_DOC = doc(db, "partyState", "room1"); // single shared room

export default function PartyTimer() {
  const [seconds, setSeconds] = useState(60);
  const [running, setRunning] = useState(false);

  // 🔄 Subscribe to Firestore updates
  useEffect(() => {
    const unsub = onSnapshot(PARTY_DOC, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();
        setSeconds(data.secondsLeft ?? 60);
        setRunning(data.isRunning ?? false);
      }
    });

    return () => unsub();
  }, []);

  // ⏱ Countdown logic (local only if running)
  useEffect(() => {
    if (!running || seconds <= 0) return;
    const interval = setInterval(() => {
      setSeconds((prev) => prev - 1);
      // update Firestore every second
      setDoc(
        PARTY_DOC,
        { secondsLeft: seconds - 1, isRunning: true, updatedAt: serverTimestamp() },
        { merge: true }
      );
    }, 1000);
    return () => clearInterval(interval);
  }, [running, seconds]);

  // ▶️ Start the timer (host action)
  const startTimer = async () => {
    await setDoc(PARTY_DOC, {
      secondsLeft: 60,
      isRunning: true,
      updatedAt: serverTimestamp(),
    });
  };

  // ⏹ Reset timer (host action)
  const resetTimer = async () => {
    await setDoc(PARTY_DOC, {
      secondsLeft: 60,
      isRunning: false,
      updatedAt: serverTimestamp(),
    });
  };

  return (
    <View style={styles.timerBox}>
      <Text style={styles.subTitle}>⏱ Party Timer</Text>
      <Text style={styles.timerText}>{seconds}s</Text>

      <Pressable style={styles.addBtn} onPress={startTimer}>
        <Text style={styles.addBtnTxt}>▶ Start</Text>
      </Pressable>

      <Pressable style={styles.backBtn} onPress={resetTimer}>
        <Text style={styles.backBtnTxt}>⏹ Reset</Text>
      </Pressable>
    </View>
  );
}
