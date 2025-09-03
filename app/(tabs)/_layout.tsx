// File: app/(tabs)/_layout.tsx
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import * as Haptics from 'expo-haptics';
import { Tabs, usePathname, useRouter } from 'expo-router';
import React from 'react';
import {
  Image,
  Platform,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { GestureHandlerRootView, TapGestureHandler } from 'react-native-gesture-handler';
import Animated, {
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

/* ---------- theme ---------- */
const RED = '#f70000';
const DARK = '#0b0b0b';
const DARK_RED = '#7e0f0f';

const PILL_HEIGHT = 64;
const CENTER_W = 68;
const CENTER_H = 56;
const LIFT = 12;

/* ---------- your PNG icons (adjust paths if needed) ---------- */
const ICONS = {
  poundrr:  require('@/assets/icons/poundrr-badge.png'),
  timer:    require('@/assets/icons/timer.png'),
  events:   require('@/assets/icons/socials.png'),   // if you don't have events.png, point to your calendar PNG
  profile:  require('@/assets/icons/profile.png'),
  glove:    require('@/assets/icons/glove.png'),
} as const;

function TabImg({ src, tint, size = 22 }: { src: any; tint?: string; size?: number }) {
  return <Image source={src} style={{ width: size, height: size, tintColor: tint }} resizeMode="contain" />;
}

/* ================= center dual-action glove ================= */
function DualActionCenter(): React.ReactElement {
  const router = useRouter();
  const pathname = usePathname();

  // 0 = Swipe (red BG), 1 = Spotlight (white BG)
  const mode = useSharedValue(0);
  const scale = useSharedValue(1);

  React.useEffect(() => {
    const inSpot = pathname?.startsWith('/socials/spotlight');
    mode.value = withTiming(inSpot ? 1 : 0, { duration: 180 });
  }, [pathname, mode]);

  const dblRef = React.useRef<any>(null);

  const goSwipe = () => router.push('/socials/swipe');
  const goSpot  = () => router.push('/socials/spotlight');

  const pulse = () => {
    scale.value = withSpring(0.94, { damping: 14, stiffness: 260 });
    setTimeout(() => { scale.value = withSpring(1, { damping: 14, stiffness: 200 }); }, 60);
  };

  const onSingle = () => {
    mode.value = withTiming(0, { duration: 160 });
    pulse();
    void Haptics.selectionAsync();
    goSwipe();
  };

  const onDouble = () => {
    const toSpot = mode.value < 0.5;
    mode.value = withTiming(toSpot ? 1 : 0, { duration: 160 });
    pulse();
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    toSpot ? goSpot() : goSwipe();
  };

  const transformStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: -LIFT }, { scale: scale.value }],
    zIndex: 10,
  }));

  const bubbleStyle = useAnimatedStyle(() => {
    const bg = interpolateColor(mode.value, [0, 1], [DARK_RED, '#ffffff']);
    const border = interpolateColor(mode.value, [0, 1], [DARK_RED, RED]);
    return { backgroundColor: bg, borderColor: border };
  });

  return (
    <TapGestureHandler ref={dblRef} numberOfTaps={2} onActivated={onDouble}>
      <TapGestureHandler waitFor={dblRef} onActivated={onSingle}>
        <Animated.View
          accessible
          accessibilityRole="button"
          accessibilityLabel="Swipe / Spotlight"
          style={[styles.centerBubble, transformStyle, bubbleStyle]}
        >
          <Image source={ICONS.glove} style={{ width: 32, height: 32 }} resizeMode="contain" />
        </Animated.View>
      </TapGestureHandler>
    </TapGestureHandler>
  );
}

