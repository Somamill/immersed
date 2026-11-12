const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { server, validId } = require('../desktop/server.cjs');

test('Mac companion serves its study window and rejects invalid video IDs', async () => {
  const html = fs.readFileSync(path.join(__dirname, '../desktop/index.html'), 'utf8');
  const scripts = [...html.matchAll(/<script\s+src="([^"]+)"/g)];
  assert.ok(scripts.length > 0, 'The desktop must load its actual scripts');
  for (const [, src] of scripts) {
    const directory = src.startsWith('/shared/') ? '../src' : '../desktop';
    new vm.Script(fs.readFileSync(path.join(__dirname, directory, path.basename(src)), 'utf8'));
  }
  assert.equal(validId('eslI8_s5blg'), true);
  assert.equal(validId('../private'), false);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const origin = `http://127.0.0.1:${server.address().port}`;
    const page = await fetch(origin);
    assert.equal(page.status, 200);
    assert.match(await page.text(), /Watch & read/);
    for (const asset of ['/dot-tokens.css', '/dot-brand.css']) {
      const response = await fetch(origin + asset);
      assert.equal(response.status, 200, asset);
      assert.match(response.headers.get('content-type'), /text\/css/);
      assert.ok((await response.text()).includes('--dot-'), asset);
    }
    const invalid = await fetch(origin + '/api/desktop/transcribe?videoId=bad', { method: 'POST', headers: { Origin: origin, 'X-Immersed-Request': '1' } });
    assert.equal(invalid.status, 400);
    const idle = await fetch(origin + '/api/desktop/transcribe?videoId=eslI8_s5blg');
    assert.equal(idle.status, 200);
    assert.equal((await idle.json()).status, 'idle');
  } finally { server.close(); }
});
