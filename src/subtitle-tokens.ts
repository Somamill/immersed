import type { AnalyzedToken } from './language';
/** Preserve every source character even when morphology returns gaps or bad offsets. */
export function preserveCaptionTokens(text: string, tokens: AnalyzedToken[]): AnalyzedToken[] {
  const raw = (start: number, end: number): AnalyzedToken => ({ text: text.slice(start, end), start, end, lemma: text.slice(start, end), reading: '', pos: 'unparsed', word: false, grammar: [] });
  const result: AnalyzedToken[] = [];
  let offset = 0;
  for (const token of tokens) {
    if (!Number.isInteger(token.start) || !Number.isInteger(token.end) || token.start < offset || token.end <= token.start || token.end > text.length || text.slice(token.start, token.end) !== token.text) return text ? [raw(0, text.length)] : [];
    if (token.start > offset) result.push(raw(offset, token.start));
    result.push(token); offset = token.end;
  }
  if (offset < text.length) result.push(raw(offset, text.length));
  return result;
}
