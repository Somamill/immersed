import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import * as Linking from 'expo-linking';
import { dotPalette, dotTokens } from '../dot-theme';

export default function DotSuite({ dark }: { dark: boolean }) {
  const p = dotPalette(dark);
  const [expanded, setExpanded] = useState(false);
  const [error, setError] = useState('');
  const open = (repo: string) => { setError(''); void Linking.openURL(`https://github.com/Somamill/${repo}`).catch(() => setError('Could not open the project page. Try again.')); };
  return <View style={{ marginTop: dotTokens.spacing.xl, borderTopWidth: 1, borderTopColor: p.border, paddingTop: dotTokens.spacing.md }}>
    <Pressable accessibilityRole="button" accessibilityLabel="More from dot." accessibilityState={{ expanded }} onPress={() => setExpanded(value => !value)} style={({ pressed }) => ({ minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 8, opacity: pressed ? .7 : 1 })}>
      <View accessible={false} style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: p.accent }} />
      <Text style={{ color: p.secondaryText, fontSize: 14 }}>Part of <Text style={{ color: p.text, fontSize: 20, fontWeight: '700' }}>dot.</Text></Text>
    </Pressable>
    {expanded && <View style={{ gap: 8 }}>
      {([{ repo: 'read', name: 'read.', description: 'Books, articles, and highlights.' }, { repo: 'listen', name: 'listen.', description: 'Find your next audiobook.' }]).map(app => <Pressable key={app.repo} accessibilityRole="link" accessibilityLabel={`${app.name} — ${app.description} Open project page`} onPress={() => open(app.repo)} style={({ pressed }) => ({ minHeight: 52, justifyContent: 'center', paddingVertical: 8, opacity: pressed ? .7 : 1 })}>
        <Text style={{ color: p.accent, fontSize: 16, fontWeight: '600' }}>{app.name}</Text><Text style={{ color: p.secondaryText, fontSize: 13, lineHeight: 20 }}>{app.description}</Text>
      </Pressable>)}
    </View>}
    {!!error && <Text accessibilityRole="alert" style={{ color: p.secondaryText, fontSize: 14 }}>{error}</Text>}
  </View>;
}
