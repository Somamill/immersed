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
  assert.ok((await language.contextPhrases('彼の主張は筋が通っている。', 7, 12)).some(p => p.form === '筋が通る'));
  assert.deepEqual(await language.contextPhrases('窓を開く。', 2, 4), []);
});
test('selected pronunciation excludes unrelated readings of the same kanji', async () => {
  const entries = await require('../server/language.cjs').lookup('筋', { reading: 'すじ', pos: 'noun' });
  assert.ok(entries.length > 0);
  assert.ok(entries.every(entry => entry.japanese.every(form => form.reading === 'すじ')));
});
test('context results can only display supplied meanings and literal caption evidence', () => {
  const { selectedMeaning } = require('../server/context-meaning.cjs');
  const data = { word: '教会', sentence: '「紙上の教会」という概念がある', start: 4, end: 6 };
  const choices = [{ form: '教会', gloss: 'church' }, { form: '教会', gloss: 'congregation' }];
  const result = selectedMeaning({ status: 'ready', choice: 1, gloss: 'invented religious institution', phrase: '紙上の教会' }, choices, data);
  assert.equal(result.gloss, 'congregation');
  assert.equal(result.phrase, data.sentence);
  assert.equal(result.explanation, undefined);
  assert.deepEqual(selectedMeaning({ status: 'ready', choice: 100 }, choices, data), { status: 'unclear' });
  assert.equal(selectedMeaning({ status: 'ready', choice: 0, phrase: 'not present' }, choices, data).phrase, data.sentence);
});
