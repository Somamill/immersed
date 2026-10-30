const language = require('./language.cjs');
const { rankSpellings } = require('./statistical-context.cjs');
const { execFile } = require('node:child_process');
const path = require('node:path');
const cache = new Map();
let busy = false;
function crossCheckSparse(data, candidates) {
  if (busy || !candidates.length) return Promise.resolve([]);
  busy = true;
  return new Promise(resolve => {
    const child = execFile(path.join(__dirname, '../.venv/bin/python'), [path.join(__dirname, 'lookup_context.py')],
      { timeout: 20000, maxBuffer: 128000 }, (error, stdout) => {
        busy = false;
        try {
          if (error) throw error;
          const ranks = JSON.parse(stdout);
          const best = candidates.find(c => c.form === ranks[0]?.form);
          // Sparse corpus evidence needs an additional local model check, and
          // both rankings must prefer this exact pronunciation-preserving form.
          resolve(best && ranks[0].likely === true && best.gain >= Math.log(2) ? [{ ...best, likely: true }] : []);
        } catch { resolve([]); }
      });
    child.stdin?.on('error', () => {});
    child.stdin?.end(JSON.stringify({ ...data, start: [...data.sentence.slice(0, data.start)].length,
      end: [...data.sentence.slice(0, data.end)].length, alternatives: candidates.map(c => ({ form: c.form })) }));
  });
}
async function lookupContext(data) {
  if (data.pos !== 'noun' || !Number.isInteger(data.start) || !Number.isInteger(data.end) ||
      data.start < 0 || data.end > data.sentence.length || data.sentence.slice(data.start, data.end) !== data.word) return [];
  const key = JSON.stringify(data);
  if (cache.has(key)) return cache.get(key);
  const pending = (async () => {
    const candidates = await language.homophones(data.word, data.reading);
    if (!candidates.length) return [];
    const { tokenizer } = await language.initialize();
    const ranked = rankSpellings(data, candidates, tokenizer);
    let alternatives = ranked.alternatives;
    if (!alternatives.length && ranked.evaluated?.[0]?.gain >= Math.log(2)) {
      const crossChecked = await crossCheckSparse(data, ranked.evaluated);
      // Disagreement between the two rankings is never labelled likely.
      if (crossChecked[0]?.form === ranked.evaluated[0].form) alternatives = crossChecked;
    }
    if (!alternatives.length && candidates.length === 1) alternatives = [{ ...candidates[0], likely: false }];
    return alternatives.map(({ entry, form, likely }) => ({ entry, form, likely }));
  })();
  if (cache.size >= 80) cache.delete(cache.keys().next().value);
  cache.set(key, pending);
  try { const result = await pending; if (!result.some(item => item.likely)) cache.delete(key); return result; } catch (error) { cache.delete(key); throw error; }
}
module.exports = { lookupContext };
