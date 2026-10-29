import React from 'react';
import { Text, View } from 'react-native';
import { accentHeights, type Accent } from '../pitch';
export default function PitchAccent({ accents, dark }: { accents?: Accent[]; dark: boolean }) {
  if (!accents?.length) return null;
  const color = dark ? '#B4DEC4' : '#344C3F';
  return <View testID="pitch-patterns" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, paddingVertical: 5 }}>
    {accents.filter(a => accentHeights(a).length).slice(0, 8).map(a => <View key={`${a.reading}:${a.downstep}`} accessibilityLabel={`${a.reading}, Tokyo pitch accent ${a.downstep === 0 ? 'flat, no downstep' : `downstep after mora ${a.downstep}`}`} style={{ flexDirection: 'row', alignItems: 'center' }}>
      {accentHeights(a).map((m, i, morae) => <View key={i} style={{ borderTopWidth: m.high ? 1.5 : 0, borderBottomWidth: m.high ? 0 : 1.5, borderRightWidth: m.high && !morae[i + 1]?.high && a.downstep === i + 1 ? 1.5 : 0, borderColor: color }}><Text selectable={false} style={{ color, fontSize: 13, lineHeight: 19 }}>{m.text}</Text></View>)}
      <Text selectable={false} style={{ color, fontSize: 11, marginLeft: 5 }}>[{a.downstep}]</Text>
    </View>)}
  </View>;
}
