export type TimedCue = { start: number; end: number; text: string };
export function japaneseCaptionUrl(input: string, videoId: string): URL | null {
  try {
    const url = new URL(input);
    const language = url.searchParams.get('lang') || '';
    const translation = url.searchParams.get('tlang');
    return url.protocol === 'https:' && /(^|\.)youtube\.com$/.test(url.hostname) && url.pathname === '/api/timedtext' && url.searchParams.get('v') === videoId && /^ja(?:-|$)/.test(language) && (!translation || /^ja(?:-|$)/.test(translation)) ? url : null;
  } catch { return null; }
}
// Resolve against the actual media timeline, including expiry and backwards seeks.
// The reading section stays visible during silence without presenting a stale line.
export function readingCue(cues: TimedCue[], time: number): TimedCue | undefined {
  let left = 0, right = cues.length - 1, candidate = -1;
  while (left <= right) {
    const middle = (left + right) >>> 1;
    if (cues[middle].start <= time) { candidate = middle; left = middle + 1; }
    else right = middle - 1;
  }
  const cue = cues[candidate];
  return cue && time < cue.end ? cue : undefined;
}
// YouTube JSON3 is an optional fast path fetched on the phone. Keep visible
// captions as a fallback: these public page structures can change independently.
export function parseCaptionTrack(value: unknown): TimedCue[] {
  const data = value as { events?: { tStartMs?: number; dDurationMs?: number; segs?: { utf8?: string }[] }[] };
  if (!Array.isArray(data?.events)) return [];
  const cues = data.events.flatMap(event => {
    if (!Number.isFinite(event.tStartMs) || !Array.isArray(event.segs)) return [];
    const text = event.segs.map(s => typeof s.utf8 === 'string' ? s.utf8 : '').join('').replace(/\s+/g, ' ').trim();
    if (!text || text.length > 2000 || event.tStartMs! < 0) return [];
    return [{ start: event.tStartMs! / 1000, end: (event.tStartMs! + (event.dDurationMs || 3000)) / 1000, text }];
  }).sort((a, b) => a.start - b.start);
  return cues.map((cue, i) => ({ ...cue, end: cues[i + 1]?.start > cue.start ? Math.min(cue.end, cues[i + 1].start) : cue.end })).filter(cue => cue.end > cue.start).slice(0, 20000);
}
