const { test } = require('node:test');
const assert = require('node:assert/strict');
const { analyze, lookup, search } = require('../server/language.cjs');
test('unlisted honorific nouns resolve to dictionary bases without stripping ordinary words',async()=>{
  for(const [surface,base,meaning] of [['お便り','便り',/letter|correspondence/],['お考え','考え',/thought|opinion/],['御手紙','手紙',/letter/]]){
    const tokens=await analyze(surface+'について話す。');
    assert.equal(tokens[0].text,surface);assert.equal(tokens[0].lemma,base);
    assert.equal(tokens.map(t=>t.text).join(''),surface+'について話す。');
    assert.ok((await lookup(surface))[0].senses.some(s=>s.english_definitions.some(d=>meaning.test(d))));
    assert.ok((await lookup(tokens[0].lemma,tokens[0])).length);
  }
  assert.equal((await analyze('お腹'))[0].lemma,'お腹');
  assert.deepEqual(await lookup('おzzzzzz'),[]);
});

test('inflected Japanese is grouped, normalized, and resolves through the real installed JMdict', async () => {
  const text = '昨日は日本語を勉強していました。ご飯を食べませんでした。';
  const tokens = await analyze(text);
  assert.equal(tokens.map(t => t.text).join(''), text);
  const study = tokens.find(t => t.text === '勉強していました');
  assert.ok(study, 'noun + suru + auxiliaries should be one learning unit');
  assert.equal(study.lemma, '勉強');
  assert.ok(study.grammar.includes('past'));
  const eat = tokens.find(t => t.text === '食べませんでした');
  assert.equal(eat.lemma, '食べる');
  assert.ok(eat.grammar.includes('negative'));
  assert.ok(eat.grammar.includes('polite'));
  const entries = await lookup(eat.lemma);
  assert.ok(entries.some(e => e.senses.some(s => s.english_definitions.some(d => d.includes('eat')))));
  for (const t of tokens) assert.equal(text.slice(t.start, t.end), t.text);
});

test('dictionary searches English meanings, Japanese readings and inflected words', async () => {
  const english = await search('eat');
  assert.ok(english[0].senses[0].english_definitions.includes('to eat'), 'main meanings should outrank incidental later senses');
  assert.ok(english.some(entry => entry.japanese.some(form => form.word === '食べる')));
  const japanese = await search('食べる');
  assert.ok(japanese.some(entry => entry.senses.some(s => s.english_definitions.includes('to eat'))));
  assert.ok((await search('たべる')).some(entry => entry.japanese.some(form => form.word === '食べる')));
  assert.ok((await search('食べました')).some(entry => entry.japanese.some(form => form.word === '食べる')));
  assert.ok((await search('ice cream')).some(entry => entry.senses.some(s => s.english_definitions.some(d => /ice cream/i.test(d)))));
  assert.deepEqual(await search('zzzzzzzznotaword'), []);
});

test('particle boundaries, compounds, grammar expressions, and raw morphology are preserved', async () => {
  const text = '旅行会社について話しています。';
  const grouped = await analyze(text);
  assert.equal(grouped.map(t => t.text).join(''), text);
  assert.ok(grouped.find(t => t.text === 'について').grammar.includes('about / concerning'));
  const raw = await analyze(text, false);
  assert.ok(raw.length > grouped.length);
  assert.ok(raw.some(t => t.pos === 'particle'));
  assert.ok(grouped.some(t => t.reading));
});

test('names use JMnedict alongside general words, with categories and alternative readings', async () => {
  const named = await lookup('鈴木', { proper: true, reading: 'すずき' });
  assert.equal(named[0].source, 'JMnedict');
  assert.ok(named.some(e => e.japanese.some(j => j.reading === 'すずき')));
  assert.ok(named.some(e => e.senses.some(s => s.parts_of_speech.includes('family or surname'))));
  assert.ok((await search('Suzuki')).some(e => e.source === 'JMnedict'));
  assert.ok((await search('鈴木')).some(e => e.source === 'JMnedict'));
  const text = '鈴木さんは東京に行きました。';
  const tokens = await analyze(text);
  assert.equal(tokens.map(t => t.text).join(''), text);
  assert.equal(tokens.find(t => t.text === '鈴木').proper, true);
  const ordinary = await lookup('食べる');
  assert.equal(ordinary[0].source, 'JMdict');
  assert.ok(ordinary[0].senses.some(s => s.english_definitions.includes('to eat')));
});

