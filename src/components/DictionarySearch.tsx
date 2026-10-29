import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Text, TextInput, View } from 'react-native';
import { languageRequest } from '../language';
import type { DictionaryEntry } from '../youtube';

export default function DictionarySearch({ dark }: { dark: boolean }) {
  const [query, setQuery] = useState('');
  const [result, setResult] = useState<{ query: string; entries: DictionaryEntry[]; error?: string } | null>(null);
  const text = query.trim();
  const ink = dark ? '#eee' : '#242D28', muted = dark ? '#aaa' : '#70776E';
  useEffect(() => {
    if (!text) return;
    let active = true;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    const timer = setTimeout(() => {
      void languageRequest<{ data: DictionaryEntry[] }>('search', { query: text }, controller.signal).then(data => {
        if (active) setResult({ query: text, entries: data.data });
      }).catch(() => { if (active) setResult({ query: text, entries: [], error: 'Search is unavailable right now.' }); });
    }, 200);
    return () => { active = false; controller.abort(); clearTimeout(timer); clearTimeout(timeout); };
  }, [text]);
  const current = result?.query === text ? result : null;
  return <View style={{ marginBottom: 24 }}>
    <TextInput accessibilityLabel="Search English or Japanese words" placeholder="English or Japanese" placeholderTextColor={muted} value={query} onChangeText={setQuery} maxLength={120} autoCapitalize="none" autoCorrect={false} clearButtonMode="while-editing" style={{ minHeight: 52, borderRadius: 16, paddingHorizontal: 16, backgroundColor: dark ? '#171717' : '#E8EBE1', color: ink, fontSize: 18 }} />
    {!!text && <View style={{ marginTop: 16 }}>
      <Text selectable={false} style={{ color: muted, marginBottom: 14 }}>{/[ぁ-ヿ㐀-鿿々]/.test(text) ? 'Japanese → English' : 'English → Japanese'}</Text>
      {!current && <ActivityIndicator accessibilityLabel="Searching dictionary" color={muted} />}
      {current?.error && <Text selectable={false} style={{ color: muted }}>{current.error}</Text>}
      {current && !current.error && !current.entries.length && <Text selectable={false} style={{ color: muted }}>No matches.</Text>}
      {current?.entries.map(entry => <View key={entry.slug} style={{ paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: dark ? '#252525' : '#ddd', gap: 7 }}>
        <Text selectable={false} style={{ color: ink, fontSize: 25 }}>{entry.japanese[0]?.word || entry.japanese[0]?.reading}</Text>
        {!!entry.japanese[0]?.word && <Text selectable={false} style={{ color: muted, fontSize: 16 }}>{entry.japanese[0]?.reading}</Text>}
        <Text selectable={false} style={{ color: ink, fontSize: 16, lineHeight: 24 }}>{entry.senses.slice(0, 2).map(sense => sense.english_definitions.join('; ')).join('\n')}</Text>
      </View>)}
    </View>}
  </View>;
}
