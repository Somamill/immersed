const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { once } = require('node:events');
const { createHostedServer, publicOrigin } = require('../server/hosted.cjs');
function fixture() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'immersed-hosted-'));
  fs.mkdirSync(path.join(directory, '_expo'), { recursive: true });
  fs.mkdirSync(path.join(directory, 'assets'));
  fs.writeFileSync(path.join(directory, '_expo/test.hbc'), 'hermes-test-bundle');
  fs.writeFileSync(path.join(directory, 'assets/abcd'), 'image-bytes');
  fs.writeFileSync(path.join(directory, 'metadata.json'), JSON.stringify({ fileMetadata: { ios: { bundle: '_expo/test.hbc', assets: [{ path: 'assets/abcd', ext: 'png' }] } } }));
  return directory;
}
const api = next => (req, res) => {
  if (req.url.startsWith('/api/immersion/')) { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end('{"service":"persistent"}'); }
  else next(req, res);
};
async function open(directory) {
  const server = createHostedServer({ directory, origin: 'https://immersed.example', api });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  return { server, url: 'http://127.0.0.1:' + server.address().port };
}
test('production manifest and assets remain stable after the process restarts', async () => {
  const directory = fixture();
  let first, second;
  try {
    first = await open(directory);
    const response = await fetch(first.url, { headers: { 'expo-platform': 'ios' } });
    assert.equal(response.status, 200); assert.equal(response.headers.get('content-type'), 'application/expo+json');
    const m = await response.json();
    assert.equal(m.extra.expoClient.extra.apiBaseUrl, 'https://immersed.example');
    assert.equal(m.extra.expoGo.packagerOpts.dev, false);
    assert.equal(m.runtimeVersion, 'exposdk:58.0.0');
    assert.equal(await (await fetch(first.url + '/_expo/test.hbc')).text(), 'hermes-test-bundle');
    assert.equal((await (await fetch(first.url + '/api/immersion/analyze')).json()).service, 'persistent');
    first.server.close(); await once(first.server, 'close');
    second = await open(directory);
    const next = await (await fetch(second.url, { headers: { 'expo-platform': 'ios' } })).json();
    assert.equal(next.id, m.id); assert.equal(next.launchAsset.url, m.launchAsset.url);
    assert.equal((await (await fetch(second.url + '/healthz')).json()).hosting, 'standalone');
    const traversal = await fetch(second.url + '/assets/..%2f..%2fpackage.json');
    assert.equal(traversal.status, 403);
  } finally { first?.server.close(); second?.server.close(); fs.rmSync(directory, { recursive: true, force: true }); }
});
test('permanent origins require HTTPS and no embedded credentials', () => {
  assert.equal(publicOrigin('https://immersed.example/'), 'https://immersed.example');
  assert.equal(publicOrigin('http://localhost:8080'), 'http://localhost:8080');
  for (const url of ['http://example.com', 'https://user:secret@example.com', 'https://example.com/path']) assert.throws(() => publicOrigin(url));
});
