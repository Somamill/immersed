/* Count-based language plausibility. No text generation or remote model calls. */
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const FILE = path.join(__dirname, '../.data/context-ngrams.sqlite');
const VERSION = 'jpn-tatoeba-trigram-v1';
const gramKey = tokens => tokens.join('\u001f');
const lexical = token => token.basic_form && token.basic_form !== '*' ? token.basic_form : token.surface_form;
function tokenize(tokenizer, text) {
  let cursor = 0;
  return tokenizer.tokenize(text).map(t => {
    const start = text.indexOf(t.surface_form, cursor);
    cursor = (start < 0 ? cursor : start) + t.surface_form.length;
    return { value: lexical(t), start: cursor - t.surface_form.length, end: cursor, pos: t.pos,
      reading: t.reading || t.surface_form,
      protected: ['固有名詞', '数'].includes(t.pos_detail_1) || (t.word_type === 'UNKNOWN' && t.pos !== '記号') };
  });
}
class StatisticalContext {
  constructor(file = FILE) {
    if (!fs.existsSync(file)) return;
    try {
      this.db = new DatabaseSync(file, { readOnly: true });
      this.meta = JSON.parse(this.db.prepare('SELECT value FROM metadata WHERE key = ?').get('corpus').value);
      if (this.meta.version !== VERSION) throw new Error('Wrong corpus format');
      this.query = this.db.prepare('SELECT count, documents FROM grams WHERE key = ?');
    } catch { this.db?.close(); this.db = null; }
  }
  get(tokens) { return this.query?.get(gramKey(tokens)) || { count: 0, documents: 0 }; }
  probability(history, word) {
    let p = (this.get([word]).count + .1) / (this.meta.tokens + .1 * (this.meta.vocabulary + 1));
    for (let n = 1; n <= Math.min(2, history.length); n++) {
      const prefix = history.slice(-n), denominator = this.get(prefix).count;
      p = (this.get([...prefix, word]).count + 5 * p) / (denominator + 5);
    }
    return p;
  }
  score(tokens, start = 0, end = Infinity) {
    if (!this.db) return { ready: false };
    const values = ['<s>', '<s>', ...tokens.map(t => t.value), '</s>'];
    const first = tokens.findIndex(t => t.end > start), last = tokens.findLastIndex(t => t.start < end);
    if (first < 0 || last < first) return { ready: true, supported: false, score: 0 };
    let score = 0;
    for (let i = first + 2; i <= Math.min(values.length - 1, last + 4); i++)
      score += Math.log(this.probability(values.slice(Math.max(0, i - 2), i), values[i]));
    // Independent left/right adjacent-word evidence; sentence boundaries alone don't count.
    const left = first > 0 ? this.get([values[first + 1], values[first + 2]]).documents : 0;
    const right = last < tokens.length - 1 ? this.get([values[last + 2], values[last + 3]]).documents : 0;
    return { ready: true, score, left, right, supported: left >= 3 && right >= 3 };
  }
  close() { this.db?.close(); }
}
let current;
function model() { if (!current?.db) current = new StatisticalContext(); return current; }
function rankSpellings(data, candidates, tokenizer, scorer = model()) {
  const original = tokenize(tokenizer, data.sentence);
  const originalSpan = original.filter(t => t.end > data.start && t.start < data.end);
  if (!originalSpan.length || originalSpan.some(t => t.protected || t.pos !== '名詞')) return { status: 'protected-word', alternatives: [] };
  const source = scorer.score(original, data.start, data.end);
  if (!source.ready) return { status: 'unavailable', alternatives: [] };
  const reading = original.map(t => t.reading).join('');
  const variants = candidates.flatMap(candidate => {
    const text = data.sentence.slice(0, data.start) + candidate.form + data.sentence.slice(data.end);
    const tokens = tokenize(tokenizer, text);
    const span = tokens.filter(t => t.end > data.start && t.start < data.start + candidate.form.length);
    if (span.length !== originalSpan.length || tokens.length !== original.length || tokens.map(t => t.reading).join('') !== reading || span.some(t => t.protected || t.pos !== '名詞')) return [];
    const stats = scorer.score(tokens, data.start, data.start + candidate.form.length);
    return [{ ...candidate, statistics: stats, gain: stats.score - source.score }];
  }).sort((a, b) => b.gain - a.gain);
  const best = variants[0];
  const likely = !!best && best.statistics.supported && best.gain >= Math.log(4) &&
    (!variants[1] || best.gain - variants[1].gain >= Math.log(2));
  return { status: likely ? 'supported' : 'insufficient-evidence', alternatives: likely ? [{ ...best, likely: true }] : [], evaluated: variants, source };
}
module.exports = { StatisticalContext, VERSION, gramKey, tokenize, rankSpellings, model };
