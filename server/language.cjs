const fs = require('node:fs');
const path = require('node:path');
const kuromoji = require('kuromoji');
const names = require('./names.cjs');
const { grammarEntry } = require('./grammar.cjs');
const pitch = require('./pitch.cjs');
const { verbForms } = require('./verb-forms.cjs');
let ready;
let englishIndex;
const normalizeEnglish = text => text.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/^(?:to|an?|the)\s+/, '').replace(/\s+/g, ' ').trim();
const englishTerms = text => normalizeEnglish(text).match(/[a-z0-9]+/g) || [];
const hira = text => (text || '').replace(/[ァ-ヶ]/g, c => String.fromCharCode(c.charCodeAt(0) - 0x60));
const posLabels = { 名詞: 'noun', 動詞: 'verb', 形容詞: 'adjective', 助詞: 'particle', 助動詞: 'auxiliary', 副詞: 'adverb', 接続詞: 'conjunction', 連体詞: 'determiner', 記号: 'punctuation', 接頭詞: 'prefix', 感動詞: 'interjection', フィラー: 'interjection' };
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
    // Spoken Japanese often drops を inside dictionary-attested expressions.
    // Build reversible aliases from actual written/read forms, never invent a gloss.
    const spoken = new Map();
    for (const entry of dictionary.words) {
      if (!entry.sense.some(s=>s.partOfSpeech.some(p=>/^v/.test(p)))) continue;
      for (const form of [...entry.kanji,...entry.kana].map(x=>x.text)) {
        if (!/^[^を\s]+を[^を\s]+$/u.test(form)) continue;
        const [prefix,verb]=form.split('を');
        const aliases = [prefix+verb];
        for (const kana of entry.kana) if (kana.text.includes('を')) aliases.push(kana.text.split('を')[0]+verb);
        for (const alias of aliases) {
          const matches=spoken.get(alias)||[];
          if (!matches.some(x=>x.entry.id===entry.id)) matches.push({entry,lemma:form});
          spoken.set(alias,matches);
        }
      }
    }
    const stems = new Map();
    const godan = {う:'い',く:'き',ぐ:'ぎ',す:'し',つ:'ち',ぬ:'に',ぶ:'び',む:'み',る:'り'};
    for(const entry of dictionary.words){
      const pos=entry.sense.flatMap(s=>s.partOfSpeech);
      const ichidan=pos.some(p=>p==='v1'||p==='v1-s');
      const five=pos.some(p=>/^v5/.test(p));
      if(!ichidan&&!five)continue;
      for(const form of [...entry.kanji,...entry.kana]){
        const text=form.text, ending=text.at(-1);
        const stem=ichidan&&ending==='る'?text.slice(0,-1):five&&godan[ending]?text.slice(0,-1)+godan[ending]:'';
        if(stem){const values=stems.get(stem)||[];if(!values.some(x=>x.entry.id===entry.id))values.push({entry,lemma:text});stems.set(stem,values);}
      }
    }
    const tokenizer = await new Promise((resolve, reject) => kuromoji.builder({ dicPath: path.join(path.dirname(require.resolve('kuromoji/package.json')), 'dict') }).build((error, value) => error ? reject(error) : resolve(value)));
    return { index, forms: [...index.keys()].sort(), words: dictionary.words, tokenizer, stems, spoken, tags: dictionary.tags };
  })().catch(error => { ready = null; throw error; });
  return ready;
}
function dictionaryEntry(entry, tags, preferred = '', preferredReading = '') {
  const kanji=entry.kanji.find(k=>k.text===preferred)?.text;
  const kana=entry.kana.filter(k=>(!preferredReading||k.text===preferredReading)&&(!kanji||!k.appliesToKanji||k.appliesToKanji.includes('*')||k.appliesToKanji.includes(kanji)));
  const readings=kana.length?kana:entry.kana;
  const allowed=(list,form)=>!form||!list?.length||list.includes('*')||list.includes(form);
  return {
    slug: `jmdict-${entry.id}`, source:'JMdict',
    pitch:readings.flatMap(k=>[...entry.kanji.map(w=>w.text),k.text].flatMap(form=>pitch.lookup(form,k.text))).filter((v,i,all)=>all.findIndex(o=>o.reading===v.reading&&o.downstep===v.downstep)===i),
    japanese:readings.map(k=>({word:entry.kanji.filter(w=>allowed(k.appliesToKanji,w.text)).sort((a,b)=>Number(b.text===preferred)-Number(a.text===preferred))[0]?.text,reading:k.text})),
    senses:entry.sense.filter(s=>allowed(s.appliesToKanji,kanji)&&allowed(s.appliesToKana,preferredReading)).map(s=>({english_definitions:s.gloss.filter(g=>g.lang==='eng').map(g=>g.text),parts_of_speech:s.partOfSpeech.map(tag=>tags[tag]||tag)})),
  };
}
const lookupCache=new Map(),analysisCache=new Map();
function remember(cache,key,run,max=600){
  if(cache.has(key)){const value=cache.get(key);cache.delete(key);cache.set(key,value);return value;}
  const value=Promise.resolve().then(run).catch(error=>{cache.delete(key);throw error;});cache.set(key,value);if(cache.size>max)cache.delete(cache.keys().next().value);return value;
}
function lookup(word,options={}){return remember(lookupCache,JSON.stringify([word.normalize('NFKC').trim(),options.pos,options.proper,options.reading]),()=>lookupUncached(word,options));}
function honorificBase(word,index){
  if(index.has(word)||!/^([おご御])(.{2,})$/u.test(word))return null;
  const base=word.slice(1), entries=(index.get(base)||[]).filter(e=>e.sense.some(s=>s.partOfSpeech.some(p=>['n','vs','adj-na'].includes(p))));
  return entries.length?{base,entries}:null;
}
function verbBase(lemma,index){
  if(index.has(lemma))return null;
  const rows={え:'う',け:'く',げ:'ぐ',せ:'す',て:'つ',ね:'ぬ',べ:'ぶ',め:'む',れ:'る'};
  const aRows={わ:'う',か:'く',が:'ぐ',さ:'す',た:'つ',な:'ぬ',ば:'ぶ',ま:'む',ら:'る'};
  const candidates=[];
  for(const [suffix,label] of [['れる','passive'],['せる','causative']])if(lemma.endsWith(suffix)&&aRows[lemma.at(-suffix.length-1)])candidates.push([lemma.slice(0,-suffix.length-1)+aRows[lemma.at(-suffix.length-1)],label,/^v5/]);
  for(const [suffix,label] of [['られる','passive / potential'],['させる','causative']])if(lemma.endsWith(suffix))candidates.push([lemma.slice(0,-suffix.length)+'る',label,/^v1/]);
  if(lemma.endsWith('る')&&rows[lemma.at(-2)])candidates.push([lemma.slice(0,-2)+rows[lemma.at(-2)],'potential',/^v5/]);
  return candidates.find(([base,,pos])=>(index.get(base)||[]).some(entry=>entry.sense.some(s=>s.partOfSpeech.some(p=>pos.test(p)))))||null;
}
async function lookupUncached(word, options = {}) {
  word=word.normalize('NFKC').trim().replace(/[!！?？。、…]+$/u, '');
  const grammatical = grammarEntry(word, options);
  if (grammatical) return [grammatical];
  const { index, tags, stems, tokenizer, spoken } = await initialize();
  let matches=(index.get(word)||index.get(hira(word))||[]).map(entry=>({entry,lemma:word,by:'exact'}));
  if(!matches.length&&!options.proper) {
    const emphatic = word.replace(/[っッー〜～]+$/u,'');
    const interjections = (index.get(emphatic)||[]).filter(e=>e.sense.some(s=>s.partOfSpeech.includes('int')));
    if(emphatic!==word&&interjections.length) matches=interjections.map(entry=>({entry,lemma:emphatic,by:'spoken ending'}));
    if(!matches.length&&spoken.get(word)?.length===1) matches=spoken.get(word).map(x=>({...x,by:'omitted particle'}));
    if(!matches.length) matches=verbForms(word,index).map(x=>({...x,by:'inflection'}));
  }
  if(!matches.length&&!options.proper){const base=honorificBase(word,index);if(base)matches=base.entries.map(entry=>({entry,lemma:base.base,by:'honorific'}));}
  if(!matches.length)matches=(stems.get(word)||stems.get(hira(word))||[]).map(x=>({...x,by:'inflection'}));
  if(!matches.length){
    const tokens=await analyze(word);
    if(tokens.length===1&&tokens[0].text===word&&tokens[0].lemma!==word)
      matches=(index.get(tokens[0].lemma)||[]).map(entry=>({entry,lemma:tokens[0].lemma,by:tokens[0].match==='reading'?'reading':'inflection'}));
  }
  if(!matches.length&&!options.proper){
    const reading=hira(options.reading||tokenizer.tokenize(word).map(t=>t.reading==='*'?t.surface_form:t.reading||t.surface_form).join(''));
    if(reading&&reading!==word)matches=(index.get(reading)||[]).map(entry=>({entry,lemma:entry.kanji[0]?.text||reading,by:'reading'}));
    if(!matches.length&&reading)matches=(stems.get(reading)||[]).map(x=>({...x,by:'reading'}));
  }
  const requestedReading=hira(options.reading||'');
  const matchingReading=(entry)=>entry.kana.some(k=>k.text===requestedReading)?requestedReading:(stems.get(requestedReading)||[]).find(x=>x.entry.id===entry.id)?.lemma||'';
  const pronounced = requestedReading ? matches.filter(x => matchingReading(x.entry)) : [];
  if (pronounced.length) matches = pronounced;
  const fitsPOS = entry => entry.sense.some(s=>s.partOfSpeech.some(p=>options.pos==='interjection'?p==='int':options.pos==='verb'?/^v/.test(p):options.pos==='adjective'?/^adj/.test(p):options.pos==='noun'?/^n/.test(p):options.pos==='determiner'?p==='adj-pn':options.pos==='adverb'?/^adv/.test(p):options.pos==='conjunction'?p==='conj':options.pos==='prefix'?p==='pref':false));
  if(options.pos==='interjection'&&matches.some(x=>fitsPOS(x.entry)))matches=matches.filter(x=>fitsPOS(x.entry));
  matches.sort((a,b)=>Number(fitsPOS(b.entry))-Number(fitsPOS(a.entry))||Number(!!matchingReading(b.entry))-Number(!!matchingReading(a.entry)));
  const seen=new Set();
  const general=matches.filter(x=>!seen.has(x.entry.id)&&seen.add(x.entry.id)).slice(0,5).map(({entry,lemma,by})=>({...dictionaryEntry(entry,tags,lemma,matchingReading(entry)),matchedBy:by,matchedForm:lemma}));
  const named = options.proper || !general.length ? names.lookup(word, options.reading) : [];
  return options.proper ? [...named, ...general] : [...general, ...named];
}
const searchCache = new Map();
function search(query) {
  return remember(searchCache, query.normalize('NFKC').trim(), () => searchUncached(query), 120);
}
async function searchUncached(query) {
  const { index, forms, words, tags } = await initialize();
  const text = query.normalize('NFKC').trim();
  if (!text || text.length > 120) return [];
  const japanese = /[ぁ-ヿ㐀-鿿々]/.test(text);
  const candidates = new Set();
  let phraseLemma = '';
  if (japanese) {
    for (const entry of index.get(text) || index.get(hira(text)) || []) candidates.add(entry);
    // Exact headwords need no morphology. For inflections, use the lemma only
    // when analysis covers the whole query; otherwise a sentence search would
    // misleadingly return definitions for just its first word.
    if (!candidates.size) {
      const tokens = await analyze(text);
      if (tokens.length === 1 && tokens[0].text === text) {
        phraseLemma = tokens[0].lemma || '';
        for (const entry of index.get(phraseLemma) || []) candidates.add(entry);
      }
    }
    let low = 0, high = forms.length;
    while (low < high) { const mid = (low + high) >>> 1; if (forms[mid] < text) low = mid + 1; else high = mid; }
    for (let i = low; i < forms.length && forms[i].startsWith(text) && candidates.size < 150; i++) for (const entry of index.get(forms[i])) candidates.add(entry);
  } else {
    if (!englishIndex) {
      englishIndex = new Map();
      for (const entry of words) {
        const terms = new Set(entry.sense.flatMap(s => s.gloss.filter(g => g.lang === 'eng').flatMap(g => englishTerms(g.text))));
        for (const term of terms) { if (!englishIndex.has(term)) englishIndex.set(term, new Set()); englishIndex.get(term).add(entry); }
      }
    }
    const terms = [...new Set(englishTerms(text))];
    if (!terms.length) return [];
    const lists = terms.map(term => englishIndex.get(term));
    if (lists.some(list => !list)) return names.lookup(text);
    lists.sort((a, b) => a.size - b.size);
    for (const entry of lists[0]) if (lists.every(list => list.has(entry))) candidates.add(entry);
  }
  const normalized = normalizeEnglish(text);
  const wanted = englishTerms(text);
  const score = entry => {
    const common = [...entry.kanji, ...entry.kana].some(form => form.common) ? 20 : 0;
    if (japanese) return common + ([...entry.kanji, ...entry.kana].some(form => form.text === text) ? 200 : 0) + ([...entry.kanji, ...entry.kana].some(form => form.text === phraseLemma) ? 100 : 0);
    const definitions = entry.sense.flatMap(s => s.gloss.filter(g => g.lang === 'eng').map(g => normalizeEnglish(g.text)));
    const primary = entry.sense[0]?.gloss.filter(g => g.lang === 'eng').map(g => normalizeEnglish(g.text)) || [];
    return common + (primary[0] === normalized ? 500 + (primary.length === 1 ? 30 : 0) : primary.includes(normalized) ? 400 : definitions.includes(normalized) ? 200 : definitions.some(d => d.startsWith(normalized)) ? 80 : 0);
  };
  const results = [...candidates].map(entry => ({ entry, score: score(entry) })).sort((a, b) => b.score - a.score || String(a.entry.id).localeCompare(String(b.entry.id))).slice(0, 20).map(({ entry }) => {
    const result = dictionaryEntry(entry, tags);
    if (!japanese) {
      const relevance = sense => sense.english_definitions.some(d => normalizeEnglish(d) === normalized) ? 2 : sense.english_definitions.some(d => wanted.every(term => englishTerms(d).includes(term))) ? 1 : 0;
      result.senses.sort((a, b) => relevance(b) - relevance(a));
    }
    return result;
  });
  return [...results.slice(0, 15), ...names.lookup(text)].slice(0, 20);
}
const auxiliaries = { ます: 'polite', た: 'past', ない: 'negative', ぬ: 'negative', ん: 'negative', たい: 'desire', れる: 'passive / potential', られる: 'passive / potential', せる: 'causative', させる: 'causative', う: 'volitional', です: 'polite copula', だ: 'copula' };
const patterns = [ ['について', 'about / concerning'], ['として', 'as / in the role of'], ['なければならない', 'must / have to'], ['かもしれない', 'might / may'], ['わけではない', 'does not necessarily mean'], ['ことができる', 'can / be able to'] ];
function analyze(text,grouped=true){return remember(analysisCache,JSON.stringify([text,grouped]),()=>analyzeUncached(text,grouped));}
async function analyzeUncached(text, grouped = true) {
  const { index, tokenizer, stems, spoken } = await initialize();
  const raw = tokenizer.tokenize(text);
  let offset = 0;
  const tokens = raw.map(t => {
    const start = text.indexOf(t.surface_form, offset);
    offset = start + t.surface_form.length;
    const lemma=t.basic_form==='*'?t.surface_form:t.basic_form;
    const base=t.pos==='動詞'?verbBase(lemma,index):null;
    return { text: t.surface_form, start, end: offset, lemma:base?.[0]||lemma, reading: hira(t.reading === '*' ? '' : t.reading), pos: posLabels[t.pos] || t.pos, detail: t.pos_detail_1, proper: t.pos_detail_1 === '固有名詞', word: t.pos !== '記号' && !/^\s+$/.test(t.surface_form), grammar: base?[base[1]]:[] };
  });
  if (!grouped) return tokens;
  const result = [];
  for (let i = 0; i < tokens.length;) {
    const head = tokens[i];
    let end = i + 1;
    const grammar = [...head.grammar];
    const remaining = text.slice(head.start);
    // Longest dictionary-backed expression, including an inflected final verb.
    // Require an internal particle so ordinary noun grouping keeps its rules.
    let expression = null;
    for (let j = i + 1; j < Math.min(tokens.length, i + 9); j++) {
      const part = tokens.slice(i, j + 1);
      if (part.some(t => !t.word || /\s/.test(t.text)) || part.some((t, n) => n && t.start !== part[n - 1].end)) break;
      const last = tokens[j];
      const surface = text.slice(head.start, last.end);
      const normalized = text.slice(head.start, last.start) + last.lemma;
      const alias = spoken.get(normalized);
      const omitted = alias?.length===1 ? alias[0].lemma : '';
      const internalParticle = part.slice(1,-1).some(t=>t.pos==='particle');
      const lemma = omitted || (internalParticle && (index.has(surface)?surface:index.has(normalized)?normalized:''));
      if (lemma) expression = { lemma, end: j + 1, pos: last.pos, omitted:!!omitted };
    }
    // Continuative compound verbs can be split into a verb plus nominal suffix
    // (すくい + 取り). Join only dictionary-attested stems; keep surface glyphs.
    for(let j=i+1;j<Math.min(tokens.length,i+5);j++){
      const part=tokens.slice(i,j+1);
      if(part.some(t=>!t.word||!['verb','noun','prefix'].includes(t.pos))||part.some((t,n)=>n&&t.start!==part[n-1].end))break;
      const surface=text.slice(head.start,tokens[j].end);
      const hit=stems.get(surface)?.[0];
      if(hit)expression={lemma:hit.lemma,end:j+1,pos:'verb'};
    }
    // Recover complete dictionary verbs before a noun/name misclassification can
    // split 粋 + がってん, or turn katakana シメ + てる into unrelated entries.
    for (let j=i;j<Math.min(tokens.length,i+8);j++) {
      const part=tokens.slice(i,j+1);
      if(part.some(t=>!t.word||/\s/u.test(t.text))||part.some((t,n)=>n&&t.start!==part[n-1].end))break;
      if(part.some(t=>t.pos==='particle'&&!['て','で','じゃ'].includes(t.text)))break;
      if(expression && j+1<expression.end)continue;
      const surface=text.slice(head.start,tokens[j].end);
      if(j===i && head.pos!=='verb' && index.has(head.lemma))continue;
      const matches=verbForms(surface,index);
      if(!matches.length)continue;
      const preferred=matches.find(m=>m.form===head.lemma||m.lemma===head.lemma)||matches[0];
      const sameLemma=matches.every(m=>m.lemma===preferred.lemma);
      const lemma=sameLemma?preferred.lemma:preferred.form;
      // Leave an ordinary, already-correct single-token verb to Kuromoji.
      if(j===i && head.pos==='verb' && head.lemma===lemma)continue;
      expression={lemma,end:j+1,pos:'verb',recovered:true,grammar:preferred.grammar};
    }
    const conjectural = head.pos === 'auxiliary' && ['だ', 'です'].includes(head.lemma) &&
      /^(だろう|でしょう)(?:(?:な|ね)?(?:って|と)|な|ね)?/.exec(remaining);
    if (conjectural) {
      const boundary = head.start + conjectural[0].length;
      const last = tokens.findIndex(t => t.end === boundary);
      if (last >= i) {
        expression = { lemma: conjectural[1], end: last + 1, pos: 'auxiliary' };
        grammar.push('conjecture / probably');
        if (/(って|と)$/.test(conjectural[0])) grammar.push('spoken quotation');
      }
    }
    const pattern = !expression && patterns.find(([surface]) => remaining.startsWith(surface) && tokens.some(t => t.end === head.start + surface.length));
    if (expression) { end = expression.end; grammar.push(...(expression.grammar||[])); if(!expression.recovered)grammar.push('expression'); if(expression.omitted)grammar.push('spoken particle omission'); } else if (pattern) {
      while (end < tokens.length && tokens[end - 1].end < head.start + pattern[0].length) end++;
      grammar.push(pattern[1]);
    } else if (head.pos === 'noun' || head.pos === 'prefix') {
      let best = end;
      for (let j = end; j < Math.min(tokens.length, i + 5) && tokens[j].pos === 'noun' && tokens[j].start === tokens[j - 1].end; j++) {
        const surface=text.slice(head.start,tokens[j].end);
        if (index.has(surface) || (head.pos==='prefix'&&honorificBase(surface,index)) || (head.proper && tokens.slice(i, j + 1).every(t => t.proper) && names.has(surface))) best = j + 1;
      }
      end = best;
    }
    const compoundNoun = !expression && !pattern && ['noun', 'prefix'].includes(head.pos) && end > i + 1;
    const nominalSurface=text.slice(head.start,tokens[end-1].end), honorific=['noun','prefix'].includes(head.pos)?honorificBase(nominalSurface,index):null;
    if(honorific)grammar.push('honorific prefix');
    const nounLemma = expression ? expression.lemma : honorific ? honorific.base : compoundNoun ? nominalSurface : head.lemma;
    const suruVerb = !expression && !pattern && (head.pos === 'noun' || compoundNoun) && tokens[end - 1].detail === 'サ変接続' && tokens[end]?.lemma === 'する';
    if (suruVerb) { end++; grammar.push('suru verb'); }
    if (!pattern && (suruVerb || ['verb', 'adjective'].includes(expression?.pos || head.pos))) {
      while (end < tokens.length && tokens[end].start === tokens[end - 1].end) {
        const t = tokens[end];
        if(t.pos==='verb'&&t.detail==='接尾'&&['せる','させる','れる','られる'].includes(t.lemma)){grammar.push(auxiliaries[t.lemma]);end++;}
        else if (t.pos === 'auxiliary' || (t.pos==='adjective'&&t.lemma==='ない'&&t.detail==='非自立')) { if (auxiliaries[t.lemma]) grammar.push(auxiliaries[t.lemma]); end++; }
        else if (t.pos==='verb' && t.text==='てる' && /^(し|き|来)$/u.test(tokens[end-1].text)) { grammar.push('て-form construction', 'contracted progressive: ～ている'); end++; }
        else if (['て', 'で'].includes(t.text) && tokens[end + 1]?.pos === 'verb' && tokens[end + 1].detail === '非自立') { grammar.push('て-form construction'); end += 2; }
        else if (['て', 'で'].includes(t.text)) { grammar.push('て-form'); end++; }
        else break;
      }
    }
    let interjectionLemma = '';
    if (head.pos === 'interjection') {
      for (let j=end;j<Math.min(tokens.length,i+5);j++) {
        if(tokens[j].start!==tokens[j-1].end || !(tokens[j].pos==='interjection' || /^[っッー〜～]+$/u.test(tokens[j].text))) break;
        const surface=text.slice(head.start,tokens[j].end), base=index.has(surface)?surface:surface.replace(/[っッー〜～]+$/u,'');
        if((index.get(base)||[]).some(e=>e.sense.some(s=>s.partOfSpeech.includes('int')))) { end=j+1;interjectionLemma=base;grammar.push('expressive ending'); }
      }
    }
    const verbal = suruVerb || (expression?.pos || head.pos) === 'verb';
    if (verbal && tokens[end]?.text==='な' && tokens[end].start===tokens[end-1].end && /ん$/u.test(tokens[end-1].text) && /る$/u.test(nounLemma)) {
      end++; grammar.push('contracted prohibition: ～るな');
    }
    const part = tokens.slice(i, end);
    result.push({ ...head, ...(expression?.recovered?{proper:false}:{}), pos: expression ? expression.pos : suruVerb ? 'verb' : compoundNoun ? 'noun' : head.pos, text: text.slice(head.start, part.at(-1).end), end: part.at(-1).end, lemma: pattern ? pattern[0] : interjectionLemma || nounLemma, reading: hira(part.map(t => t.reading || t.text).join('')), grammar: [...new Set(grammar)] });
    i = end;
  }
  return result;
}
async function homophones(word, reading) {
  const { index, tags } = await initialize();
  const canonical = index.get(word) || [];
  const readings = new Set(canonical.flatMap(e => e.kana.filter(k => !k.appliesToKanji || k.appliesToKanji.includes('*') || k.appliesToKanji.includes(word)).map(k => k.text)).filter(r => r === hira(reading)));
  if (!readings.size || !canonical.some(e => e.kanji.some(k => k.text === word))) return [];
  const found = [];
  for (const r of readings) for (const e of index.get(r) || []) {
    const form = e.kanji.find(k => k.text !== word && /^[㐀-鿿々]+$/.test(k.text) && e.kana.some(kana => kana.text === r && (!kana.appliesToKanji || kana.appliesToKanji.includes('*') || kana.appliesToKanji.includes(k.text))));
    if (!form || e.kanji.some(k => k.text === word) || !e.sense.some(s => s.partOfSpeech.some(p => ['n', 'vs', 'adj-na'].includes(p)))) continue;
    const entry = dictionaryEntry(e, tags);
    entry.japanese = [{ word: form.text, reading: r }];
    found.push({ entry, form: form.text, common: [...e.kana, ...e.kanji].some(k => k.common) });
  }
  return found.sort((a, b) => Number(b.common) - Number(a.common)).filter((c, i, all) => all.findIndex(other => other.form === c.form) === i).slice(0, 8);
}
// Exact dictionary-attested expressions around a selected span, including
// ambiguous te-form stems (通っ may be 通る, 通う, or 通つ). Never alter captions.
async function contextPhrases(sentence, start, end) {
  const { index, tags, tokenizer, spoken } = await initialize();
  const raw = tokenizer.tokenize(sentence);
  let offset = 0;
  const tokens = raw.map(t => {
    const begin = sentence.indexOf(t.surface_form, offset);
    offset = begin + t.surface_form.length;
    return { ...t, start: begin, end: offset };
  });
  const results = new Map();
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i].start > start || start - tokens[i].start > 24) continue;
    for (let j = i; j < Math.min(tokens.length, i + 9); j++) {
      const last = tokens[j];
      if (last.pos === '記号') break;
      let coverageEnd = last.end;
      if (last.pos === '動詞') {
        for (let k = j + 1; k < tokens.length && coverageEnd < end; k++) {
          const tail = tokens[k];
          const auxiliary = tail.pos === '助動詞' ||
            (tail.pos === '助詞' && ['て', 'で'].includes(tail.surface_form)) ||
            (tail.pos === '動詞' && tail.pos_detail_1 === '非自立' && ['いる', 'おる', 'ある'].includes(tail.basic_form));
          if (tail.start !== coverageEnd || !auxiliary) break;
          coverageEnd = tail.end;
        }
      }
      if (coverageEnd < end || coverageEnd - tokens[i].start <= end - start) continue;
      const prefix = sentence.slice(tokens[i].start, last.start);
      const forms = [sentence.slice(tokens[i].start, last.end), prefix + last.basic_form];
      if (last.pos === '動詞') {
        const ending = last.surface_form.at(-1);
        const replacements = { 'っ': ['う', 'つ', 'る'], 'ん': ['む', 'ぶ', 'ぬ'], 'い': ['く', 'ぐ'] }[ending] || [];
        for (const suffix of replacements) forms.push(prefix + last.surface_form.slice(0, -1) + suffix);
      }
      for (const alias of [...forms]) if (spoken.get(alias)?.length===1) forms.push(spoken.get(alias)[0].lemma);
      for (const form of forms) {
        if (!index.has(form) || results.has(form)) continue;
        const entries = index.get(form);
        results.set(form, { form, senses: entries.slice(0, 2).flatMap(e => dictionaryEntry(e, tags, form).senses).slice(0, 4) });
      }
    }
  }
  return [...results.values()].sort((a, b) => b.form.length - a.form.length).slice(0, 3);
}
module.exports = { initialize, lookup, search, analyze, homophones, contextPhrases };
