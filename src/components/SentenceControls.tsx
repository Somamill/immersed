import React, { useEffect, useRef } from 'react';
import { Pressable, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
function SkipButton({ dark, direction, action, compact = false }: { dark: boolean; direction: 'previous'|'next'; action?: () => void; compact?: boolean }) {
  const activated = useRef(false);
  const releaseTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(releaseTimer.current), []);
  return <Pressable accessibilityRole="button" accessibilityLabel={direction === 'previous' ? 'Previous sentence' : 'Next sentence'} accessibilityState={{ disabled: !action }} disabled={!action} unstable_pressDelay={0}
    onPressIn={() => { clearTimeout(releaseTimer.current); activated.current = true; action?.(); }}
    onPressOut={() => { releaseTimer.current = setTimeout(() => { activated.current = false; }, 0); }}
    onPress={event => { event.stopPropagation(); if (!activated.current) action?.(); activated.current = false; }}
    style={({ pressed }) => ({ width: compact ? 52 : 72, minHeight: compact ? 44 : 50, borderRadius: 21, alignItems: 'center', justifyContent: 'center', opacity: action ? 1 : 0.25, backgroundColor: dark ? '#141A17' : '#E8EEE8', borderWidth: 1, borderColor: dark ? '#B4DEC41A' : '#344C3F15', transform: [{ scale: pressed ? 0.94 : 1 }] })}>
    <Svg width={28} height={28} viewBox="0 0 24 24" fill="none" stroke={dark ? '#D9E9DF' : '#344C3F'} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <Path d={direction === 'previous' ? 'M5 6v12M18 7.5a1 1 0 0 0-1.5-.87l-7 4.5a1 1 0 0 0 0 1.74l7 4.5A1 1 0 0 0 18 16.5Z' : 'M19 6v12M6 7.5a1 1 0 0 1 1.5-.87l7 4.5a1 1 0 0 1 0 1.74l-7 4.5A1 1 0 0 1 6 16.5Z'} />
    </Svg>
  </Pressable>;
}
export function PlaybackButton({ dark, paused, onTogglePlayback, compact = false }: { dark: boolean; paused: boolean; onTogglePlayback: () => void; compact?: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={paused ? 'Play video' : 'Pause video'} onPress={event => { event.stopPropagation(); onTogglePlayback(); }} style={({ pressed }) => ({ width: compact ? 48 : 56, minHeight: compact ? 44 : 52, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: dark ? '#B4DEC4' : '#344C3F', transform: [{ scale: pressed ? 0.94 : 1 }] })}>
      <Svg width={26} height={26} viewBox="0 0 24 24" fill="none" stroke={dark ? '#17251C' : '#fff'} strokeWidth={paused ? 2 : 3} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <Path d={paused ? 'M8 5.5a1 1 0 0 1 1.5-.86l9 6.5a1 1 0 0 1 0 1.72l-9 6.5A1 1 0 0 1 8 18.5Z' : 'M9 6v12M15 6v12'} />
      </Svg>
    </Pressable>;
}
export default function SentenceControls({ dark, previous, next, paused, onTogglePlayback, compact = false }: { dark: boolean; previous?: () => void; next?: () => void; paused: boolean; onTogglePlayback: () => void; compact?: boolean }) {
  return <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: compact ? 16 : 20, minHeight: compact ? 44 : 52 }}>
    <SkipButton dark={dark} direction="previous" action={previous} compact={compact} />
    <PlaybackButton dark={dark} paused={paused} onTogglePlayback={onTogglePlayback} compact={compact} />
    <SkipButton dark={dark} direction="next" action={next} compact={compact} />
  </View>;
}
