import { familiarity, type JlptLevel } from './learning';
import { normalizeJapaneseCaption, type TimedCue } from './captions';
import type { AnalyzedToken } from './language';
export function sampleCaptionVocabulary(cues: TimedCue[]): string {
  if (!cues.length) return '';
  const width = Math.min(2, cues.length);
  const count = Math.min(10, Math.ceil(cues.length / width));
  const used = new Set<number>();
  const windows: string[] = [];
  for (let n = 0; n < count; n++) {
    const start = count === 1 ? 0 : Math.round(n * (cues.length - width) / (count - 1));
    const indexes = Array.from({ length: width }, (_, i) => start + i).filter(i => !used.has(i));
    const texts = indexes.map(i => normalizeJapaneseCaption(cues[i].text));
    // Keep complete source cues and sample throughout the track. Never cut a
    // word just to hit a character budget, or glue nonadjacent windows together.
    const combined = texts.join('');
    if (combined.length <= 60) { if (combined) windows.push(combined); indexes.forEach(i => used.add(i)); }
    else {
      const candidate = texts.findIndex(text => text.length > 0 && text.length <= 60);
      if (candidate >= 0) { windows.push(texts[candidate]); used.add(indexes[candidate]); }
    }
  }
  return windows.join('\n');
}
export function estimateVocabulary(tokens: AnalyzedToken[], level: JlptLevel, knowledge: Record<string, boolean>) {
  let known = 0, unknown = 0, unrated = 0;
  for (const token of tokens) {
    if (!token.word || ['particle', 'auxiliary'].includes(token.pos)) continue;
    const state = familiarity(token.lemma, token.reading, level, knowledge);
    if (state === 'known') known++;
    else if (state === 'unknown') unknown++;
    else unrated++;
  }
  const total = known + unknown + unrated;
  return total ? { known, unknown, unrated, total, lower: Math.round(100 * known / total), upper: Math.round(100 * (known + unrated) / total) } : null;
}
