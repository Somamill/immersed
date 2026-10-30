const { test } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const path = require('node:path');
test('real morphology recognizes homophones and protects names, unknown words, numbers and negatives', () => {
  const data = JSON.parse(execFileSync(process.execPath, [path.join(__dirname, '../server/caption_features.cjs')], {
    input: JSON.stringify(['公園を散歩した', '公演を散歩した', '鈴木さんは3回行かない', 'ZXYQWZを見た']), encoding: 'utf8',
  }));
  assert.equal(data[0].reading, data[1].reading);
  assert.ok(data[2].protected.includes('鈴木'));
  assert.deepEqual(data[2].numbers, ['3']);
  assert.equal(data[2].negatives, 1);
  assert.ok(data[3].protected.includes('ZXYQWZ'));
});
