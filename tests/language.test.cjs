const { test } = require('node:test');
const assert = require('node:assert/strict');
const { analyze, lookup } = require('../server/language.cjs');

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
