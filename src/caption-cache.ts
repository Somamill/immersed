import AsyncStorage from '@react-native-async-storage/async-storage';
import { validCaptionCues, type CaptionSource, type TimedCue } from './captions';
export type CaptionOrigin = CaptionSource | 'generated';
export type CachedCaptions = { cues: TimedCue[]; source: CaptionOrigin; coveredUntil?: number };
const priority = (source: CaptionOrigin) => ({ human: 4, generated: 3, 'youtube-asr': 2, unknown: 1 })[source];

const prefix = 'immersed.captions.ja.v1.';
const indexKey = prefix + 'index';
const lifetime = 30 * 86400000;
let writes = Promise.resolve();
const validSource = (source: unknown): source is CaptionOrigin => ['human', 'generated', 'youtube-asr', 'unknown'].includes(String(source));

export async function loadCaptionCache(videoId: string): Promise<CachedCaptions | null> {
  if (!/^[\w-]{11}$/.test(videoId)) return null;
  try {
    const raw = await AsyncStorage.getItem(prefix + videoId);
    if (!raw || raw.length > 128000) return null;
    const data = JSON.parse(raw);
    const age = Date.now() - data.savedAt;
    return data.formatVersion === 5 && validSource(data.source) && data.language === 'ja' && data.videoId === videoId && Number.isFinite(age) && age >= 0 && age < lifetime && validCaptionCues(data.cues) && (data.source !== 'generated' || (Number.isFinite(data.coveredUntil) && data.coveredUntil >= data.cues.at(-1)!.end)) ? { cues: data.cues, source: data.source, coveredUntil: data.coveredUntil } : null;
  } catch { return null; }
}

export function saveCaptionCache(videoId: string, cues: TimedCue[], source: CaptionOrigin, coveredUntil?: number): Promise<void> {
  if (!/^[\w-]{11}$/.test(videoId) || !validCaptionCues(cues)) return Promise.resolve();
  const value = JSON.stringify({ formatVersion: 5, source, ...(source === 'generated' ? { coveredUntil: Math.max(cues.at(-1)!.end, Number.isFinite(coveredUntil) ? coveredUntil! : 0) } : {}), language: 'ja', videoId, savedAt: Date.now(), cues: [...cues].sort((a, b) => a.start - b.start) });
  if (value.length > 128000) return Promise.resolve();
  writes = writes.then(async () => {
    const existing = await loadCaptionCache(videoId);
    if (existing && priority(existing.source) > priority(source)) return;
    let index: string[] = [];
    try { const parsed = JSON.parse(await AsyncStorage.getItem(indexKey) || '[]'); if (Array.isArray(parsed)) index = parsed.filter(id => typeof id === 'string' && /^[\w-]{11}$/.test(id)); } catch {}
    const next = [videoId, ...index.filter(id => id !== videoId)];
    await AsyncStorage.setItem(prefix + videoId, value);
    await AsyncStorage.setItem(indexKey, JSON.stringify(next.slice(0, 8)));
    await Promise.all(next.slice(8).map(id => AsyncStorage.removeItem(prefix + id)));
  }).catch(() => { /* Cache failures must not interrupt live captions or playback. */ });
  return writes;
}
