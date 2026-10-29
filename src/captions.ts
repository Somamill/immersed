export type TimedCue = { start: number; end: number; text: string };
// Retain the last spoken line through gaps so study/lookup never disappears.
// Looking up from the beginning also handles a backwards seek without stale text.
export function readingCue(cues: TimedCue[], time: number): TimedCue | undefined {
  let result: TimedCue | undefined;
  for (const cue of cues) {
    if (cue.start > time) break;
    result = cue;
  }
  return result;
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
