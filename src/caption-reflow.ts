import type { TimedCue } from './captions';
// Carry the last refined cue into the next batch so a batch boundary does not
// itself split a word. Progress always retains the untouched remainder.
export async function refineCaptionTrack(raw: TimedCue[], endpoint: string, signal: AbortSignal, onProgress: (cues: TimedCue[]) => void, request: typeof fetch = fetch) {
  const fixed: TimedCue[] = [];
  let tail: TimedCue[] = [];
  for (let cursor = 0; cursor < raw.length;) {
    if (signal.aborted) return;
    const take = Math.min(48 - tail.length, raw.length - cursor);
    const batch = [...tail, ...raw.slice(cursor, cursor + take)];
    cursor += take;
    const response = await request(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cues: batch }), signal });
    if (!response.ok) throw new Error('Caption reflow unavailable');
    const result = await response.json() as { cues?: TimedCue[] };
    const cues = result.cues;
    // Accept only an ordered partition of the original cue sequence. The server
    // may join glyphs, never edit them, move outer timestamps or drop content.
    let offset = 0;
    if (!Array.isArray(cues) || !cues.length) throw new Error('Invalid caption reflow');
    for (const cue of cues) {
      const first = batch[offset];
      let text = '';
      while (offset < batch.length && text.length < cue.text?.length) text += batch[offset++].text;
      const last = batch[offset - 1];
      if (!first || !last || text !== cue.text || cue.start !== first.start || cue.end !== last.end) throw new Error('Invalid caption reflow');
      if (last.hardEnd) cue.hardEnd = true;
    }
    if (offset !== batch.length) throw new Error('Invalid caption reflow');
    if (signal.aborted) return;
    fixed.push(...cues.slice(0, -1));
    tail = cues.slice(-1);
    onProgress([...fixed, ...tail, ...raw.slice(cursor)]);
    // Let current-caption/dictionary requests run between background batches.
    if (cursor < raw.length) await new Promise(resolve => setTimeout(resolve, 40));
  }
}
