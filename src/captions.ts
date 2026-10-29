export type TimedCue = { start: number; end: number; text: string };
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
      if (event.aAppend !== 1 && previous) { previous.end = Math.min(previous.end, start); windows.delete(window); }
      continue;
    }
    const text = normalizeJapaneseCaption(event.aAppend === 1 && previous && previous.end > start ? previous.text + raw : raw);
    const duration = event.dDurationMs === undefined ? 3000 : event.dDurationMs;
    if (!text || text.length > 2000 || !Number.isFinite(duration) || duration <= 0) continue;
    const cue = { start, end: start + duration / 1000, text };
    cues.push(cue); windows.set(window, cue);
    if (cues.length >= 20000) break;
  }
  return cues.map((cue, i) => ({ ...cue, end: cues[i + 1]?.start > cue.start ? Math.min(cue.end, cues[i + 1].start) : cue.end })).filter(cue => cue.end > cue.start).slice(0, 20000);
}
