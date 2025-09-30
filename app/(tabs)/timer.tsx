// // File: app/(tabs)/timer.tsx
// // Rules followed:
// // - No top-level imports from 'firebase/auth' (not used).
// // - Default export a React component; TS strict-friendly.
// // - No hooks at module scope. Uses RN-only APIs (no extra deps).
// // - Fixed TS error: use `ReturnType<typeof setInterval>` instead of NodeJS.Timer.

// import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
// import {
//   AppState,
//   AppStateStatus,
//   Pressable,
//   StyleSheet,
//   Text,
//   Vibration,
//   View,
// } from 'react-native';

// type Phase = 'idle' | 'work' | 'rest' | 'done';

// type Settings = {
//   roundsTotal: number;
//   roundLengthSec: number; // work
//   restLengthSec: number;
// };

// type TimerState = {
//   phase: Phase;
//   currentRound: number; // 1-based
//   remaining: number; // seconds remaining in current phase
// };

// const RED = '#f70000';
// const CARD_BG = 'rgba(0,0,0,0.82)';
// const BORDER = 'rgba(255,255,255,0.12)';
// const MUTED = '#9ca3af';
// const TEXT = '#fff';

// function clamp(n: number, min: number, max: number): number {
//   return Math.max(min, Math.min(max, n));
// }
// function fmtTime(totalSeconds: number): string {
//   const s = Math.max(0, Math.floor(totalSeconds));
//   const m = Math.floor(s / 60);
//   const r = s % 60;
//   const mm = String(m).padStart(2, '0');
//   const ss = String(r).padStart(2, '0');
//   return `${mm}:${ss}`;
// }

// export default function FightTimerScreen(): React.ReactElement {
//   // Settings (editable)
//   const [settings, setSettings] = useState<Settings>({
//     roundsTotal: 3,
//     roundLengthSec: 3 * 60,
//     restLengthSec: 60,
//   });

//   // Runtime
//   const [state, setState] = useState<TimerState>({
//     phase: 'idle',
//     currentRound: 1,
//     remaining: settings.roundLengthSec,
//   });
//   const [running, setRunning] = useState<boolean>(false);

//   // Drive a 1s ticking interval with drift correction
//   const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
//   const lastTickRef = useRef<number | null>(null);

//   // Pause on background to avoid weirdness
//   useEffect(() => {
//     const onChange = (s: AppStateStatus) => {
//       if (s !== 'active' && running) {
//         setRunning(false);
//       }
//     };
//     const sub = AppState.addEventListener('change', onChange);
//     return () => sub.remove();
//   }, [running]);

//   const totalForPhase = useMemo(() => {
//     if (state.phase === 'work') return settings.roundLengthSec;
//     if (state.phase === 'rest') return settings.restLengthSec;
//     return state.remaining;
//   }, [state.phase, state.remaining, settings.roundLengthSec, settings.restLengthSec]);

//   const progress = useMemo(() => {
//     if (totalForPhase <= 0) return 0;
//     return 1 - clamp(state.remaining / totalForPhase, 0, 1);
//   }, [state.remaining, totalForPhase]);

//   const vibrate = useCallback((pattern: 'short' | 'phase' | 'done') => {
//     if (pattern === 'short') Vibration.vibrate(50);
//     if (pattern === 'phase') Vibration.vibrate([0, 180, 80, 180]);
//     if (pattern === 'done') Vibration.vibrate([0, 220, 120, 220, 120, 220]);
//   }, []);

//   const startFromIdle = useCallback(() => {
//     setState({
//       phase: 'work',
//       currentRound: 1,
//       remaining: settings.roundLengthSec,
//     });
//     setRunning(true);
//     vibrate('phase');
//   }, [settings.roundLengthSec, vibrate]);

//   const nextPhase = useCallback((prev: TimerState): TimerState => {
//     // Called when remaining hits 0
//     if (prev.phase === 'work') {
//       // Finished a work round
//       if (prev.currentRound >= settings.roundsTotal) {
//         // Fight finished
//         vibrate('done');
//         return { phase: 'done', currentRound: prev.currentRound, remaining: 0 };
//       }
//       // Go to rest (if rest is zero, fast-forward)
//       if (settings.restLengthSec > 0) {
//         vibrate('phase');
//         return { phase: 'rest', currentRound: prev.currentRound, remaining: settings.restLengthSec };
//       }
//       // No rest — straight to next round
//       vibrate('phase');
//       return {
//         phase: 'work',
//         currentRound: prev.currentRound + 1,
//         remaining: settings.roundLengthSec,
//       };
//     }
//     if (prev.phase === 'rest') {
//       // Start next work round
//       vibrate('phase');
//       return {
//         phase: 'work',
//         currentRound: prev.currentRound + 1,
//         remaining: settings.roundLengthSec,
//       };
//     }
//     return prev;
//   }, [settings.roundsTotal, settings.roundLengthSec, settings.restLengthSec, vibrate]);

//   const tick = useCallback(() => {
//     setState((s) => {
//       if (s.phase === 'idle' || s.phase === 'done') return s;
//       const now = Date.now();
//       const last = lastTickRef.current ?? now;
//       lastTickRef.current = now;
//       const delta = Math.max(0, Math.round((now - last) / 1000)); // seconds elapsed (rounded)
//       const nextRemaining = s.remaining - (delta || 1);
//       if (nextRemaining <= 0) {
//         return nextPhase({ ...s, remaining: 0 });
//       }
//       return { ...s, remaining: nextRemaining };
//     });
//   }, [nextPhase]);

//   // Start/stop interval
//   useEffect(() => {
//     if (!running) {
//       if (intervalRef.current) {
//         clearInterval(intervalRef.current);
//         intervalRef.current = null;
//       }
//       lastTickRef.current = null;
//       return;
//     }
//     lastTickRef.current = Date.now();
//     intervalRef.current = setInterval(tick, 1000);
//     return () => {
//       if (intervalRef.current) clearInterval(intervalRef.current);
//       intervalRef.current = null;
//     };
//   }, [running, tick]);

//   // When settings change while idle/done, reset the display
//   useEffect(() => {
//     if (state.phase === 'idle' || state.phase === 'done') {
//       setState((s) => ({
//         ...s,
//         remaining: s.phase === 'idle' ? settings.roundLengthSec : 0,
//       }));
//     }
//     // eslint-disable-next-line react-hooks/exhaustive-deps
//   }, [settings.roundLengthSec, settings.restLengthSec, settings.roundsTotal]);

//   const toggleRun = useCallback(() => {
//     if (state.phase === 'idle') {
//       startFromIdle();
//       return;
//     }
//     if (state.phase === 'done') {
//       // restart flow
//       setState({
//         phase: 'work',
//         currentRound: 1,
//         remaining: settings.roundLengthSec,
//       });
//       setRunning(true);
//       vibrate('phase');
//       return;
//     }
//     setRunning((r) => !r);
//     vibrate('short');
//   }, [state.phase, settings.roundLengthSec, startFromIdle, vibrate]);

//   const resetAll = useCallback(() => {
//     setRunning(false);
//     setState({
//       phase: 'idle',
//       currentRound: 1,
//       remaining: settings.roundLengthSec,
//     });
//     vibrate('short');
//   }, [settings.roundLengthSec, vibrate]);

//   const quickPreset = useCallback((preset: 'boxing' | 'mma' | 'short') => {
//     if (preset === 'boxing') {
//       setSettings({ roundsTotal: 3, roundLengthSec: 3 * 60, restLengthSec: 60 });
//     } else if (preset === 'mma') {
//       setSettings({ roundsTotal: 5, roundLengthSec: 5 * 60, restLengthSec: 60 });
//     } else {
//       setSettings({ roundsTotal: 3, roundLengthSec: 60, restLengthSec: 20 });
//     }
//     setRunning(false);
//     setState({ phase: 'idle', currentRound: 1, remaining: (preset === 'mma' ? 5 : preset === 'boxing' ? 3 : 1) * 60 });
//   }, []);

