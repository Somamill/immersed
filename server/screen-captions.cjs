const language = require('./language.cjs');
const cache = new Map();
function similarity(a, b) {
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 0; i < a.length; i++) {
    const row = [i + 1];
    for (let j = 0; j < b.length; j++) row.push(Math.min(row[j] + 1, previous[j + 1] + 1, previous[j] + (a[i] === b[j] ? 0 : 1)));
    previous = row;
  }
  return 1 - previous[b.length] / Math.max(a.length, b.length, 1);
}
async function pronunciation(text) {
  const compared = text.replace(/(?:ん?です|ます)(?:よ|ね)*[。！？.!?]*$/u, '');
  const tokens = await language.analyze(compared, false);
  return tokens.map(t => t.reading || t.text).join('').replace(/[ァ-ヶ]/g, c => String.fromCharCode(c.charCodeAt(0) - 0x60)).replace(/[^ぁ-ゖー]/g, '');
}
// Normalize comparison sounds only, never the displayed creator caption.
function conversational(reading) {
  return reading.replace(/^(?:それこそ|えーと|あのー?)/u,'').replace(/っていう|とゆう/gu,'という').replace(/とか(?=で|を|が|は|に|も|$)/gu,'');
}
async function quotedEvidence(sentence, text, raw) {
  for(const match of text.matchAll(/[「『“"]([^」』”"\n]{4,60})[」』”"]/gu)) {
    const title=match[1], compounds=title.match(/[一-龯]{4,}/gu) || [];
    if(!compounds.length)continue;
    const reading=await pronunciation(title);
    if(reading.length<8 || !raw.includes(reading.slice(-4)))continue;
    let shared=0,offset=0;
    for(const c of title.match(/[一-龯]/gu)||[]){const at=sentence.indexOf(c,offset);if(at>=0){shared++;offset=at+1;}}
    if(shared<2)continue;
    let attested=true;
    for(const compound of compounds)if(!(await language.lookup(compound)).length){attested=false;break;}
    if(attested)return true;
  }
  return false;
}
async function matchScreenCaption(sentence, lines) {
  if (typeof sentence !== 'string' || sentence.length > 1000 || !Array.isArray(lines) || lines.length > 12 || lines.some(l => typeof l !== 'string' || l.length > 300)) return null;
  const key = JSON.stringify([sentence, lines]);
  if (cache.has(key)) return cache.get(key);
  const raw = await pronunciation(sentence);
  if (raw.length < 10) return null;
  let best = null;
  for (let i = 0; i < lines.length; i++) for (let count = 1; count <= 3 && i + count <= lines.length; count++) {
    const text = lines.slice(i, i + count).join('').trim();
    if ((text.match(/[ぁ-ゖァ-ヺ一-龯]/g) || []).length < 6) continue;
    const reading = await pronunciation(text), ratio = reading.length / raw.length;
    if (ratio < 0.55 || ratio > 1.4) continue;
    const original = similarity(raw, reading), score = Math.max(original, similarity(conversational(raw), conversational(reading)));
    const hasQuote = /[「『“"]/u.test(text);
    const quoted = original < 0.68 && score >= 0.62 && hasQuote && await quotedEvidence(sentence,text,raw);
    if ((original >= 0.68 || (score >= 0.68 && !hasQuote) || quoted) && (!best || score > best.score)) best = { text, score, method: quoted ? 'quoted-dictionary-match' : 'phonetic-match' };
  }
  if (cache.size >= 300) cache.delete(cache.keys().next().value);
  cache.set(key, best);
  return best;
}
module.exports = { matchScreenCaption, similarity };
