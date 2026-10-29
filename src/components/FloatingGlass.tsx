import React from 'react';
import { Platform, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { BlurView } from 'expo-blur';
import { GlassView, isGlassEffectAPIAvailable, isLiquidGlassAvailable } from 'expo-glass-effect';
export default function FloatingGlass({ children, style, dark }: { children: React.ReactNode; style: StyleProp<ViewStyle>; dark: boolean }) {
  const nativeGlass = Platform.OS === 'ios' && isGlassEffectAPIAvailable() && isLiquidGlassAvailable();
  const radius = StyleSheet.flatten(style)?.borderRadius;
  return <View testID="navigation-dock" style={[style, { overflow: 'hidden' }]}>
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {nativeGlass ? <GlassView glassEffectStyle="regular" colorScheme={dark ? 'dark' : 'light'} style={[StyleSheet.absoluteFill, { borderRadius: radius }]} /> : <BlurView intensity={60} tint={dark ? 'dark' : 'light'} style={[StyleSheet.absoluteFill, { borderRadius: radius, backgroundColor: dark ? 'rgba(16,16,16,0.45)' : 'rgba(240,244,241,0.45)' }]} />}
    </View>
    {children}
  </View>;
}
