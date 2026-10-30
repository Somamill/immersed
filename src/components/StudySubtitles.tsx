import React from 'react';
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { familiarity, showFurigana, type JlptLevel } from '../learning';
import type { AnalyzedToken } from '../language';

export default function StudySubtitles({ tokens, tail, dark, level, knowledge, readings, onHeight, onWord }: { tokens: AnalyzedToken[]; tail: string; dark: boolean; level: JlptLevel; knowledge: Record<string, boolean>; readings: boolean; onHeight?: (height: number) => void; onWord: (token: AnalyzedToken) => void }) {
  const { fontScale } = useWindowDimensions();
  const groups: { token: AnalyzedToken; punctuation: string; prefix: string }[] = [];
  let prefix = '';
  for (const token of tokens) {
    if (!token.word && /^[「『（(\[【]+$/.test(token.text)) prefix += token.text;
    else if (!token.word && /^[、。，．！？!?…」』）)\]】]+$/.test(token.text) && groups.length && !prefix) groups[groups.length - 1].punctuation += token.text;
    else { groups.push({ token, punctuation: '', prefix }); prefix = ''; }
  }
  const ink = dark ? '#F3F3F3' : '#242D28';
  return <View testID="subtitle-words" onLayout={event => onHeight?.(event.nativeEvent.layout.height)} style={styles.words}>
    {groups.map(({ token, punctuation, prefix }, index) => {
      const unknown = token.word && familiarity(token.lemma, token.reading, level, knowledge) === 'unknown';
      const color = ink;
      const furigana = /[一-龯]/.test(token.text) && !!token.reading && showFurigana(token.lemma, token.reading, level, knowledge, readings);
      return <View key={`${token.start}:${index}`} style={styles.group}>
        {!!prefix && <Text selectable={false} style={[styles.japanese, { color: ink, paddingBottom: 2 }]}>{prefix}</Text>}
        <Pressable accessibilityRole={token.word ? 'button' : undefined} accessibilityLabel={token.word ? `Look up ${token.text}` : token.text} disabled={!token.word} onPress={() => onWord(token)} style={[styles.word, { paddingTop: readings ? 16 * fontScale : 0 }]}>
          {furigana && <View pointerEvents="none" style={styles.ruby}><Text selectable={false} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.65} testID={`furigana-${token.lemma}`} style={[styles.reading, { color }]}>{token.reading}</Text></View>}
          <View testID={unknown ? `unknown-${token.lemma}` : undefined} style={unknown ? { backgroundColor: dark ? '#B4DEC41A' : '#344C3F12', borderRadius: 5 } : undefined}><Text selectable={false} style={[styles.japanese, { color }]}>{token.text}</Text></View>
        </Pressable>
        {!!punctuation && <Text selectable={false} style={[styles.japanese, { color: ink, paddingBottom: 2 }]}>{punctuation}</Text>}
      </View>;
    })}
    {!!prefix && <Text selectable={false} style={[styles.japanese, { color: ink }]}>{prefix}</Text>}
    {!!tail && <Text selectable={false} style={[styles.japanese, { color: ink, paddingTop: readings ? 16 * fontScale : 0 }]}>{tail}</Text>}
  </View>;
}
const styles = StyleSheet.create({
  words: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', alignItems: 'flex-end', columnGap: 0, rowGap: 2 },
  group: { flexDirection: 'row', alignItems: 'flex-end', maxWidth: '100%' },
  word: { minHeight: 44, flexShrink: 1, alignItems: 'center', justifyContent: 'flex-end', paddingHorizontal: 0, paddingBottom: 2 },
  japanese: { fontSize: 26, lineHeight: 34, textAlign: 'center' },
  ruby: { position: 'absolute', top: 0, left: -7, right: -7 },
  reading: { fontSize: 11, lineHeight: 14, textAlign: 'center' },
});