//   const inc = useCallback((key: keyof Settings, step: number) => {
//     setSettings((s) => {
//       if (key === 'roundsTotal') {
//         const v = clamp(s.roundsTotal + step, 1, 12);
//         return { ...s, roundsTotal: v };
//       }
//       if (key === 'roundLengthSec') {
//         const v = clamp(s.roundLengthSec + step, 10, 20 * 60);
//         return { ...s, roundLengthSec: v };
//       }
//       if (key === 'restLengthSec') {
//         const v = clamp(s.restLengthSec + step, 0, 10 * 60);
//         return { ...s, restLengthSec: v };
//       }
//       return s;
//     });
//   }, []);

//   const phaseLabel = state.phase === 'work' ? 'ROUND' : state.phase === 'rest' ? 'REST' : state.phase === 'done' ? 'DONE' : 'READY';

//   return (
//     <View style={styles.root}>
//       {/* Title */}
//       <Text style={styles.screenTitle}>Timer</Text>

//       {/* Big timer card */}
//       <View style={styles.timerCard}>
//         {/* Progress */}
//         <View style={styles.progressTrack}>
//           <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
//         </View>

//         <View style={styles.timeCenter}>
//           <Text style={[styles.phase, state.phase === 'work' ? styles.badgeWork : state.phase === 'rest' ? styles.badgeRest : styles.badgeIdle]}>
//             {phaseLabel}
//           </Text>

//           <Text style={styles.timeText}>{fmtTime(state.remaining)}</Text>

//           <Text style={styles.roundText}>
//             {state.phase === 'done' ? `Completed ${settings.roundsTotal} / ${settings.roundsTotal}` : `Round ${state.currentRound} / ${settings.roundsTotal}`}
//           </Text>
//         </View>

//         {/* Controls */}
//         <View style={styles.controls}>
//           <Pressable
//             onPress={toggleRun}
//             style={({ pressed }) => [styles.primaryBtn, (pressed || running) && { opacity: 0.95 }]}
//           >
//             <Text style={styles.primaryBtnTxt}>
//               {state.phase === 'idle' ? 'Start' : running ? 'Pause' : state.phase === 'done' ? 'Restart' : 'Resume'}
//             </Text>
//           </Pressable>

//           <Pressable
//             onPress={resetAll}
//             style={({ pressed }) => [styles.btn, pressed && { opacity: 0.95 }]}
//           >
//             <Text style={styles.btnTxt}>Reset</Text>
//           </Pressable>
//         </View>
//       </View>

//       {/* Settings */}
//       <View style={styles.card}>
//         <Text style={styles.sectionHeader}>Settings</Text>

//         <RowControl
//           label="Rounds"
//           value={String(settings.roundsTotal)}
//           onDec={() => inc('roundsTotal', -1)}
//           onInc={() => inc('roundsTotal', +1)}
//         />
//         <RowControl
//           label="Round length"
//           value={`${Math.floor(settings.roundLengthSec / 60)}:${String(settings.roundLengthSec % 60).padStart(2, '0')}`}
//           onDec={() => inc('roundLengthSec', -10)}
//           onInc={() => inc('roundLengthSec', +10)}
//           hint="±10s"
//         />
//         <RowControl
//           label="Rest length"
//           value={`${Math.floor(settings.restLengthSec / 60)}:${String(settings.restLengthSec % 60).padStart(2, '0')}`}
//           onDec={() => inc('restLengthSec', -5)}
//           onInc={() => inc('restLengthSec', +5)}
//           hint="±5s"
//         />

//         {/* Presets */}
//         <View style={styles.presetRow}>
//           <Pressable onPress={() => quickPreset('boxing')} style={({ pressed }) => [styles.pill, pressed && { opacity: 0.95 }]}>
//             <Text style={styles.pillTxt}>🥊 Boxing 3×3:1</Text>
//           </Pressable>
//           <Pressable onPress={() => quickPreset('mma')} style={({ pressed }) => [styles.pill, pressed && { opacity: 0.95 }]}>
//             <Text style={styles.pillTxt}>🥋 MMA 5×5:1</Text>
//           </Pressable>
//           <Pressable onPress={() => quickPreset('short')} style={({ pressed }) => [styles.pill, pressed && { opacity: 0.95 }]}>
//             <Text style={styles.pillTxt}>⚡ Short 3×1:0.20</Text>
//           </Pressable>
//         </View>

//         <Text style={styles.hint}>
//           Timer pauses when the app goes to background. Vibration confirms phase changes.
//         </Text>
//       </View>
//     </View>
//   );
// }

// /* ---------------- small components ---------------- */

// function RowControl({
//   label,
//   value,
//   hint,
//   onDec,
//   onInc,
// }: {
//   label: string;
//   value: string;
//   hint?: string;
//   onDec: () => void;
//   onInc: () => void;
// }): React.ReactElement {
//   return (
//     <View style={styles.row}>
//       <Text style={styles.rowLabel}>{label}</Text>
//       <View style={styles.rowRight}>
//         {!!hint && <Text style={styles.hintSmall}>{hint}</Text>}
//         <Pressable onPress={onDec} style={({ pressed }) => [styles.squareBtn, pressed && { opacity: 0.9 }]}>
//           <Text style={styles.squareTxt}>−</Text>
//         </Pressable>
//         <Text style={styles.rowValue}>{value}</Text>
//         <Pressable onPress={onInc} style={({ pressed }) => [styles.squareBtn, pressed && { opacity: 0.9 }]}>
//           <Text style={styles.squareTxt}>+</Text>
//         </Pressable>
//       </View>
//     </View>
//   );
// }

// /* ---------------- styles ---------------- */

// const styles = StyleSheet.create({
//   root: {
//     flex: 1,
//     backgroundColor: 'black',
//     padding: 14,
//     gap: 12,
//   },
//   screenTitle: {
//     fontFamily: 'Inter_700Bold',
//     color: TEXT,
//     fontSize: 22,
//     letterSpacing: 0.5,
//     marginBottom: 2,
//   },

//   timerCard: {
//     backgroundColor: CARD_BG,
//     borderRadius: 14,
//     borderTopWidth: 3,
//     borderTopColor: RED,
//     padding: 12,
//     gap: 12,
//   },
//   progressTrack: {
//     height: 8,
//     borderRadius: 999,
//     backgroundColor: 'rgba(255,255,255,0.08)',
//     overflow: 'hidden',
//   },
//   progressFill: {
//     height: '100%',
//     backgroundColor: RED,
//   },
//   timeCenter: {
//     alignItems: 'center',
//     gap: 6,
//   },
//   phase: {
//     paddingHorizontal: 10,
//     paddingVertical: 4,
//     borderRadius: 999,
//     borderWidth: 1,
//     borderColor: BORDER,
//     fontFamily: 'Inter_700Bold',
//     color: TEXT,
//     fontSize: 12,
//     letterSpacing: 1,
//   },
//   badgeWork: { backgroundColor: 'rgba(247,0,0,0.10)' },
//   badgeRest: { backgroundColor: 'rgba(59,130,246,0.12)', borderColor: 'rgba(59,130,246,0.35)' },
//   badgeIdle: { backgroundColor: 'rgba(255,255,255,0.08)' },

//   timeText: {
//     fontFamily: 'Inter_700Bold',
//     color: TEXT,
//     fontSize: 48,
//     letterSpacing: 1,
//   },
//   roundText: {
//     fontFamily: 'Inter_400Regular',
//     color: MUTED,
//     fontSize: 12,
//   },

//   controls: {
//     flexDirection: 'row',
//     gap: 10,
//     alignSelf: 'center',
//   },
//   primaryBtn: {
//     backgroundColor: RED,
//     paddingVertical: 12,
//     paddingHorizontal: 16,
//     borderRadius: 10,
//     alignItems: 'center',
//     minWidth: 140,
//   },
//   primaryBtnTxt: {
//     fontFamily: 'Inter_700Bold',
//     color: TEXT,
//     fontSize: 16,
//     letterSpacing: 0.5,
//   },
//   btn: {
//     paddingVertical: 12,
//     paddingHorizontal: 16,
//     borderRadius: 10,
//     alignItems: 'center',
//     borderWidth: 1,
//     borderColor: BORDER,
//     minWidth: 100,
//   },
//   btnTxt: {
//     fontFamily: 'Inter_700Bold',
//     color: '#e5e7eb',
//     fontSize: 14,
//   },

//   card: {
//     backgroundColor: CARD_BG,
//     borderRadius: 14,
//     borderTopWidth: 3,
//     borderTopColor: RED,
//     padding: 12,
//     gap: 10,
//   },
//   sectionHeader: {
//     fontFamily: 'Inter_700Bold',
//     color: TEXT,
//     fontSize: 16,
//   },