test('dictionary-backed prefixes retain the whole noun and its suru inflection', async () => {
  for (const word of ['お名前', 'お勧め', '再利用', '超高速']) {
    const tokens = await analyze(word);
    assert.equal(tokens.length, 1);
    assert.equal(tokens[0].lemma, word);
    assert.ok((await lookup(tokens[0].lemma)).length);
  }
  const reuse = await analyze('再利用していました。');
  assert.equal(reuse[0].text, '再利用していました');
  assert.equal(reuse[0].lemma, '再利用');
  assert.ok(reuse[0].grammar.includes('past'));
});

test('caption reflow joins split words and inflections without changing text or crossing pauses', async () => {
  const { reflowCaptions } = require('../server/caption-reflow.cjs');
  for (const [a, b] of [['日', '本語を話します。'], ['勉強し', 'ていました。'], ['お', '名前を教えてください。'], ['こんに', 'ちは。']]) {
    const cues = [{ start: 0, end: 1, text: a }, { start: 1, end: 3, text: b }];
    assert.deepEqual(await reflowCaptions(cues), [{ start: 0, end: 3, text: a + b }]);
  }
  const separate = [
    [{ start: 0, end: 1, text: '日本語。' }, { start: 1, end: 3, text: '勉強します。' }],
    [{ start: 0, end: 1, text: '日' }, { start: 2, end: 3, text: '本語' }],
    [{ start: 0, end: 1, text: '今日は' }, { start: 1, end: 3, text: '学校です。' }],
    [{ start: 0, end: 4, text: '日' }, { start: 4, end: 8, text: '本語' }],
  ];
  for (const cues of separate) assert.deepEqual(await reflowCaptions(cues), cues);
});

test('dictionary expressions preserve whole 気を抜く across tense and negation', async () => {
  for (const surface of ['気を抜く', '気を抜いた', '気を抜かない', '気を抜いて', '気を抜きました']) {
    const text = `${surface}。`;
    const tokens = await analyze(text);
    assert.equal(tokens[0].text, surface);
    assert.equal(tokens[0].lemma, '気を抜く');
    assert.equal(tokens.map(t => t.text).join(''), text);
    assert.ok((await lookup(tokens[0].lemma))[0].senses.some(s => s.english_definitions.some(d => /relax|guard/i.test(d))));
    assert.ok((await search(surface))[0].japanese.some(j => j.word === '気を抜く'));
  }
  assert.ok(!(await analyze('気。を抜く')).some(t => t.lemma === '気を抜く'));
  assert.ok(!(await analyze('気 を抜く')).some(t => t.lemma === '気を抜く'));
});

test('pitch patterns come from pinned Kanjium and retain multiple recorded accents', async () => {
  const entries = await lookup('食べる');
  assert.ok(entries[0].pitch.some(p => p.reading === 'たべる' && p.downstep === 2));
  const { lookup: accents } = require('../server/pitch.cjs');
  assert.ok(accents('橋', 'はし').some(p => p.downstep === 2));
  assert.ok(accents('箸', 'はし').some(p => p.downstep === 1));
  assert.deepEqual(accents('NOT_A_WORD'), []);
});

test('caption reflow respects explicit clears and carries a terminal clear when joining a word', async () => {
  const { reflowCaptions } = require('../server/caption-reflow.cjs');
  const clear = [{ start: 0, end: 1, text: '日', hardEnd: true }, { start: 1, end: 2, text: '本語' }];
  assert.deepEqual(await reflowCaptions(clear), clear);
  assert.deepEqual(await reflowCaptions([{ start: 0, end: 1, text: '日' }, { start: 1, end: 2, text: '本語', hardEnd: true }]), [{ start: 0, end: 2, text: '日本語', hardEnd: true }]);
});

