const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createTranscriptionService } = require('../server/transcription.cjs');
const videoId = 'M7lc1UVf-VE';
function fixture() {
  let time = 100000;
  const callbacks = [];
  const storage = { existsSync: () => true, promises: { readFile: async () => { throw new Error('not cached'); }, mkdir: async () => {}, writeFile: async () => {} } };
  const service = createTranscriptionService({ storage, now: () => time, execute: (...args) => callbacks.push(args.at(-1)) });
  return { service, callbacks, storage, advance: ms => { time += ms; } };
}
test('a failed audio job can recover instead of being cached forever', async () => {
  const { service, callbacks, advance } = fixture();
  await service.start(videoId);
  await callbacks[0](null, JSON.stringify({ error: 'NETWORK_BLOCKED', message: 'Network unavailable' }));
  assert.equal((await service.start(videoId)).reason, 'NETWORK_BLOCKED');
  assert.equal(callbacks.length, 1, 'polling should not repeatedly start failed audio downloads');
  advance(6000);
  const retry = await service.start(videoId, true);
  assert.equal(retry.status, 'processing');
  assert.equal(callbacks.length, 2);
  await callbacks[1](null, JSON.stringify({ cues: [{ start: 0, end: 2, text: 'こんにちは。' }] }));
  assert.equal((await service.start(videoId)).status, 'ready');
});
test('cached transcripts survive disk failure and concurrent requests share one job', async () => {
  const { service, callbacks, storage } = fixture();
  const first = await service.start(videoId);
  assert.equal(await service.start(videoId), first);
  assert.equal(callbacks.length, 1);
  assert.equal((await service.start('dQw4w9WgXcQ')).status, 'busy');
  storage.promises.writeFile = async () => { throw new Error('disk full'); };
  await callbacks[0](null, JSON.stringify({ cues: [{ start: 0, end: 1, text: '日本語' }] }));
  assert.equal((await service.start(videoId)).status, 'ready');
});