//   row: {
//     flexDirection: 'row',
//     alignItems: 'center',
//     gap: 12,
//     justifyContent: 'space-between',
//   },
//   rowLabel: {
//     fontFamily: 'Inter_600SemiBold',
//     color: TEXT,
//     fontSize: 14,
//   },
//   rowRight: {
//     flexDirection: 'row',
//     alignItems: 'center',
//     gap: 8,
//   },
//   rowValue: {
//     minWidth: 66,
//     textAlign: 'center',
//     fontFamily: 'Inter_700Bold',
//     color: TEXT,
//     fontSize: 14,
//   },
//   squareBtn: {
//     width: 38,
//     height: 38,
//     borderRadius: 10,
//     borderWidth: 1,
//     borderColor: BORDER,
//     alignItems: 'center',
//     justifyContent: 'center',
//     backgroundColor: 'rgba(0,0,0,0.25)',
//   },
//   squareTxt: {
//     fontFamily: 'Inter_700Bold',
//     color: TEXT,
//     fontSize: 18,
//     lineHeight: 18,
//   },

//   presetRow: {
//     flexDirection: 'row',
//     gap: 8,
//     flexWrap: 'wrap',
//   },
//   pill: {
//     paddingVertical: 8,
//     paddingHorizontal: 12,
//     borderRadius: 999,
//     borderWidth: 1,
//     borderColor: BORDER,
//     backgroundColor: 'rgba(0,0,0,0.25)',
//   },
//   pillTxt: {
//     fontFamily: 'Inter_600SemiBold',
//     color: TEXT,
//     fontSize: 12,
//   },

//   hint: {
//     fontFamily: 'Inter_400Regular',
//     color: MUTED,
//     fontSize: 12,
//   },
//   hintSmall: {
//     fontFamily: 'Inter_400Regular',
//     color: MUTED,
//     fontSize: 11,
//     marginRight: 2,
//   },
// });

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

// File: app/(tabs)/timer.tsx

// import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
// import {
//   AppState,
//   AppStateStatus,
//   Pressable,
//   StyleSheet,
//   Text,
//   Vibration,
//   View,
// } from 'react-native';
// import { SpotifyButton } from './spotify/SpotifyButton';


// type Phase = 'idle' | 'work' | 'rest' | 'done';

// type Settings = {
//   roundsTotal: number;
//   roundLengthSec: number;
//   restLengthSec: number;
// };

// type TimerState = {
//   phase: Phase;
//   currentRound: number;
//   remaining: number;
// };

// const RED = '#f70000';
// const CARD_BG = 'rgba(0,0,0,0.82)';
// const BORDER = 'rgba(255,255,255,0.12)';
// const MUTED = '#9ca3af';
// const TEXT = '#fff';

// function clamp(n: number, min: number, max: number): number {
//   return Math.max(min, Math.min(max, n));
// }

// function fmtTime(totalSeconds: number): string {
//   const s = Math.max(0, Math.floor(totalSeconds));
//   const m = Math.floor(s / 60);
//   const r = s % 60;
//   const mm = String(m).padStart(2, '0');
//   const ss = String(r).padStart(2, '0');
//   return `${mm}:${ss}`;
// }

// export default function FightTimerScreen(): React.ReactElement {
//   // Settings
//   const [settings, setSettings] = useState<Settings>({
//     roundsTotal: 3,
//     roundLengthSec: 3 * 60,
//     restLengthSec: 60,
//   });

//   // Timer state
//   const [state, setState] = useState<TimerState>({
//     phase: 'idle',
//     currentRound: 1,
//     remaining: settings.roundLengthSec,
//   });
//   const [running, setRunning] = useState<boolean>(false);

//   // Spotify mock state
//   // const [currentTrack, setCurrentTrack] = useState({
//   //   name: 'Mock Track',
//   //   artist: 'Mock Artist',
//   //   playing: false,
//   // });

//   // Refs
//   const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
//   const lastTickRef = useRef<number | null>(null);

//   /** ---------------- TIMER LOGIC ---------------- */

//   useEffect(() => {
//     const onChange = (s: AppStateStatus) => {
//       if (s !== 'active' && running) {
//         setRunning(false);
//       }
//     };
//     const sub = AppState.addEventListener('change', onChange);
//     return () => sub.remove();
//   }, [running]);

//   const totalForPhase = useMemo(() => {
//     if (state.phase === 'work') return settings.roundLengthSec;
//     if (state.phase === 'rest') return settings.restLengthSec;
//     return state.remaining;
//   }, [state.phase, state.remaining, settings.roundLengthSec, settings.restLengthSec]);

//   const progress = useMemo(() => {
//     if (totalForPhase <= 0) return 0;
//     return 1 - clamp(state.remaining / totalForPhase, 0, 1);
//   }, [state.remaining, totalForPhase]);

//   const vibrate = useCallback((pattern: 'short' | 'phase' | 'done') => {
//     if (pattern === 'short') Vibration.vibrate(50);
//     if (pattern === 'phase') Vibration.vibrate([0, 180, 80, 180]);
//     if (pattern === 'done') Vibration.vibrate([0, 220, 120, 220, 120, 220]);
//   }, []);

//   const startFromIdle = useCallback(() => {
//     setState({
//       phase: 'work',
//       currentRound: 1,
//       remaining: settings.roundLengthSec,
//     });
//     setRunning(true);
//     vibrate('phase');
//   }, [settings.roundLengthSec, vibrate]);

//   const nextPhase = useCallback((prev: TimerState): TimerState => {
//     if (prev.phase === 'work') {
//       if (prev.currentRound >= settings.roundsTotal) {
//         vibrate('done');
//         return { phase: 'done', currentRound: prev.currentRound, remaining: 0 };
//       }
//       if (settings.restLengthSec > 0) {
//         vibrate('phase');
//         return { phase: 'rest', currentRound: prev.currentRound, remaining: settings.restLengthSec };
//       }
//       vibrate('phase');
//       return {
//         phase: 'work',
//         currentRound: prev.currentRound + 1,
//         remaining: settings.roundLengthSec,
//       };
//     }
//     if (prev.phase === 'rest') {
//       vibrate('phase');
//       return {
//         phase: 'work',
//         currentRound: prev.currentRound + 1,
//         remaining: settings.roundLengthSec,
//       };
//     }
//     return prev;
//   }, [settings.roundLengthSec, settings.restLengthSec, settings.roundsTotal, vibrate]);

//   const tick = useCallback(() => {
//     setState((s) => {
//       if (s.phase === 'idle' || s.phase === 'done') return s;
//       const now = Date.now();
//       const last = lastTickRef.current ?? now;
//       lastTickRef.current = now;
//       const delta = Math.max(0, Math.round((now - last) / 1000));
//       const nextRemaining = s.remaining - (delta || 1);
//       if (nextRemaining <= 0) return nextPhase({ ...s, remaining: 0 });
//       return { ...s, remaining: nextRemaining };
//     });
//   }, [nextPhase]);

//   useEffect(() => {
//     if (!running) {
//       if (intervalRef.current) clearInterval(intervalRef.current);
//       intervalRef.current = null;
//       lastTickRef.current = null;
//       return;
//     }
//     lastTickRef.current = Date.now();
//     intervalRef.current = setInterval(tick, 1000);
//     return () => {
//       if (intervalRef.current) clearInterval(intervalRef.current);
//       intervalRef.current = null;
//     };
//   }, [running, tick]);

//   useEffect(() => {
//     if (state.phase === 'idle' || state.phase === 'done') {
//       setState((s) => ({
//         ...s,
//         remaining: s.phase === 'idle' ? settings.roundLengthSec : 0,
//       }));
//     }
//   }, [settings.roundLengthSec, settings.restLengthSec, settings.roundsTotal]);

//   const toggleRun = useCallback(() => {
//     if (state.phase === 'idle') {
//       startFromIdle();
//       return;
//     }
//     if (state.phase === 'done') {
//       setState({ phase: 'work', currentRound: 1, remaining: settings.roundLengthSec });
//       setRunning(true);
//       vibrate('phase');
//       return;
//     }
//     setRunning((r) => !r);
//     vibrate('short');
//   }, [state.phase, startFromIdle, settings.roundLengthSec, vibrate]);

