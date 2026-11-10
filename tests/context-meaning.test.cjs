const test = require('node:test');
const assert = require('node:assert/strict');
const { validContext, contextMeaning } = require('../server/context-meaning.cjs');
const context = { word: '開く', sentence: '窓を開く。', start: 2, end: 4, before: '', after: '' };
test('context selection must match an exact, bounded caption span', () => {
  assert.equal(validContext(context), true);
  for (const change of [{ start: -1 }, { start: 0 }, { end: 3 }, { end: 999 }, { start: NaN }, { before: 'a'.repeat(241) }, { word: '' }]) {
    assert.equal(validContext({ ...context, ...change }), false);
  }
});
test('optional context model cannot prevent ordinary dictionary use on unsupported hosts', async () => {
  const previous = process.env.IMMERSED_CONTEXT_PYTHON;
  delete process.env.IMMERSED_CONTEXT_PYTHON;
  try { assert.deepEqual(await contextMeaning(context), { status: 'unavailable' }); }
  finally { if (previous) process.env.IMMERSED_CONTEXT_PYTHON = previous; }
});

test('dictionary-attested phrases disambiguate te-form stems without rewriting subtitles', async () => {
  const language = require('../server/language.cjs');
  const phrases = await language.contextPhrases('彼の主張は筋が通っている。', 5, 6);
  assert.ok(phrases.some(p => p.form === '筋が通る' && p.senses.some(s => s.english_definitions.includes('to be logical'))));
  assert.deepEqual(await language.contextPhrases('窓を開く。', 2, 4), []);
});
