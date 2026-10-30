const { execFile } = require('node:child_process');
const path = require('node:path');
const language = require('./language.cjs');
const cache = new Map();
let busy = false;
async function lookupContext(data) {
  if (data.pos !== 'noun' || !Number.isInteger(data.start) || !Number.isInteger(data.end) ||
      data.start < 0 || data.end > data.sentence.length || data.sentence.slice(data.start, data.end) !== data.word) return [];
  const candidates = await language.homophones(data.word, data.reading);
  if (!candidates.length) return [];
  const key = JSON.stringify(data);
  if (cache.has(key)) return cache.get(key);
  const fallback = () => (candidates.length === 1 ? candidates : []).map(c => ({ entry: c.entry, form: c.form, likely: false }));
  if (busy) return fallback();
  busy = true;
  const promise = new Promise(resolve => {
    const child = execFile(path.join(__dirname, '../.venv/bin/python'), [path.join(__dirname, 'lookup_context.py')],
      { timeout: 20000, maxBuffer: 128000 }, (error, stdout) => {
        busy = false;
        try {
          if (error) throw error;
          const ranks = JSON.parse(stdout);
          if (!Array.isArray(ranks) || ranks.length !== candidates.length) throw new Error('Invalid context ranking');
          const ranked = ranks.map(r => {
            const candidate = candidates.find(c => c.form === r.form);
            if (!candidate) throw new Error('Unknown spelling');
            return { entry: candidate.entry, form: candidate.form, likely: r.likely === true };
          });
          resolve(ranked[0]?.likely || candidates.length === 1 ? ranked.slice(0, 1) : []);
        } catch { resolve(fallback()); }
      });
    child.stdin?.on('error', () => {});
    child.stdin?.end(JSON.stringify({ ...data, start: [...data.sentence.slice(0, data.start)].length, end: [...data.sentence.slice(0, data.end)].length, alternatives: candidates.map(c => ({ form: c.form })) }));
  });
  if (cache.size >= 80) cache.delete(cache.keys().next().value);
  cache.set(key, promise);
  return promise;
}
module.exports = { lookupContext };
