export type Cue = { start: number; end: number; text: string };
const MAX_CUES = 50000;
function timestamp(value: string): number | null {
  const match = /^(?:(\d{1,3}):)?(\d{2}):(\d{2})[.,](\d{3})$/.exec(value);
  if (!match || +match[2] > 59 || +match[3] > 59) return null;
  return (
    +(match[1] || 0) * 3600 + +match[2] * 60 + +match[3] + +match[4] / 1000
  );
}
/** Parse text only. Subtitle markup is never executed or rendered as HTML. */
export function parseSubtitles(source: string): Cue[] {
  if (source.length > 10_000_000)
    throw new Error("Choose a subtitle file smaller than 10 MB.");
  const result: Cue[] = [];
  for (const block of source
    .replace(/^\uFEFF/, "")
    .replace(/\r\n?/g, "\n")
    .split(/\n\s*\n/)) {
    const lines = block.trim().split("\n");
    const timing = lines.findIndex((line) => line.includes("-->"));
    if (timing < 0) continue;
    const match = /^(\S+)\s+-->\s+(\S+)/.exec(lines[timing]);
    if (!match) continue;
    const start = timestamp(match[1]),
      end = timestamp(match[2]);
    const text = lines
      .slice(timing + 1)
      .join("\n")
      .replace(/<[^>]*>/g, "")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&nbsp;/g, " ")
      .trim();
    if (start !== null && end !== null && end > start && text)
      result.push({ start, end, text });
    if (result.length > MAX_CUES)
      throw new Error(
        "Choose a subtitle file with fewer than 50,000 captions.",
      );
  }
  if (!result.length)
    throw new Error(
      "No timed captions found. Choose a UTF-8 SRT or WebVTT file.",
    );
  return result.sort((a, b) => a.start - b.start || a.end - b.end);
}
export function activeCue(cues: Cue[], time: number): number {
  // Overlapping cues are valid; prefer the most recently started cue.
  let low = 0,
    high = cues.length;
  while (low < high) {
    const mid = (low + high) >>> 1;
    if (cues[mid].start <= time) low = mid + 1;
    else high = mid;
  }
  for (let i = low - 1; i >= 0; i--) if (cues[i].end > time) return i;
  return -1;
}
