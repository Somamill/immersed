import React, { useEffect, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Image, Platform, StyleSheet } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';

if (Platform.OS !== 'web') {
  SplashScreen.setOptions({ duration: 180, fade: true });
  void SplashScreen.preventAutoHideAsync().catch(() => {});
}

/** Only local preference restoration gates startup; playback/network never do. */
export default function StartupOverlay({ ready }: { ready: boolean }) {
  const [visible, setVisible] = useState(true);
  const [laidOut, setLaidOut] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(true);
  const [opacity] = useState(() => new Animated.Value(1));
  const [rotation] = useState(() => new Animated.Value(0));
  useEffect(() => {
    let active = true;
    void AccessibilityInfo.isReduceMotionEnabled().then(value => { if (active) setReducedMotion(value); }).catch(() => {});
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReducedMotion);
    return () => { active = false; subscription.remove(); };
  }, []);
  useEffect(() => {
    if (!visible || reducedMotion) return;
    const animation = Animated.loop(Animated.timing(rotation, { toValue: 1, duration: 1600, easing: Easing.linear, useNativeDriver: Platform.OS !== 'web', isInteraction: false }));
    animation.start();
    return () => animation.stop();
  }, [visible, reducedMotion, rotation]);
  useEffect(() => {
    if (!ready || !laidOut) return;
    const animation = Animated.timing(opacity, { toValue: 0, duration: reducedMotion ? 0 : 180, useNativeDriver: Platform.OS !== 'web', isInteraction: false });
    animation.start(({ finished }) => { if (finished) setVisible(false); });
    return () => animation.stop();
  }, [ready, laidOut, reducedMotion, opacity]);
  if (!visible) return null;
  return <Animated.View testID="startup-animation" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" onLayout={() => {
    setLaidOut(true);
    if (Platform.OS !== 'web') void SplashScreen.hideAsync().catch(() => {});
  }} style={[styles.overlay, { opacity }]}>
    <Animated.View style={[styles.ring, { transform: [{ rotate: rotation.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] }) }] }]} />
    <Image source={require('../../assets/icon.png')} style={styles.logo} />
  </Animated.View>;
}
const styles = StyleSheet.create({
  overlay: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, zIndex: 1000, backgroundColor: '#080E0B', alignItems: 'center', justifyContent: 'center' },
  ring: { position: 'absolute', width: 108, height: 108, borderRadius: 54, borderWidth: 2, borderColor: '#B4DEC4B0', borderRightColor: 'transparent', borderBottomColor: 'transparent' },
  logo: { width: 64, height: 64, borderRadius: 16 },
});