//   const resetAll = useCallback(() => {
//     setRunning(false);
//     setState({ phase: 'idle', currentRound: 1, remaining: settings.roundLengthSec });
//     vibrate('short');
//   }, [settings.roundLengthSec, vibrate]);

//   const quickPreset = useCallback((preset: 'boxing' | 'mma' | 'short') => {
//     if (preset === 'boxing') {
//       setSettings({ roundsTotal: 3, roundLengthSec: 3 * 60, restLengthSec: 60 });
//     } else if (preset === 'mma') {
//       setSettings({ roundsTotal: 5, roundLengthSec: 5 * 60, restLengthSec: 60 });
//     } else {
//       setSettings({ roundsTotal: 3, roundLengthSec: 60, restLengthSec: 20 });
//     }
//     setRunning(false);
//     setState({
//       phase: 'idle',
//       currentRound: 1,
//       remaining: (preset === 'mma' ? 5 : preset === 'boxing' ? 3 : 1) * 60,
//     });
//   }, []);

//   const inc = useCallback((key: keyof Settings, step: number) => {
//     setSettings((s) => {
//       if (key === 'roundsTotal') return { ...s, roundsTotal: clamp(s.roundsTotal + step, 1, 12) };
//       if (key === 'roundLengthSec') return { ...s, roundLengthSec: clamp(s.roundLengthSec + step, 10, 20 * 60) };
//       if (key === 'restLengthSec') return { ...s, restLengthSec: clamp(s.restLengthSec + step, 0, 10 * 60) };
//       return s;
//     });
//   }, []);

//   /** ---------------- MOCK SPOTIFY LOGIC ---------------- */

//   // useEffect(() => {
//   //   const unsub = onSnapshot(doc(db, 'rooms', 'fight1'), (snap) => {
//   //     if (snap.exists()) setCurrentTrack(snap.data() as any);
//   //   });
//   //   return () => unsub();
//   // }, []);

//   const phaseLabel = state.phase === 'work' ? 'ROUND' : state.phase === 'rest' ? 'REST' : state.phase === 'done' ? 'DONE' : 'READY';

//   /** ---------------- RENDER ---------------- */

//   return (
//     <View style={styles.root}>
//       <Text style={styles.screenTitle}>Timer</Text>

//       {/* Timer Card */}
//       <View style={styles.timerCard}>
//         <View style={styles.progressTrack}>
//           <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
//         </View>

//         <View style={styles.timeCenter}>
//           <Text style={[styles.phase, state.phase === 'work' ? styles.badgeWork : state.phase === 'rest' ? styles.badgeRest : styles.badgeIdle]}>
//             {phaseLabel}
//           </Text>
//           <Text style={styles.timeText}>{fmtTime(state.remaining)}</Text>
//           <Text style={styles.roundText}>
//             {state.phase === 'done'
//               ? `Completed ${settings.roundsTotal} / ${settings.roundsTotal}`
//               : `Round ${state.currentRound} / ${settings.roundsTotal}`}
//           </Text>
//         </View>

//         <View style={styles.controls}>
//           <Pressable onPress={toggleRun} style={({ pressed }) => [styles.primaryBtn, (pressed || running) && { opacity: 0.95 }]}>
//             <Text style={styles.primaryBtnTxt}>
//               {state.phase === 'idle' ? 'Start' : running ? 'Pause' : state.phase === 'done' ? 'Restart' : 'Resume'}
//             </Text>
//           </Pressable>
//           <Pressable onPress={resetAll} style={({ pressed }) => [styles.btn, pressed && { opacity: 0.95 }]}>
//             <Text style={styles.btnTxt}>Reset</Text>
//           </Pressable>
//         </View>
//       </View>

//       {/* Settings */}
//       <View style={styles.card}>
//         <Text style={styles.sectionHeader}>Settings</Text>

//         <RowControl label="Rounds" value={String(settings.roundsTotal)} onDec={() => inc('roundsTotal', -1)} onInc={() => inc('roundsTotal', 1)} />
//         <RowControl
//           label="Round length"
//           value={`${Math.floor(settings.roundLengthSec / 60)}:${String(settings.roundLengthSec % 60).padStart(2, '0')}`}
//           onDec={() => inc('roundLengthSec', -10)}
//           onInc={() => inc('roundLengthSec', 10)}
//           hint="±10s"
//         />
//         <RowControl
//           label="Rest length"
//           value={`${Math.floor(settings.restLengthSec / 60)}:${String(settings.restLengthSec % 60).padStart(2, '0')}`}
//           onDec={() => inc('restLengthSec', -5)}
//           onInc={() => inc('restLengthSec', 5)}
//           hint="±5s"
//         />

//         <View style={styles.presetRow}>
//           <Pressable onPress={() => quickPreset('boxing')} style={({ pressed }) => [styles.pill, pressed && { opacity: 0.95 }]}>
//             <Text style={styles.pillTxt}>🥊 Boxing 3×3:1</Text>
//           </Pressable>
//           <Pressable onPress={() => quickPreset('mma')} style={({ pressed }) => [styles.pill, pressed && { opacity: 0.95 }]}>
//             <Text style={styles.pillTxt}>🥋 MMA 5×5:1</Text>
//           </Pressable>
//           <Pressable onPress={() => quickPreset('short')} style={({ pressed }) => [styles.pill, pressed && { opacity: 0.95 }]}>
//             <Text style={styles.pillTxt}>⚡ Short 3×1:0.20</Text>
//           </Pressable>
//         </View>

//         <Text style={styles.hint}>Timer pauses when the app goes to background. Vibration confirms phase changes.</Text>
//       </View>

//       {/* MOCK SPOTIFY PLAYER */}
//       {/* <View style={styles.spotifyCard}>
//         <Text style={styles.sectionHeader}>🎵 Spotify</Text>
//         <Text style={styles.trackName}>{currentTrack.name}</Text>
//         <Text style={styles.trackArtist}>{currentTrack.artist}</Text>
//         <View style={styles.spotifyControls}>
//           <Pressable
//           onPress={() => {
//             setCurrentTrack((t) => {
//               const newState = { ...t, playing: !t.playing };
//               setDoc(doc(db, 'rooms', 'fight1'), newState);
//               return newState;
//             });
//           }}
//           style={({ pressed }) => [
//             styles.spotifyBtn,
//             pressed && { opacity: 0.8 },
//           ]}
//           >
//             <Text style={styles.spotifyBtnTxt}>
//               {currentTrack.playing ? 'Pause' : 'Play'}
//               </Text>
//           </Pressable>
//         </View>
//       </View> */}
//       {/* REAL SPOTIFY PLAYER */}
//       <View style={styles.spotifyCard}>
//         <Text style={styles.sectionHeader}>🎵 Spotify</Text>
//         <SpotifyButton />
//       </View>

//     </View>
//   );
// }

// /** ---------------- RowControl ---------------- */

// function RowControl({ label, value, hint, onDec, onInc }: { label: string; value: string; hint?: string; onDec: () => void; onInc: () => void; }) {
//   return (
//     <View style={styles.row}>
//       <Text style={styles.rowLabel}>{label}</Text>
//       <View style={styles.rowRight}>
//         {!!hint && <Text style={styles.hintSmall}>{hint}</Text>}
//         <Pressable onPress={onDec} style={({ pressed }) => [styles.squareBtn, pressed && { opacity: 0.9 }]}>
//           <Text style={styles.squareTxt}>−</Text>
//         </Pressable>
//         <Text style={styles.rowValue}>{value}</Text>
//         <Pressable onPress={onInc} style={({ pressed }) => [styles.squareBtn, pressed && { opacity: 0.9 }]}>
//           <Text style={styles.squareTxt}>+</Text>
//         </Pressable>
//       </View>
//     </View>
//   );
// }

// /** ---------------- STYLES ---------------- */

// const styles = StyleSheet.create({
//   root: { flex: 1, backgroundColor: 'black', padding: 14, gap: 12 },
//   screenTitle: { fontFamily: 'Inter_700Bold', color: TEXT, fontSize: 22, letterSpacing: 0.5, marginBottom: 2 },

