import React, { useEffect, useMemo, useState } from 'react';
import { Text } from 'react-native';
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
  const range = stats.lower === stats.upper ? `${stats.lower}%` : `${stats.lower}–${stats.upper}%`;
  const text = stats.unrated > stats.total / 2 ? 'Caption vocabulary mostly unrated' : `≈ ${range} familiar words`;
  return <Text testID="video-coverage" selectable={false} accessibilityLabel={`${text}. Sample: ${stats.total} vocabulary occurrences, ${stats.unrated} unrated. Estimated from captions and your learning profile; listening comprehension can differ.`} style={{ color: dark ? '#ADBEB3' : '#526657', fontSize: 11, lineHeight: 18, textAlign: 'center', paddingBottom: 2 }}>{text}</Text>;
}