test('conjectural grammar is one lookup unit and auxiliary う never returns animal nouns', async () => {
  const tokens = await analyze('面白いんだろうなって思いました。');
  const conjecture = tokens.find(t => t.text === 'だろうなって');
  assert.ok(conjecture);
  assert.equal(conjecture.lemma, 'だろう');
  assert.equal(conjecture.pos, 'auxiliary');
  assert.ok(conjecture.grammar.includes('spoken quotation'));
  const entry = await lookup(conjecture.lemma, conjecture);
  assert.equal(entry[0].source, 'Grammar');
  assert.ok(entry[0].senses[0].english_definitions.some(d => /probably/.test(d)));
  const ending = await lookup('う', { pos: 'auxiliary', reading: 'う' });
  assert.equal(ending[0].source, 'Grammar');
  assert.ok(!JSON.stringify(ending).includes('cormorant'));
  assert.ok(JSON.stringify(await lookup('う', { pos: 'noun' })).includes('cormorant'));
  assert.ok((await analyze('そうでしょうね。')).some(t => t.lemma === 'でしょう' && t.pos === 'auxiliary'));
});
test('dictionary offers general same-reading spellings for screenshot examples without changing the source', async () => {
  const { homophones } = require('../server/language.cjs');
  assert.ok((await homophones('自称', 'じしょう')).some(c => c.form === '事象'));
  assert.ok((await homophones('累計', 'るいけい')).some(c => c.form === '類型'));
  assert.deepEqual(await homophones('自称', 'not-the-reading'), []);
  const { key } = require('../server/grammar.cjs');
  assert.notEqual(key({ lemma:'う', pos:'auxiliary' }), key({ lemma:'う', pos:'noun' }));
});

test('corpus ranking generalizes to word sequences and preserves a correct or unsupported source', async () => {
  const { rankSpellings, StatisticalContext } = require('../server/statistical-context.cjs');
  const { initialize, homophones } = require('../server/language.cjs');
  const { tokenizer } = await initialize();
  const scorer = new StatisticalContext();
  assert.ok(scorer.db, 'Run npm run context:setup before language checks');
  const sentence = '明日は公演で友達と遊びます', start = sentence.indexOf('公演');
  const result = rankSpellings({ sentence, start, end: start + 2 }, await homophones('公演', 'こうえん'), tokenizer, scorer);
  assert.equal(result.alternatives[0]?.form, '公園');
  assert.ok(result.alternatives[0].statistics.left >= 3 && result.alternatives[0].statistics.right >= 3);
  const correct = sentence.replace('公演', '公園');
  assert.equal(rankSpellings({ sentence: correct, start, end: start + 2 }, await homophones('公園', 'こうえん'), tokenizer, scorer).alternatives.length, 0);
  const missing = new StatisticalContext('/nonexistent/immersed-counts.sqlite');
  assert.equal(rankSpellings({ sentence, start, end: start + 2 }, await homophones('公演', 'こうえん'), tokenizer, missing).status, 'unavailable');
  assert.equal(rankSpellings({ sentence: 'これが二なのです', start: 3, end: 4 }, [{ form: '荷' }], tokenizer, scorer).status, 'protected-word');
  scorer.close();
});

test('dictionary resolves Japanese continuative forms and inflections without dropping compounds',async()=>{
 for(const text of ['吸い取り','吸い取った','吸い取らなかった','吸い取っています']){
  const entries=await lookup(text);
  assert.ok(entries.some(e=>e.japanese.some(j=>j.word==='吸い取る')),'must resolve '+text);
  assert.ok(entries.some(e=>e.senses.some(s=>s.english_definitions.includes('to absorb'))));
 }
 const tokens=await analyze('そこにある少女の心の震えをすくい取り');
 const compound=tokens.find(t=>t.text==='すくい取り');assert.ok(compound);assert.equal(compound.lemma,'すくい取る');
 assert.equal(tokens.map(t=>t.text).join(''),'そこにある少女の心の震えをすくい取り');
 assert.ok((await lookup(compound.lemma))[0].senses[0].english_definitions.includes('to scoop up'));
 const variants=await lookup('救い取り',{reading:'すくいとり'});
 assert.equal(variants[0].matchedBy,'reading');
 assert.ok(!JSON.stringify(variants).includes('to absorb'),'すくい and すい must not be conflated');
});

test('dictionary lookup normalizes kana and respects the requested reading',async()=>{
 assert.ok((await lookup('ｽｲﾄﾘ')).some(e=>e.senses.some(s=>s.english_definitions.includes('to absorb'))));
 const entries=await lookup('今日',{reading:'こんにち'});
 assert.ok(entries.length);assert.ok(entries[0].japanese.every(j=>j.reading==='こんにち'));
});

