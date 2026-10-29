const fs = require('node:fs');
const path = require('node:path');
const kuromoji = require('kuromoji');
let ready;
const hira = text => (text || '').replace(/[ァ-ヶ]/g, c => String.fromCharCode(c.charCodeAt(0) - 0x60));
const posLabels = { 名詞: 'noun', 動詞: 'verb', 形容詞: 'adjective', 助詞: 'particle', 助動詞: 'auxiliary', 副詞: 'adverb', 接続詞: 'conjunction', 連体詞: 'determiner', 記号: 'punctuation', 接頭詞: 'prefix', 感動詞: 'interjection' };
async function initialize() {
  if (!ready) ready = (async () => {
    const dictionary = JSON.parse(await fs.promises.readFile(path.join(__dirname, '../.data/jmdict.json'), 'utf8'));
    const index = new Map();
    for (const entry of dictionary.words) {
      for (const form of new Set([...entry.kanji, ...entry.kana].map(k => k.text))) {
        const matches = index.get(form) || [];
        matches.push(entry); index.set(form, matches);
      }
    }
    const tokenizer = await new Promise((resolve, reject) => kuromoji.builder({ dicPath: path.join(path.dirname(require.resolve('kuromoji/package.json')), 'dict') }).build((error, value) => error ? reject(error) : resolve(value)));
    return { index, tokenizer, tags: dictionary.tags };
  })().catch(error => { ready = null; throw error; });
  return ready;
}
function dictionaryEntry(entry, tags) {
  return {
    slug: `jmdict-${entry.id}`,
    japanese: entry.kana.map(k => ({ word: entry.kanji.find(w => !k.appliesToKanji || k.appliesToKanji.includes('*') || k.appliesToKanji.includes(w.text))?.text, reading: k.text })),
    senses: entry.sense.map(s => ({ english_definitions: s.gloss.filter(g => g.lang === 'eng').map(g => g.text), parts_of_speech: s.partOfSpeech.map(tag => tags[tag] || tag) })),
  };
}
async function lookup(word) {
  const { index, tags } = await initialize();
  return (index.get(word) || []).slice(0, 5).map(entry => dictionaryEntry(entry, tags));
}
const auxiliaries = { ます: 'polite', た: 'past', ない: 'negative', ぬ: 'negative', ん: 'negative', たい: 'desire', れる: 'passive / potential', られる: 'passive / potential', せる: 'causative', させる: 'causative', う: 'volitional', です: 'polite copula', だ: 'copula' };
const patterns = [ ['について', 'about / concerning'], ['として', 'as / in the role of'], ['なければならない', 'must / have to'], ['かもしれない', 'might / may'], ['わけではない', 'does not necessarily mean'], ['ことができる', 'can / be able to'] ];
async function analyze(text, grouped = true) {
  const { index, tokenizer } = await initialize();
  const raw = tokenizer.tokenize(text);
  let offset = 0;
  const tokens = raw.map(t => {
    const start = text.indexOf(t.surface_form, offset);
    offset = start + t.surface_form.length;
    return { text: t.surface_form, start, end: offset, lemma: t.basic_form === '*' ? t.surface_form : t.basic_form, reading: hira(t.reading === '*' ? '' : t.reading), pos: posLabels[t.pos] || t.pos, detail: t.pos_detail_1, word: t.pos !== '記号' && !/^\s+$/.test(t.surface_form), grammar: [] };
  });
  if (!grouped) return tokens;
  const result = [];
  for (let i = 0; i < tokens.length;) {
    const head = tokens[i];
    let end = i + 1;
    const grammar = [];
    const remaining = text.slice(head.start);
    const pattern = patterns.find(([surface]) => remaining.startsWith(surface) && tokens.some(t => t.end === head.start + surface.length));
    if (pattern) {
      while (end < tokens.length && tokens[end - 1].end < head.start + pattern[0].length) end++;
      grammar.push(pattern[1]);
    } else if (head.pos === 'noun' || head.pos === 'prefix') {
      let best = end;
      for (let j = end; j < Math.min(tokens.length, i + 5) && tokens[j].pos === 'noun' && tokens[j].start === tokens[j - 1].end; j++) {
        if (index.has(text.slice(head.start, tokens[j].end))) best = j + 1;
      }
      end = best;
    }
    const suruVerb = !pattern && head.pos === 'noun' && head.detail === 'サ変接続' && tokens[end]?.lemma === 'する';
    if (suruVerb) { end++; grammar.push('suru verb'); }
    if (!pattern && (suruVerb || ['verb', 'adjective'].includes(head.pos))) {
      while (end < tokens.length && tokens[end].start === tokens[end - 1].end) {
        const t = tokens[end];
        if (t.pos === 'auxiliary') { if (auxiliaries[t.lemma]) grammar.push(auxiliaries[t.lemma]); end++; }
        else if (['て', 'で'].includes(t.text) && tokens[end + 1]?.pos === 'verb' && tokens[end + 1].detail === '非自立') { grammar.push('て-form construction'); end += 2; }
        else break;
      }
    }
    const part = tokens.slice(i, end);
    result.push({ ...head, pos: suruVerb ? 'verb' : head.pos, text: text.slice(head.start, part.at(-1).end), end: part.at(-1).end, lemma: pattern ? pattern[0] : !suruVerb && head.pos === 'noun' && end > i + 1 ? text.slice(head.start, part.at(-1).end) : head.lemma, reading: part.map(t => t.reading || t.text).join(''), grammar: [...new Set(grammar)] });
    i = end;
  }
  return result;
}
module.exports = { initialize, lookup, analyze };
