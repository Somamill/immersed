const { analyze, lookup } = require('./language.cjs');
// Join only a short, nearly contiguous pair whose combined morphology contains
// a verified word/inflection crossing the old boundary. Preserve every glyph.
async function reflowCaptions(cues) {
  const result = [];
  let joined = 0;
  for (let i = 0; i < cues.length; i++) {
    const next = cues[i];
    const previous = result.at(-1);
    let merge = false;
    if (previous && joined < 2 && next.start >= previous.end - 0.02 && next.start - previous.end <= 0.12 && next.end - previous.start <= 6 && previous.text.length + next.text.length <= 48 && /[ぁ-ヿ㐀-鿿々]$/.test(previous.text) && /^[ぁ-ヿ㐀-鿿々]/.test(next.text)) {
      const boundary = previous.text.length;
      const tokens = await analyze(previous.text + next.text, true);
      const crossing = tokens.find(t => t.word && t.start < boundary && t.end > boundary);
      if (crossing) merge = (await lookup(crossing.lemma, crossing)).length > 0;
    }
    if (merge) { result[result.length - 1] = { start: previous.start, end: next.end, text: previous.text + next.text }; joined++; }
    else { result.push({ ...next }); joined = 0; }
    // Yield between small groups so word lookup can run ahead of background work.
    if (i % 8 === 7) await new Promise(resolve => setImmediate(resolve));
  }
  return result;
}
function validBatch(cues) {
  return Array.isArray(cues) && cues.length > 0 && cues.length <= 48 && cues.every((c, i) => c && typeof c.text === 'string' && c.text.length > 0 && c.text.length <= 2000 && Number.isFinite(c.start) && Number.isFinite(c.end) && c.start >= 0 && c.end > c.start && (!i || c.start >= cues[i - 1].end - 0.02));
}
module.exports = { reflowCaptions, validBatch };
