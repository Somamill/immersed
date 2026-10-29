import AsyncStorage from '@react-native-async-storage/async-storage';
import type { TimedCue } from './captions';

const prefix = 'immersed.captions.ja.v1.';
const indexKey = prefix + 'index';
const lifetime = 30 * 86400000;
let writes = Promise.resolve();
const valid = (cues: unknown): cues is TimedCue[] => Array.isArray(cues) && cues.length > 0 && cues.length <= 5000 && cues.every(c => c && typeof c.text === 'string' && c.text.length > 0 && c.text.length <= 2000 && Number.isFinite(c.start) && Number.isFinite(c.end) && c.start >= 0 && c.end > c.start);

export async function loadCaptionCache(videoId: string): Promise<TimedCue[] | null> {
  if (!/^[\w-]{11}$/.test(videoId)) return null;
  try {
    const raw = await AsyncStorage.getItem(prefix + videoId);
    if (!raw || raw.length > 128000) return null;
    const data = JSON.parse(raw);
    const age = Date.now() - data.savedAt;
    return data.formatVersion === 2 && data.language === 'ja' && data.videoId === videoId && Number.isFinite(age) && age >= 0 && age < lifetime && valid(data.cues) ? data.cues : null;
  } catch { return null; }
}

export function saveCaptionCache(videoId: string, cues: TimedCue[]): Promise<void> {
  if (!/^[\w-]{11}$/.test(videoId) || !valid(cues)) return Promise.resolve();
  const value = JSON.stringify({ formatVersion: 2, language: 'ja', videoId, savedAt: Date.now(), cues: [...cues].sort((a, b) => a.start - b.start) });
  if (value.length > 128000) return Promise.resolve();
  writes = writes.then(async () => {
    let index: string[] = [];
    try { const parsed = JSON.parse(await AsyncStorage.getItem(indexKey) || '[]'); if (Array.isArray(parsed)) index = parsed.filter(id => typeof id === 'string' && /^[\w-]{11}$/.test(id)); } catch {}
    const next = [videoId, ...index.filter(id => id !== videoId)];
    await AsyncStorage.setItem(prefix + videoId, value);
    await AsyncStorage.setItem(indexKey, JSON.stringify(next.slice(0, 8)));
    await Promise.all(next.slice(8).map(id => AsyncStorage.removeItem(prefix + id)));
  }).catch(() => { /* Cache failures must not interrupt live captions or playback. */ });
  return writes;
}