//   timerCard: { backgroundColor: CARD_BG, borderRadius: 14, borderTopWidth: 3, borderTopColor: RED, padding: 12, gap: 12 },
//   progressTrack: { height: 8, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.08)', overflow: 'hidden' },
//   progressFill: { height: '100%', backgroundColor: RED },
//   timeCenter: { alignItems: 'center', gap: 6 },
//   phase: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, borderWidth: 1, borderColor: BORDER, fontFamily: 'Inter_700Bold', color: TEXT, fontSize: 12, letterSpacing: 1 },
//   badgeWork: { backgroundColor: 'rgba(247,0,0,0.10)' },
//   badgeRest: { backgroundColor: 'rgba(59,130,246,0.12)', borderColor: 'rgba(59,130,246,0.35)' },
//   badgeIdle: { backgroundColor: 'rgba(255,255,255,0.08)' },

//   timeText: { fontFamily: 'Inter_700Bold', color: TEXT, fontSize: 48, letterSpacing: 1 },
//   roundText: { fontFamily: 'Inter_400Regular', color: MUTED, fontSize: 12 },

//   controls: { flexDirection: 'row', gap: 10, alignSelf: 'center' },
//   primaryBtn: { backgroundColor: RED, paddingVertical: 12, paddingHorizontal: 16, borderRadius: 10, alignItems: 'center', minWidth: 140 },
//   primaryBtnTxt: { fontFamily: 'Inter_700Bold', color: TEXT, fontSize: 16, letterSpacing: 0.5 },
//   btn: { paddingVertical: 12, paddingHorizontal: 16, borderRadius: 10, alignItems: 'center', borderWidth: 1, borderColor: BORDER, minWidth: 100 },
//   btnTxt: { fontFamily: 'Inter_700Bold', color: '#e5e7eb', fontSize: 14 },

//   card: { backgroundColor: CARD_BG, borderRadius: 14, borderTopWidth: 3, borderTopColor: RED, padding: 12, gap: 10 },
//   sectionHeader: { fontFamily: 'Inter_700Bold', color: TEXT, fontSize: 16 },

//   row: { flexDirection: 'row', alignItems: 'center', gap: 12, justifyContent: 'space-between' },
//   rowLabel: { fontFamily: 'Inter_600SemiBold', color: TEXT, fontSize: 14 },
//   rowRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
//   rowValue: { minWidth: 66, textAlign: 'center', fontFamily: 'Inter_700Bold', color: TEXT, fontSize: 14 },
//   squareBtn: { width: 38, height: 38, borderRadius: 10, borderWidth: 1, borderColor: BORDER, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.25)' },
//   squareTxt: { fontFamily: 'Inter_700Bold', color: TEXT, fontSize: 18, lineHeight: 18 },
//   hintSmall: { fontFamily: 'Inter_400Regular', color: MUTED, fontSize: 12 },

//   presetRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 6 },
//   pill: { backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 6 },
//   pillTxt: { fontFamily: 'Inter_500Medium', color: TEXT, fontSize: 12 },

//   hint: { fontFamily: 'Inter_400Regular', color: MUTED, fontSize: 12 },

//   // Spotify
//   spotifyCard: { backgroundColor: CARD_BG, borderRadius: 14, borderTopWidth: 3, borderTopColor: '#1DB954', padding: 12, gap: 6 },
//   trackName: { fontFamily: 'Inter_700Bold', color: TEXT, fontSize: 16 },
//   trackArtist: { fontFamily: 'Inter_400Regular', color: MUTED, fontSize: 12 },
//   spotifyControls: { flexDirection: 'row', gap: 10, marginTop: 6 },
//   spotifyBtn: {
//   backgroundColor: '#1DB954', // Spotify green
//   paddingVertical: 10,
//   paddingHorizontal: 28,
//   borderRadius: 50, // pill shape
//   alignItems: 'center',
//   justifyContent: 'center',
//   shadowColor: '#000',
//   shadowOffset: { width: 0, height: 3 },
//   shadowOpacity: 0.3,
//   shadowRadius: 4,
//   elevation: 5, // for Android shadow
// },
// spotifyBtnTxt: {
//   color: '#fff',
//   fontFamily: 'Inter_700Bold',
//   fontSize: 16,
//   letterSpacing: 0.5,
// },

// });


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// File: app/(tabs)/timer.tsx

// import { useNavigation } from '@react-navigation/native';
// import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
// import {
//   AppState,
//   AppStateStatus,
//   Pressable,
//   StyleSheet,
//   Text,
//   Vibration,
//   View,
// } from 'react-native';
// import { SpotifyButton } from './spotify/SpotifyButton';

// type Phase = 'idle' | 'work' | 'rest' | 'done';

// type Settings = {
//   roundsTotal: number;
//   roundLengthSec: number;
//   restLengthSec: number;
// };

// type TimerState = {
//   phase: Phase;
//   currentRound: number;
//   remaining: number;
// };

// const RED = '#f70000';
// const CARD_BG = 'rgba(0,0,0,0.82)';
// const BORDER = 'rgba(255,255,255,0.12)';
// const MUTED = '#9ca3af';
// const TEXT = '#fff';

// function clamp(n: number, min: number, max: number): number {
//   return Math.max(min, Math.min(max, n));
// }

// function fmtTime(totalSeconds: number): string {
//   const s = Math.max(0, Math.floor(totalSeconds));
//   const m = Math.floor(s / 60);
//   const r = s % 60;
//   const mm = String(m).padStart(2, '0');
//   const ss = String(r).padStart(2, '0');
//   return `${mm}:${ss}`;
// }

// export default function FightTimerScreen(): React.ReactElement {
//   const navigation = useNavigation<any>(); // navigation for Party Mode

//   // Settings
//   const [settings, setSettings] = useState<Settings>({
//     roundsTotal: 3,
//     roundLengthSec: 3 * 60,
//     restLengthSec: 60,
//   });

//   // Timer state
//   const [state, setState] = useState<TimerState>({
//     phase: 'idle',
//     currentRound: 1,
//     remaining: settings.roundLengthSec,
//   });
//   const [running, setRunning] = useState<boolean>(false);

//   const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
//   const lastTickRef = useRef<number | null>(null);

//   /** ---------------- TIMER LOGIC ---------------- */

//   useEffect(() => {
//     const onChange = (s: AppStateStatus) => {
//       if (s !== 'active' && running) setRunning(false);
//     };
//     const sub = AppState.addEventListener('change', onChange);
//     return () => sub.remove();
//   }, [running]);

//   const totalForPhase = useMemo(() => {
//     if (state.phase === 'work') return settings.roundLengthSec;
//     if (state.phase === 'rest') return settings.restLengthSec;
//     return state.remaining;
//   }, [state.phase, state.remaining, settings.roundLengthSec, settings.restLengthSec]);

//   const progress = useMemo(() => {
//     if (totalForPhase <= 0) return 0;
//     return 1 - clamp(state.remaining / totalForPhase, 0, 1);
//   }, [state.remaining, totalForPhase]);

//   const vibrate = useCallback((pattern: 'short' | 'phase' | 'done') => {
//     if (pattern === 'short') Vibration.vibrate(50);
//     if (pattern === 'phase') Vibration.vibrate([0, 180, 80, 180]);
//     if (pattern === 'done') Vibration.vibrate([0, 220, 120, 220, 120, 220]);
//   }, []);

//   const startFromIdle = useCallback(() => {
//     setState({
//       phase: 'work',
//       currentRound: 1,
//       remaining: settings.roundLengthSec,
//     });
//     setRunning(true);
//     vibrate('phase');
//   }, [settings.roundLengthSec, vibrate]);

//   const nextPhase = useCallback((prev: TimerState): TimerState => {
//     if (prev.phase === 'work') {
//       if (prev.currentRound >= settings.roundsTotal) {
//         vibrate('done');
//         return { phase: 'done', currentRound: prev.currentRound, remaining: 0 };
//       }
//       if (settings.restLengthSec > 0) {
//         vibrate('phase');
//         return { phase: 'rest', currentRound: prev.currentRound, remaining: settings.restLengthSec };
//       }
//       vibrate('phase');
//       return { phase: 'work', currentRound: prev.currentRound + 1, remaining: settings.roundLengthSec };
//     }
//     if (prev.phase === 'rest') {
//       vibrate('phase');
//       return { phase: 'work', currentRound: prev.currentRound + 1, remaining: settings.roundLengthSec };
//     }
//     return prev;
//   }, [settings.roundLengthSec, settings.restLengthSec, settings.roundsTotal, vibrate]);

