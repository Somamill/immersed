import React from 'react';
import { Pressable, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
export default function SentenceControls({ dark, previous, next }: { dark: boolean; previous?: () => void; next?: () => void }) {
  return <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 36, minHeight: 44 }}>
    {(['previous', 'next'] as const).map(direction => {
      const action = direction === 'previous' ? previous : next;
      return <Pressable key={direction} accessibilityRole="button" accessibilityLabel={direction === 'previous' ? 'Previous sentence' : 'Next sentence'} accessibilityState={{ disabled: !action }} disabled={!action} onPress={event => { event.stopPropagation(); action?.(); }} style={{ minWidth: 56, minHeight: 44, alignItems: 'center', justifyContent: 'center', opacity: action ? 1 : 0.25 }}>
        <Svg width={26} height={26} viewBox="0 0 24 24" fill="none" stroke={dark ? '#B4DEC4' : '#344C3F'} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <Path d={direction === 'previous' ? 'M5 5v14M19 6l-9 6 9 6Z' : 'M19 5v14M5 6l9 6-9 6Z'} />
        </Svg>
      </Pressable>;
    })}
  </View>;
}
