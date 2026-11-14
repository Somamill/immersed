const { test } = require('node:test');
const assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite');
const path = require('node:path');
const database = new DatabaseSync(path.join(__dirname, '../assets/dictionary.db'), { readOnly: true });
const adapter = { getAllAsync: async (sql, ...values) => database.prepare(sql).all(...values) };
test('bundled dictionary is intact and includes real Japanese definitions', async () => {
  const { lookup } = await import('../src/lib/library.ts');
  assert.equal(database.prepare('PRAGMA integrity_check').get().integrity_check, 'ok');
  const rows = await lookup(adapter, '日本語');
  assert.ok(rows.some(row => row.reading.includes('にほんご') && row.definitions.includes('Japanese')));
});
test('caption matching preserves the original text and recognizes a dictionary compound', async () => {
  const { captionTokens } = await import('../src/lib/library.ts');
  const caption = '私は日本語を勉強します。';
  const tokens = await captionTokens(adapter, caption);
  assert.equal(tokens.join(''), caption);
  assert.ok(tokens.includes('日本語'));
});
test('dictionary queries do not interpret input as SQL', async () => {
  const { lookup } = await import('../src/lib/library.ts');
  assert.deepEqual(await lookup(adapter, "' OR 1=1 --"), []);
  assert.deepEqual(await lookup(adapter, '  '), []);
});