//   const tick = useCallback(() => {
//     setState((s) => {
//       if (s.phase === 'idle' || s.phase === 'done') return s;
//       const now = Date.now();
//       const last = lastTickRef.current ?? now;
//       lastTickRef.current = now;
//       const delta = Math.max(0, Math.round((now - last) / 1000));
//       const nextRemaining = s.remaining - (delta || 1);
//       if (nextRemaining <= 0) return nextPhase({ ...s, remaining: 0 });
//       return { ...s, remaining: nextRemaining };
//     });
//   }, [nextPhase]);

//   useEffect(() => {
//     if (!running) {
//       if (intervalRef.current) clearInterval(intervalRef.current);
//       intervalRef.current = null;
//       lastTickRef.current = null;
//       return;
//     }
//     lastTickRef.current = Date.now();
//     intervalRef.current = setInterval(tick, 1000);
//     return () => {
//       if (intervalRef.current) clearInterval(intervalRef.current);
//       intervalRef.current = null;
//     };
//   }, [running, tick]);

//   const toggleRun = useCallback(() => {
//     if (state.phase === 'idle') {
//       startFromIdle();
//       return;
//     }
//     if (state.phase === 'done') {
//       setState({ phase: 'work', currentRound: 1, remaining: settings.roundLengthSec });
//       setRunning(true);
//       vibrate('phase');
//       return;
//     }
//     setRunning((r) => !r);
//     vibrate('short');
//   }, [state.phase, startFromIdle, settings.roundLengthSec, vibrate]);

//   const resetAll = useCallback(() => {
//     setRunning(false);
//     setState({ phase: 'idle', currentRound: 1, remaining: settings.roundLengthSec });
//     vibrate('short');
//   }, [settings.roundLengthSec, vibrate]);

//   const quickPreset = useCallback((preset: 'boxing' | 'mma' | 'short') => {
//     if (preset === 'boxing') setSettings({ roundsTotal: 3, roundLengthSec: 3 * 60, restLengthSec: 60 });
//     else if (preset === 'mma') setSettings({ roundsTotal: 5, roundLengthSec: 5 * 60, restLengthSec: 60 });
//     else setSettings({ roundsTotal: 3, roundLengthSec: 60, restLengthSec: 20 });
//     setRunning(false);
//     setState({
//       phase: 'idle',
//       currentRound: 1,
//       remaining: (preset === 'mma' ? 5 : preset === 'boxing' ? 3 : 1) * 60,
//     });
//   }, []);

//   const inc = useCallback((key: keyof Settings, step: number) => {
//     setSettings((s) => {
//       if (key === 'roundsTotal') return { ...s, roundsTotal: clamp(s.roundsTotal + step, 1, 12) };
//       if (key === 'roundLengthSec') return { ...s, roundLengthSec: clamp(s.roundLengthSec + step, 10, 20 * 60) };
//       if (key === 'restLengthSec') return { ...s, restLengthSec: clamp(s.restLengthSec + step, 0, 10 * 60) };
//       return s;
//     });
//   }, []);

//   const phaseLabel = state.phase === 'work' ? 'ROUND' : state.phase === 'rest' ? 'REST' : state.phase === 'done' ? 'DONE' : 'READY';

//   /** ---------------- RENDER ---------------- */

//   return (
//     <View style={styles.root}>
//       <Text style={styles.screenTitle}>Timer</Text>

//       {/* Timer Card */}
//       <View style={styles.timerCard}>
//         <View style={styles.progressTrack}>
//           <View style={[styles.progressFill, { width: `${(1 - clamp(state.remaining / totalForPhase, 0, 1)) * 100}%` }]} />
//         </View>

//         <View style={styles.timeCenter}>
//           <Text style={[styles.phase, state.phase === 'work' ? styles.badgeWork : state.phase === 'rest' ? styles.badgeRest : styles.badgeIdle]}>
//             {phaseLabel}
//           </Text>
//           <Text style={styles.timeText}>{fmtTime(state.remaining)}</Text>
//           <Text style={styles.roundText}>
//             {state.phase === 'done'
//               ? `Completed ${settings.roundsTotal} / ${settings.roundsTotal}`
//               : `Round ${state.currentRound} / ${settings.roundsTotal}`}
//           </Text>
//         </View>

//         <View style={styles.controls}>
//           <Pressable onPress={toggleRun} style={({ pressed }) => [styles.primaryBtn, (pressed || running) && { opacity: 0.95 }]}>
//             <Text style={styles.primaryBtnTxt}>
//               {state.phase === 'idle' ? 'Start' : running ? 'Pause' : state.phase === 'done' ? 'Restart' : 'Resume'}
//             </Text>
//           </Pressable>
//           <Pressable onPress={resetAll} style={({ pressed }) => [styles.btn, pressed && { opacity: 0.95 }]}>
//             <Text style={styles.btnTxt}>Reset</Text>
//           </Pressable>
//         </View>

//         {/* ---------------- Party Mode Button ---------------- */}
//         <Pressable
//           onPress={() => navigation.navigate('PartyMode')}
//           style={({ pressed }) => [styles.primaryBtn, { marginTop: 12 }, pressed && { opacity: 0.8 }]}
//         >
//           <Text style={styles.primaryBtnTxt}>Enter Party Mode</Text>
//         </Pressable>
//       </View>

//       {/* Settings Card */}
//       <View style={styles.card}>
//         <Text style={styles.sectionHeader}>Settings</Text>
//         <RowControl label="Rounds" value={String(settings.roundsTotal)} onDec={() => inc('roundsTotal', -1)} onInc={() => inc('roundsTotal', 1)} />
//         <RowControl
//           label="Round length"
//           value={`${Math.floor(settings.roundLengthSec / 60)}:${String(settings.roundLengthSec % 60).padStart(2, '0')}`}
//           onDec={() => inc('roundLengthSec', -10)}
//           onInc={() => inc('roundLengthSec', 10)}
//           hint="±10s"
//         />
//         <RowControl
//           label="Rest length"
//           value={`${Math.floor(settings.restLengthSec / 60)}:${String(settings.restLengthSec % 60).padStart(2, '0')}`}
//           onDec={() => inc('restLengthSec', -5)}
//           onInc={() => inc('restLengthSec', 5)}
//           hint="±5s"
//         />
//         <View style={styles.presetRow}>
//           <Pressable onPress={() => quickPreset('boxing')} style={({ pressed }) => [styles.pill, pressed && { opacity: 0.95 }]}>
//             <Text style={styles.pillTxt}>🥊 Boxing 3×3:1</Text>
//           </Pressable>
//           <Pressable onPress={() => quickPreset('mma')} style={({ pressed }) => [styles.pill, pressed && { opacity: 0.95 }]}>
//             <Text style={styles.pillTxt}>🥋 MMA 5×5:1</Text>
//           </Pressable>
//           <Pressable onPress={() => quickPreset('short')} style={({ pressed }) => [styles.pill, pressed && { opacity: 0.95 }]}>
//             <Text style={styles.pillTxt}>⚡ Short 3×1:0.20</Text>
//           </Pressable>
//         </View>
//         <Text style={styles.hint}>Timer pauses when the app goes to background. Vibration confirms phase changes.</Text>
//       </View>

//       {/* Spotify Card */}
//       <View style={styles.spotifyCard}>
//         <Text style={styles.sectionHeader}>🎵 Spotify</Text>
//         <SpotifyButton />
//       </View>
//     </View>
//   );
// }

// /** ---------------- RowControl ---------------- */
// function RowControl({ label, value, hint, onDec, onInc }: { label: string; value: string; hint?: string; onDec: () => void; onInc: () => void; }) {
//   return (
//     <View style={styles.row}>
//       <Text style={styles.rowLabel}>{label}</Text>
//       <View style={styles.rowRight}>
//         {!!hint && <Text style={styles.hintSmall}>{hint}</Text>}
//         <Pressable onPress={onDec} style={({ pressed }) => [styles.squareBtn, pressed && { opacity: 0.9 }]}>
//           <Text style={styles.squareTxt}>−</Text>
//         </Pressable>
//         <Text style={styles.rowValue}>{value}</Text>
//         <Pressable onPress={onInc} style={({ pressed }) => [styles.squareBtn, pressed && { opacity: 0.9 }]}>
//           <Text style={styles.squareTxt}>+</Text>
//         </Pressable>
//       </View>
//     </View>
//   );
// }

