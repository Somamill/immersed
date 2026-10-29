import React from 'react';
import { Platform, type StyleProp, type ViewStyle } from 'react-native';
import { BlurView } from 'expo-blur';
import { GlassView, isGlassEffectAPIAvailable, isLiquidGlassAvailable } from 'expo-glass-effect';
export default function FloatingGlass({ children, style, dark }: { children: React.ReactNode; style: StyleProp<ViewStyle>; dark: boolean }) {
  if (Platform.OS === 'ios' && isGlassEffectAPIAvailable() && isLiquidGlassAvailable()) {
    return <GlassView glassEffectStyle="regular" colorScheme={dark ? 'dark' : 'light'} isInteractive style={style}>{children}</GlassView>;
  }
  return <BlurView intensity={60} tint={dark ? 'dark' : 'light'} style={[style, { backgroundColor: dark ? 'rgba(16,16,16,0.45)' : 'rgba(240,244,241,0.45)' }]}>{children}</BlurView>;
}
