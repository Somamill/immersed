import React, { useEffect, useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import type { TimedCue } from '../captions';
import { sampleCaptionVocabulary, estimateVocabulary } from '../coverage';
import { languageRequest, type AnalyzedToken } from '../language';
import type { JlptLevel } from '../learning';
const cache = new Map<string, AnalyzedToken[]>();
const emptyTokens: AnalyzedToken[] = [];
export default function VideoCoverage({ cues, level, knowledge, dark }: { cues: TimedCue[]; level: JlptLevel; knowledge: Record<string, boolean>; dark: boolean }) {
  const sample = useMemo(() => sampleCaptionVocabulary(cues), [cues]);
  const [result, setResult] = useState<{ sample: string; tokens: AnalyzedToken[] } | null>(null);
  useEffect(() => {
    if (!sample || cache.has(sample)) return;
    const controller = new AbortController();
    let active = true;
    const timeout = setTimeout(() => controller.abort(), 10000);
    void languageRequest<{ tokens: AnalyzedToken[] }>('analyze', { text: sample }, controller.signal).then(data => {
      if (!active) return;
      if (cache.size >= 8) cache.delete(cache.keys().next().value!);
      cache.set(sample, data.tokens); setResult({ sample, tokens: data.tokens });
    }).catch(() => { /* Hide estimates without a usable caption sample. */ }).finally(() => clearTimeout(timeout));
    return () => { active = false; controller.abort(); clearTimeout(timeout); };
  }, [sample]);
  const tokens = cache.get(sample) || (result?.sample === sample ? result.tokens : emptyTokens);
  const stats = useMemo(() => estimateVocabulary(tokens, level, knowledge), [tokens, level, knowledge]);
  if (!stats || stats.total < 20) return null;
  if (stats.unrated > stats.total / 2) return null;
  const percent = stats.lower;
  const color = dark ? '#B4DEC4' : '#344C3F';
  return <View testID="video-coverage" accessibilityLabel={`${percent}% familiar words. Sample: ${stats.total} vocabulary occurrences, ${stats.unrated} unrated. Unrated words are not counted as familiar. Estimated from captions and your learning profile; listening comprehension can differ.`} style={{ alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 9, paddingHorizontal: 12, paddingVertical: 5, borderRadius: 14, backgroundColor: dark ? '#142019' : '#E5ECE4' }}>
    <Text selectable={false} style={{ color, fontSize: 15, fontWeight: '700', fontVariant: ['tabular-nums'] }}>{percent}%</Text>
    <View><Text selectable={false} style={{ color, fontSize: 10, lineHeight: 13 }}>familiar words</Text><View style={{ height: 3, width: 68, borderRadius: 2, overflow: 'hidden', backgroundColor: dark ? '#354039' : '#CAD2C9', marginTop: 3 }}><View style={{ height: 3, width: `${percent}%`, backgroundColor: color }} /></View></View>
  </View>;
}
