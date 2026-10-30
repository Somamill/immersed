export type TimedCue = { start: number; end: number; text: string; hardEnd?: boolean };
// Caption boundaries are the best available sentence units; creator tracks can
// divide a grammatical sentence across several cues. Never invent timestamps.
export function sentenceTarget(cues: TimedCue[], time: number, direction: -1 | 1): number | undefined {
  if (!cues.length) return undefined;
  if (direction === 1) return cues.find(cue => cue.start > time + 0.05)?.start;
  let current = -1;
  for (let i = 0; i < cues.length && cues[i].start <= time + 0.05; i++) current = i;
  if (current < 0) return cues[0].start;
  return cues[Math.max(0, current - (time < cues[current].end ? 1 : 0))].start;
}
export type CaptionSource = 'human' | 'youtube-asr' | 'unknown';
export const captionSourceRank = (source: CaptionSource) => source === 'human' ? 3 : source === 'youtube-asr' ? 2 : 1;
export function normalizeJapaneseCaption(text: string): string {
  return text.replace(/\s+/g, ' ').replace(/([\u3000-\u30ff\u3400-\u9fff々]) +(?=[\u3000-\u30ff\u3400-\u9fff々])/g, '$1').trim();
}
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
  const data = value as { events?: { tStartMs?: number; dDurationMs?: number; aAppend?: number; wWinId?: number; segs?: { utf8?: string }[] }[] };
  if (!Array.isArray(data?.events)) return [];
  const cues: TimedCue[] = [];
  const windows = new Map<number, TimedCue>();
  for (const event of [...data.events].sort((a, b) => (a.tStartMs || 0) - (b.tStartMs || 0))) {
    if (!Number.isFinite(event.tStartMs) || event.tStartMs! < 0 || !Array.isArray(event.segs)) continue;
    const start = event.tStartMs! / 1000;
    const window = event.wWinId ?? 0;
    const previous = windows.get(window);
    const raw = event.segs.map(s => typeof s.utf8 === 'string' ? s.utf8 : '').join('');
    if (!raw.trim()) {
      if (event.aAppend !== 1 && previous) { previous.end = Math.min(previous.end, start); previous.hardEnd = true; windows.delete(window); }
      continue;
    }
    const text = normalizeJapaneseCaption(event.aAppend === 1 && previous ? previous.text + raw : raw);
    const duration = event.dDurationMs === undefined ? 3000 : event.dDurationMs;
    if (!text || text.length > 2000 || !Number.isFinite(duration) || duration <= 0) continue;
    if (previous && previous.end > start) previous.end = start;
    const cue = { start, end: start + duration / 1000, text };
    cues.push(cue); windows.set(window, cue);
    if (cues.length >= 20000) break;
  }
  const events = new Map<number, { add: TimedCue[]; remove: TimedCue[] }>();
  for (const cue of cues.filter(c => c.end > c.start)) {
    for (const time of [cue.start, cue.end]) if (!events.has(time)) events.set(time, { add: [], remove: [] });
    events.get(cue.start)!.add.push(cue); events.get(cue.end)!.remove.push(cue);
  }
  const times = [...events.keys()].sort((a, b) => a - b);
  const active = new Set<TimedCue>();
  const result: TimedCue[] = [];
  for (let i = 0; i < times.length - 1; i++) {
    const time = times[i], event = events.get(time)!;
    event.remove.forEach(c => active.delete(c)); event.add.forEach(c => active.add(c));
    const lines = [...active].map(c => c.text);
    if (!lines.length) continue;
    const hardEnd = [...active].some(c => c.hardEnd && c.end === times[i + 1]);
    const text = lines.join(' ');
    const previous = result[result.length - 1];
    if (previous?.text === text && previous.end === time && !previous.hardEnd) { previous.end = times[i + 1]; if (hardEnd) previous.hardEnd = true; }
    else result.push({ start: time, end: times[i + 1], text, ...(hardEnd ? { hardEnd: true } : {}) });
  }
  return result.slice(0, 20000);
}

// Reading grace never overlaps the next line or defeats an explicit clear.
export function readingTimeline(cues: TimedCue[]): TimedCue[] {
  return cues.map((cue, i) => {
    if (cue.hardEnd) return cue;
    const next = cues[i + 1];
    const bridge = next && next.start > cue.end && next.start - cue.end <= .25 ? next.start : cue.end;
    const target = Math.max(bridge, cue.start + Math.min(2.5, Math.max(.8, cue.text.length * .075)));
    const end = Math.min(target, cue.end + .5, next?.start ?? Infinity);
    return end > cue.end ? { ...cue, end } : cue;
  });
}

/** Keep a source cue that straddles the boundary of an unfinished ASR pass. */
export function combineCaptionTracks(primary: TimedCue[], fallback: TimedCue[], coveredUntil?: number): TimedCue[] {
  if (!primary.length) return fallback;
  const end = Math.max(primary[primary.length - 1].end, Number.isFinite(coveredUntil) ? coveredUntil! : 0);
  return [...primary, ...fallback.filter(cue => cue.end > end).map(cue => cue.start < end ? { ...cue, start: end } : cue)];
}