// /** ---------------- STYLES ---------------- */
// const styles = StyleSheet.create({
//   root: { flex: 1, backgroundColor: 'black', padding: 14, gap: 12 },
//   screenTitle: { fontFamily: 'Inter_700Bold', color: TEXT, fontSize: 22, letterSpacing: 0.5, marginBottom: 2 },
//   timerCard: { backgroundColor: CARD_BG, borderRadius: 14, borderTopWidth: 3, borderTopColor: RED, padding: 12, gap: 12 },
//   progressTrack: { height: 8, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.08)', overflow: 'hidden' },
//   progressFill: { height: '100%', backgroundColor: RED },
//   timeCenter: { alignItems: 'center', gap: 6 },
//   phase: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, borderWidth: 1, borderColor: BORDER, fontFamily: 'Inter_700Bold', color: TEXT, fontSize: 12, letterSpacing: 1 },
//   badgeWork: { backgroundColor: 'rgba(247,0,0,0.10)' },
//   badgeRest: { backgroundColor: 'rgba(59,130,246,0.12)', borderColor: 'rgba(59,130,246,0.35)' },
//   badgeIdle: { backgroundColor: 'rgba(255,255,255,0.08)' },
//   timeText: { fontFamily: 'Inter_700Bold', color: TEXT, fontSize: 48, letterSpacing: 1 },
//   roundText: { fontFamily: 'Inter_400Regular', color: MUTED, fontSize: 12 },
//   controls: { flexDirection: 'row', gap: 10, alignSelf: 'center' },
//   primaryBtn: { backgroundColor: RED, paddingVertical: 12, paddingHorizontal: 16, borderRadius: 10, alignItems: 'center', minWidth: 140 },
//   primaryBtnTxt: { fontFamily: 'Inter_700Bold', color: TEXT, fontSize: 16, letterSpacing: 0.5 },
//   btn: { paddingVertical: 12, paddingHorizontal: 16, borderRadius: 10, alignItems: 'center', borderWidth: 1, borderColor: BORDER, minWidth: 100 },
//   btnTxt: { fontFamily: 'Inter_700Bold', color: '#e5e7eb', fontSize: 14 },
//   card: { backgroundColor: CARD_BG, borderRadius: 14, borderTopWidth: 3, borderTopColor: RED, padding: 12, gap: 10 },
//   sectionHeader: { fontFamily: 'Inter_700Bold', color: TEXT, fontSize: 16 },
//   row: { flexDirection: 'row', alignItems: 'center', gap: 12, justifyContent: 'space-between' },
//   rowLabel: { fontFamily: 'Inter_600SemiBold', color: TEXT, fontSize: 14 },
//   rowRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
//   rowValue: { minWidth: 66, textAlign: 'center', fontFamily: 'Inter_700Bold', color: TEXT, fontSize: 14 },
//   squareBtn: { width: 38, height: 38, borderRadius: 10, borderWidth: 1, borderColor: BORDER, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.25)' },
//   squareTxt: { fontFamily: 'Inter_700Bold', color: TEXT, fontSize: 18, lineHeight: 18 },
//   hintSmall: { fontFamily: 'Inter_400Regular', color: MUTED, fontSize: 12 },
//   presetRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 6 },
//   pill: { backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 6 },
//   pillTxt: { fontFamily: 'Inter_500Medium', color: TEXT, fontSize: 12 },
//   hint: { fontFamily: 'Inter_400Regular', color: MUTED, fontSize: 12 },
//   spotifyCard: { backgroundColor: CARD_BG, borderRadius: 14, borderTopWidth: 3, borderTopColor: '#1DB954', padding: 12, gap: 6 },
// });


///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// File: app/(tabs)/timer.tsx

import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AppState,
  AppStateStatus,
  Pressable,
  StyleSheet,
  Text,
  Vibration,
  View,
} from 'react-native';
import { SpotifyButton } from './spotify/SpotifyButton';

type Phase = 'idle' | 'work' | 'rest' | 'done';

type Settings = {
  roundsTotal: number;
  roundLengthSec: number;
  restLengthSec: number;
};

type TimerState = {
  phase: Phase;
  currentRound: number;
  remaining: number;
};

const RED = '#f70000';
const CARD_BG = 'rgba(0,0,0,0.82)';
const BORDER = 'rgba(255,255,255,0.12)';
const MUTED = '#9ca3af';
const TEXT = '#fff';

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function fmtTime(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const m = Math.floor(s / 60);
  const r = s % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(r).padStart(2, '0');
  return `${mm}:${ss}`;
}

