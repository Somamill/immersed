import type { LocalSpeechSegment } from './local-captions.native';
import type { TimedCue } from './captions';

// Speech framework reports short mutable segments. Build readable lines while
// preserving every recognized character and replacing interim results in place.
export function groupLocalSpeech(segments: LocalSpeechSegment[]): TimedCue[] {
  const valid = segments.filter(s => typeof s.text === 'string' && s.text.trim() && Number.isFinite(s.start) && Number.isFinite(s.end) && s.start >= 0 && s.end > s.start).sort((a, b) => a.start - b.start);
  const cues: TimedCue[] = [];
  for (const segment of valid) {
    const text = segment.text.trim();
    const last = cues.at(-1);
    if (last && segment.start - last.end <= .65 && segment.end - last.start <= 3.7 && last.text.length + text.length <= 36) {
      last.text += text;
      last.end = Math.max(last.end, segment.end);
    } else cues.push({ text, start: segment.start, end: segment.end });
  }
  return cues;
}