test('potential and negative adjective lookups retain the dictionary base and grammar',async()=>{
 const potential=(await analyze('吸い取れなかった'))[0];assert.equal(potential.lemma,'吸い取る');assert.ok(potential.grammar.includes('potential'));assert.ok(potential.grammar.includes('negative'));assert.ok(potential.grammar.includes('past'));
 assert.ok((await lookup('吸い取れなかった')).some(e=>e.senses.some(s=>s.english_definitions.includes('to absorb'))));
 const adjective=(await analyze('美しくなかった'))[0];assert.equal(adjective.lemma,'美しい');assert.equal(adjective.text,'美しくなかった');assert.ok((await lookup(adjective.text)).length);
});

test('causative endings are not mislabelled as potential forms of another verb',async()=>{
 const token=(await analyze('読ませなかった'))[0];assert.equal(token.lemma,'読む');assert.ok(token.grammar.includes('causative'));assert.ok(token.grammar.includes('negative'));
});

test('Mac reading reflow joins the reported 読者 split without correcting unsupported speech',async()=>{
 const {reflowCaptions}=require('../server/caption-reflow.cjs');
 const a={start:286.405,end:293.785,text:'例えば書籍であれば内容を通じて著者と読'},b={start:293.785,end:296.525,text:'者と間の会話になるんですよね'};
 assert.deepEqual(await reflowCaptions([a,b],{maxDuration:12,maxCharacters:80}),[{start:a.start,end:b.end,text:a.text+b.text}]);
 assert.deepEqual(await reflowCaptions([a,b]),[a,b]);
});

test('reading reflow handles compounds, kana, inflections and three/four-way word fragments generically',async()=>{
 const {reflowCaptions}=require('../server/caption-reflow.cjs');
 for(const parts of [['社','会'],['国際','関係'],['言語','化'],['勉強し','ていました'],['吸い','取り'],['取り','戻した'],['申し','込み'],['コミュ','ニ','ケーション'],['コミュ','ニ','ケー','ション'],['ポッド','キャスト'],['ありが','とうございます']]){
  const cues=parts.map((text,i)=>({start:i,end:i+1,text}));
  assert.deepEqual(await reflowCaptions(cues,{maxDuration:12,maxCharacters:80}),[{start:0,end:parts.length,text:parts.join('')}],parts.join('/'));
 }
});


test('spoken expression omission and contracted prohibitions keep the original glyphs',async()=>{
  for(const [text,gloss] of [['しら切んな！',/feign ignorance|play innocent/],['気回さなくていいから',/read too much|wrong ideas/]]) {
    const tokens=await analyze(text);assert.equal(tokens.map(t=>t.text).join(''),text);
    const token=tokens[0];assert.ok(token.grammar.includes('spoken particle omission'));
    const entries=await lookup(token.lemma,token);assert.ok(entries[0].senses.some(s=>s.english_definitions.some(d=>gloss.test(d))));
  }
  for(const text of ['ふざけんな！','切んな！'])assert.ok((await analyze(text))[0].grammar.includes('contracted prohibition: ～るな'));
  assert.equal((await analyze('みんなで行こう'))[0].lemma,'みんな');
});

test('expressive interjection endings do not become unrelated verbs or noun homophones',async()=>{
  const token=(await analyze('ふんっ！'))[0];assert.equal(token.text,'ふんっ');assert.equal(token.lemma,'ふん');assert.equal(token.pos,'interjection');
  const entries=await lookup(token.lemma,token);assert.ok(entries[0].senses[0].english_definitions.some(x=>/humph|hmm/.test(x)));
  for(const text of ['ああー！','うんっ！']) { const t=(await analyze(text))[0];assert.equal(t.text,text.slice(0,-1));assert.equal(t.pos,'interjection');assert.ok((await lookup(t.lemma,t)).length); }
  const direct=await lookup('ふんっ！');assert.ok(direct[0].senses[0].english_definitions.some(x=>/humph|hmm/.test(x)));
  assert.ok((await lookup('分',{pos:'noun',reading:'ふん'}))[0].senses[0].english_definitions.includes('minute (unit of time)'));
});
