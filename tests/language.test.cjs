const { test } = require('node:test');
const assert = require('node:assert/strict');
const { analyze, lookup, search } = require('../server/language.cjs');

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
