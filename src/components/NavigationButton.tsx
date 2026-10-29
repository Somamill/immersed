import React from 'react';
import { Pressable, View } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

export default function NavigationButton({ icon, label, active, dark, onPress }: { icon: 'browse' | 'watch' | 'words' | 'settings'; label: string; active: boolean; dark: boolean; onPress: () => void }) {
  const color = active ? (dark ? '#B4DEC4' : '#244E37') : (dark ? '#B4BDB8' : '#56675D');
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ selected: active }} aria-pressed={active} accessibilityHint={icon === 'words' ? 'Open dictionary and saved vocabulary' : undefined} onPress={onPress} style={{ minWidth: 72, minHeight: 52, alignItems: 'center', justifyContent: 'center', borderRadius: 24, overflow: 'hidden', backgroundColor: 'transparent' }}>
    <View pointerEvents="none" accessible={false}><Svg width={30} height={30} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {icon === 'browse' && <><Circle cx={12} cy={12} r={9} /><Path d="m15.7 8.3-2.4 5-5 2.4 2.4-5Z" /></>}
      {icon === 'watch' && <><Rect x={3} y={4} width={18} height={16} rx={5} /><Path d="m10 8 6 4-6 4Z" /></>}
      {icon === 'words' && <><Path d="M12 6C9 4 6 4 3 5v14c3-1 6-1 9 1 3-2 6-2 9-1V5c-3-1-6-1-9 1Zm0 0v14" /><Path d="M6 9h3m-3 4h3m6-4h3m-3 4h3" /></>}
      {icon === 'settings' && <><Path d="M5 3v5m0 5v8M12 3v10m0 5v3M19 3v2m0 5v11" /><Circle cx={5} cy={10.5} r={2.5} /><Circle cx={12} cy={15.5} r={2.5} /><Circle cx={19} cy={7.5} r={2.5} /></>}
    </Svg></View>
    {active && <View accessible={false} style={{ position: 'absolute', bottom: 3, width: 4, height: 4, borderRadius: 2, backgroundColor: color }} />}
  </Pressable>;
}