export default function FightTimerScreen(): React.ReactElement {
  const router = useRouter(); // For Party Mode navigation

  // Settings
  const [settings, setSettings] = useState<Settings>({
    roundsTotal: 3,
    roundLengthSec: 3 * 60,
    restLengthSec: 60,
  });

  // Timer state
  const [state, setState] = useState<TimerState>({
    phase: 'idle',
    currentRound: 1,
    remaining: settings.roundLengthSec,
  });
  const [running, setRunning] = useState<boolean>(false);

  // Refs
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastTickRef = useRef<number | null>(null);

  /** ---------------- TIMER LOGIC ---------------- */

  useEffect(() => {
    const onChange = (s: AppStateStatus) => {
      if (s !== 'active' && running) setRunning(false);
    };
    const sub = AppState.addEventListener('change', onChange);
    return () => sub.remove();
  }, [running]);

  const totalForPhase = useMemo(() => {
    if (state.phase === 'work') return settings.roundLengthSec;
    if (state.phase === 'rest') return settings.restLengthSec;
    return state.remaining;
  }, [state.phase, state.remaining, settings.roundLengthSec, settings.restLengthSec]);

  const progress = useMemo(() => {
    if (totalForPhase <= 0) return 0;
    return 1 - clamp(state.remaining / totalForPhase, 0, 1);
  }, [state.remaining, totalForPhase]);

  const vibrate = useCallback((pattern: 'short' | 'phase' | 'done') => {
    if (pattern === 'short') Vibration.vibrate(50);
    if (pattern === 'phase') Vibration.vibrate([0, 180, 80, 180]);
    if (pattern === 'done') Vibration.vibrate([0, 220, 120, 220, 120, 220]);
  }, []);

  const startFromIdle = useCallback(() => {
    setState({
      phase: 'work',
      currentRound: 1,
      remaining: settings.roundLengthSec,
    });
    setRunning(true);
    vibrate('phase');
  }, [settings.roundLengthSec, vibrate]);

  const nextPhase = useCallback(
    (prev: TimerState): TimerState => {
      if (prev.phase === 'work') {
        if (prev.currentRound >= settings.roundsTotal) {
          vibrate('done');
          return { phase: 'done', currentRound: prev.currentRound, remaining: 0 };
        }
        if (settings.restLengthSec > 0) {
          vibrate('phase');
          return { phase: 'rest', currentRound: prev.currentRound, remaining: settings.restLengthSec };
        }
        vibrate('phase');
        return {
          phase: 'work',
          currentRound: prev.currentRound + 1,
          remaining: settings.roundLengthSec,
        };
      }
      if (prev.phase === 'rest') {
        vibrate('phase');
        return {
          phase: 'work',
          currentRound: prev.currentRound + 1,
          remaining: settings.roundLengthSec,
        };
      }
      return prev;
    },
    [settings.roundLengthSec, settings.restLengthSec, settings.roundsTotal, vibrate]
  );

  const tick = useCallback(() => {
    setState((s) => {
      if (s.phase === 'idle' || s.phase === 'done') return s;
      const now = Date.now();
      const last = lastTickRef.current ?? now;
      lastTickRef.current = now;
      const delta = Math.max(0, Math.round((now - last) / 1000));
      const nextRemaining = s.remaining - (delta || 1);
      if (nextRemaining <= 0) return nextPhase({ ...s, remaining: 0 });
      return { ...s, remaining: nextRemaining };
    });
  }, [nextPhase]);

  useEffect(() => {
    if (!running) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      intervalRef.current = null;
      lastTickRef.current = null;
      return;
    }
    lastTickRef.current = Date.now();
    intervalRef.current = setInterval(tick, 1000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      intervalRef.current = null;
    };
  }, [running, tick]);

  const toggleRun = useCallback(() => {
    if (state.phase === 'idle') {
      startFromIdle();
      return;
    }
    if (state.phase === 'done') {
      setState({ phase: 'work', currentRound: 1, remaining: settings.roundLengthSec });
      setRunning(true);
      vibrate('phase');
      return;
    }
    setRunning((r) => !r);
    vibrate('short');
  }, [state.phase, startFromIdle, settings.roundLengthSec, vibrate]);

  const resetAll = useCallback(() => {
    setRunning(false);
    setState({ phase: 'idle', currentRound: 1, remaining: settings.roundLengthSec });
    vibrate('short');
  }, [settings.roundLengthSec, vibrate]);

  const quickPreset = useCallback((preset: 'boxing' | 'mma' | 'short') => {
    if (preset === 'boxing') setSettings({ roundsTotal: 3, roundLengthSec: 3 * 60, restLengthSec: 60 });
    else if (preset === 'mma') setSettings({ roundsTotal: 5, roundLengthSec: 5 * 60, restLengthSec: 60 });
    else setSettings({ roundsTotal: 3, roundLengthSec: 60, restLengthSec: 20 });

    setRunning(false);
    setState({
      phase: 'idle',
      currentRound: 1,
      remaining: preset === 'mma' ? 5 * 60 : preset === 'boxing' ? 3 * 60 : 60,
    });
  }, []);

  const inc = useCallback((key: keyof Settings, step: number) => {
    setSettings((s) => {
      if (key === 'roundsTotal') return { ...s, roundsTotal: clamp(s.roundsTotal + step, 1, 12) };
      if (key === 'roundLengthSec') return { ...s, roundLengthSec: clamp(s.roundLengthSec + step, 10, 20 * 60) };
      if (key === 'restLengthSec') return { ...s, restLengthSec: clamp(s.restLengthSec + step, 0, 10 * 60) };
      return s;
    });
  }, []);

  const phaseLabel = state.phase === 'work' ? 'ROUND' : state.phase === 'rest' ? 'REST' : state.phase === 'done' ? 'DONE' : 'READY';

  /** ---------------- RENDER ---------------- */

  return (
    <View style={styles.root}>
      <Text style={styles.screenTitle}>Timer</Text>

      {/* Timer Card */}
      <View style={styles.timerCard}>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
        </View>

        <View style={styles.timeCenter}>
          <Text
            style={[
              styles.phase,
              state.phase === 'work'
                ? styles.badgeWork
                : state.phase === 'rest'
                ? styles.badgeRest
                : styles.badgeIdle,
            ]}
          >
            {phaseLabel}
          </Text>
          <Text style={styles.timeText}>{fmtTime(state.remaining)}</Text>
          <Text style={styles.roundText}>
            {state.phase === 'done'
              ? `Completed ${settings.roundsTotal} / ${settings.roundsTotal}`
              : `Round ${state.currentRound} / ${settings.roundsTotal}`}
          </Text>
        </View>

        <View style={styles.controls}>
          <Pressable
            onPress={toggleRun}
            style={({ pressed }) => [styles.primaryBtn, (pressed || running) && { opacity: 0.95 }]}
          >
            <Text style={styles.primaryBtnTxt}>
              {state.phase === 'idle' ? 'Start' : running ? 'Pause' : state.phase === 'done' ? 'Restart' : 'Resume'}
            </Text>
          </Pressable>
          <Pressable onPress={resetAll} style={({ pressed }) => [styles.btn, pressed && { opacity: 0.95 }]}>
            <Text style={styles.btnTxt}>Reset</Text>
          </Pressable>
        </View>

        {/* ---------------- Party Mode Button ---------------- */}
        <Pressable
          onPress={() => router.push('/party')} // navigate to Party Mode page
          style={({ pressed }) => [styles.primaryBtn, { marginTop: 12 }, pressed && { opacity: 0.8 }]}
        >
          <Text style={styles.primaryBtnTxt}>Enter Party Mode</Text>
        </Pressable>
      </View>

      {/* Settings */}
      <View style={styles.card}>
        <Text style={styles.sectionHeader}>Settings</Text>

        <RowControl label="Rounds" value={String(settings.roundsTotal)} onDec={() => inc('roundsTotal', -1)} onInc={() => inc('roundsTotal', 1)} />
        <RowControl label="Round Length" value={`${Math.floor(settings.roundLengthSec / 60)} min`} onDec={() => inc('roundLengthSec', -30)} onInc={() => inc('roundLengthSec', 30)} />
        <RowControl label="Rest Length" value={`${Math.floor(settings.restLengthSec / 60)} min`} onDec={() => inc('restLengthSec', -15)} onInc={() => inc('restLengthSec', 15)} />

        <Text style={styles.sectionHeader}>Quick Presets</Text>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Pressable onPress={() => quickPreset('boxing')} style={styles.btn}><Text style={styles.btnTxt}>Boxing</Text></Pressable>
          <Pressable onPress={() => quickPreset('mma')} style={styles.btn}><Text style={styles.btnTxt}>MMA</Text></Pressable>
          <Pressable onPress={() => quickPreset('short')} style={styles.btn}><Text style={styles.btnTxt}>Short</Text></Pressable>
        </View>
      </View>
      {/* Spotify Card */}
      <View style={styles.spotifyCard}>
        <Text style={styles.sectionHeader}>🎵 Spotify</Text>
        <SpotifyButton />
      </View>
    </View>
  );
}

/** ---------------- ROW CONTROL ---------------- */
function RowControl({ label, value, onDec, onInc }: { label: string; value: string; onDec: () => void; onInc: () => void }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginVertical: 6 }}>
      <Text style={{ color: TEXT }}>{label}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Pressable onPress={onDec} style={({ pressed }) => [styles.btn, pressed && { opacity: 0.8 }]}><Text style={styles.btnTxt}>-</Text></Pressable>
        <Text style={{ color: TEXT }}>{value}</Text>
        <Pressable onPress={onInc} style={({ pressed }) => [styles.btn, pressed && { opacity: 0.8 }]}><Text style={styles.btnTxt}>+</Text></Pressable>
      </View>
    </View>
  );
}

/** ---------------- STYLES ---------------- */
const styles = StyleSheet.create({
  root: { flex: 1, padding: 16, backgroundColor: '#0b0b0b' },
  screenTitle: { fontSize: 28, fontWeight: '700', color: TEXT, marginBottom: 12 },
  timerCard: { backgroundColor: CARD_BG, borderRadius: 12, padding: 16, marginBottom: 16 },
  progressTrack: { height: 6, backgroundColor: BORDER, borderRadius: 3, marginBottom: 12, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: RED },
  timeCenter: { alignItems: 'center', marginBottom: 12 },
  phase: { fontSize: 16, fontWeight: '600', paddingVertical: 2, paddingHorizontal: 8, borderRadius: 8 },
  badgeWork: { backgroundColor: RED, color: TEXT },
  badgeRest: { backgroundColor: MUTED, color: TEXT },
  badgeIdle: { backgroundColor: BORDER, color: TEXT },
  timeText: { fontSize: 48, fontWeight: '700', color: TEXT },
  roundText: { fontSize: 14, color: MUTED },
  controls: { flexDirection: 'row', gap: 8, justifyContent: 'center', marginBottom: 12 },
  primaryBtn: { flex: 1, backgroundColor: RED, paddingVertical: 12, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  primaryBtnTxt: { color: '#fff', fontWeight: '700', fontSize: 16 },
  btn: { paddingVertical: 6, paddingHorizontal: 12, backgroundColor: BORDER, borderRadius: 6 },
  btnTxt: { color: TEXT, fontWeight: '600' },
  card: { backgroundColor: CARD_BG, padding: 12, borderRadius: 12, marginBottom: 12 },
  sectionHeader: { fontWeight: '700', color: TEXT, marginVertical: 6 },
  spotifyCard: { backgroundColor: CARD_BG, borderRadius: 14, borderTopWidth: 3, borderTopColor: '#1DB954', padding: 12, gap: 6 },
});
