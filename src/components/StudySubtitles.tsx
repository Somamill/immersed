import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { familiarity, showFurigana, type JlptLevel } from '../learning';
import type { AnalyzedToken } from '../language';

export default function StudySubtitles({ tokens, tail, dark, level, knowledge, readings, onWord }: { tokens: AnalyzedToken[]; tail: string; dark: boolean; level: JlptLevel; knowledge: Record<string, boolean>; readings: boolean; onWord: (token: AnalyzedToken) => void }) {
  const groups: { token: AnalyzedToken; punctuation: string }[] = [];
  for (const token of tokens) {
    if (!token.word && /^[、。，．！？!?…」』）)\]】]+$/.test(token.text) && groups.length) groups[groups.length - 1].punctuation += token.text;
    else groups.push({ token, punctuation: '' });
  }
  const ink = dark ? '#F3F3F3' : '#242D28';
  return <View testID="subtitle-words" style={styles.words}>
    {groups.map(({ token, punctuation }, index) => {
      const unknown = familiarity(token.lemma, token.reading, level, knowledge) === 'unknown';
      const grammar = ['particle', 'auxiliary'].includes(token.pos);
      const color = unknown ? (dark ? '#FFD077' : '#8B4800') : grammar ? (dark ? '#B4DEC4' : '#276148') : ink;
      const furigana = /[一-龯]/.test(token.text) && !!token.reading && showFurigana(token.lemma, token.reading, level, knowledge, readings);
      return <View key={`${token.start}:${index}`} style={styles.group}>
        <Pressable accessibilityRole={token.word ? 'button' : undefined} accessibilityLabel={token.word ? `Look up ${token.text}` : token.text} disabled={!token.word} onPress={() => onWord(token)} style={styles.word}>
          {furigana && <Text selectable={false} testID={`furigana-${token.lemma}`} style={[styles.reading, { color }]}>{token.reading}</Text>}
          <Text selectable={false} style={[styles.japanese, { color }]}>{token.text}</Text>
        </Pressable>
        {!!punctuation && <Text selectable={false} style={[styles.japanese, { color: ink, paddingBottom: 3 }]}>{punctuation}</Text>}
      </View>;
    })}
    {!!tail && <Text selectable={false} style={[styles.japanese, { color: ink }]}>{tail}</Text>}
  </View>;
}
const styles = StyleSheet.create({
  words: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', alignItems: 'flex-end', columnGap: 3, rowGap: 8 },
  group: { flexDirection: 'row', alignItems: 'flex-end', maxWidth: '100%' },
  word: { minHeight: 44, flexShrink: 1, alignItems: 'center', justifyContent: 'flex-end', paddingHorizontal: 2, paddingVertical: 3 },
  japanese: { fontSize: 26, lineHeight: 39, textAlign: 'center' },
  reading: { fontSize: 12, lineHeight: 16, textAlign: 'center', marginBottom: 2 },
});