/* ================= fully custom tab bar (no default icons) ================= */
function CustomTabBar({ state, navigation }: BottomTabBarProps): React.ReactElement {
  const pathname = usePathname();

  // map the four visible tabs to route names in this Tabs group
  // NOTE: these names must match the list Expo Router logged:
  // ["index","timer","poundrr/index","poundrr/events/index","profile/index", ...]
  const ROUTES = {
    poundrr: 'poundrr/index',
    timer: 'timer',
    events: 'socials/index',
    profile: 'profile/index',
  } as const;

  const isFocused = (name: string) => {
    const active = state.routes[state.index]?.name;
    // When we're on nested screens, React Navigation gives us the leaf route name.
    // We coerce focus by checking startsWith for nested stacks.
    if (active === name) return true;
    const r = state.routes[state.index];
    return r?.name?.startsWith(name.replace(/\/index$/, ''));
  };

  const goto = (name: string) => {
    // if the route exists in the state, navigate by name
    const target = state.routes.find((r) => r.name === name);
    if (target) {
      navigation.navigate(name as never);
    } else {
      // fallback to URL (shouldn't happen if we used the correct names)
      navigation.navigate(name as never);
    }
  };

  return (
    <View style={styles.fabBarWrap} pointerEvents="box-none">
      <View style={styles.fabBarBg} />
      {/* buttons row */}
      <View style={styles.row}>
        <Pressable onPress={() => goto(ROUTES.poundrr)} style={styles.item} hitSlop={8}>
          <TabImg src={ICONS.poundrr} tint={DARK} />
        </Pressable>

        <Pressable onPress={() => goto(ROUTES.timer)} style={styles.item} hitSlop={8}>
          <TabImg src={ICONS.timer} tint={DARK} />
        </Pressable>

        {/* spacer for center glove */}
        <View style={styles.spacer} />

        <Pressable onPress={() => goto(ROUTES.events)} style={styles.item} hitSlop={8}>
          <TabImg src={ICONS.events} tint={DARK} />
        </Pressable>

        <Pressable onPress={() => goto(ROUTES.profile)} style={styles.item} hitSlop={8}>
          <TabImg src={ICONS.profile} tint={DARK} />
        </Pressable>
      </View>

      {/* Center glove overlay */}
      <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
        <View style={styles.centerBtnHolder} pointerEvents="box-none">
          <DualActionCenter />
        </View>
      </View>
    </View>
  );
}

/* ================= Tabs layout ================= */
export default function TabsLayout(): React.ReactElement {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <Tabs
        // IMPORTANT: the "name" must match the nested children list exactly.
        // That removes the "No route named ..." warnings and fixes the double-tap crash.
        screenOptions={{
          headerShown: false,
          tabBarShowLabel: false,
          tabBarStyle: { backgroundColor: 'transparent', borderTopWidth: 0, elevation: 0 },
        }}
        tabBar={(props) => <CustomTabBar {...props} />}
      >
        {/* 1) Poundrr hub */}
        <Tabs.Screen name="poundrr/index" options={{ title: 'Poundrr' }} />

        {/* 2) Timer */}
        <Tabs.Screen name="timer" options={{ title: 'Timer' }} />

        {/* 3) Events index (separate tab) */}
        <Tabs.Screen name="poundrr/events/index" options={{ title: 'Events' }} />

        {/* 4) Profile */}
        <Tabs.Screen name="profile/index" options={{ title: 'Profile' }} />

        {/* Hidden socials stack; navigated by center glove */}
        <Tabs.Screen name="socials/index" options={{ href: null }} />
        <Tabs.Screen name="socials/swipe/index" options={{ href: null }} />
        <Tabs.Screen name="socials/spotlight/index" options={{ href: null }} />
      </Tabs>
    </GestureHandlerRootView>
  );
}

/* ================= styles ================= */
const styles = StyleSheet.create({
  fabBarWrap: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 12,
    borderRadius: 20,
    overflow: 'visible',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOpacity: 0.25,
        shadowRadius: 12,
        shadowOffset: { width: 0, height: 8 },
      },
      android: { elevation: 8 },
    }),
  },
  fabBarBg: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: RED,
    borderRadius: 20,
    height: PILL_HEIGHT,
  },
  row: {
    height: PILL_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
  },
  item: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  spacer: { width: CENTER_W + 16 }, // leave room for glove bubble
  centerBtnHolder: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: (PILL_HEIGHT - CENTER_H) / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerBubble: {
    width: CENTER_W,
    height: CENTER_H,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOpacity: 0.25,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 4 },
      },
      android: { elevation: 6 },
    }),
  },
});
