export type Accent = { reading: string; downstep: number };
// Small kana attach to the preceding mora; っ, ん and long vowels count separately.
export function accentMorae(reading: string) {
  return reading.match(/[ぁ-ゖァ-ヺー][ゃゅょぁぃぅぇぉャュョァィゥェォ]?/g) || [];
}
export function accentHeights(accent: Accent) {
  const morae = accentMorae(accent.reading);
  if (morae.join('') !== accent.reading || accent.downstep < 0 || accent.downstep > morae.length) return [];
  return morae.map((text, i) => ({ text, high: accent.downstep === 1 ? i === 0 : i > 0 && (accent.downstep === 0 || i < accent.downstep) }));
}
