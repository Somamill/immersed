const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createCaptionFrames } = require('../desktop/caption-frames.cjs');
test('frame sampling is bounded, deduplicated and cached without full video downloads', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'immersed-frames-'));
  const calls = [];
  const run = async (command, args, options) => {
    calls.push({ command, args, options });
    if (command === 'yt-dlp') return { stdout: 'https://video.example.test/public-stream' };
    assert.equal(options.timeout, 18000);
    assert.equal(args[args.indexOf('-frames:v') + 1], '3');
    assert.equal(args[args.indexOf('-t') + 1], '0.6');
    assert.ok(args.includes('fps=5,scale=1920:-2'));
    for (const n of [1, 2, 3]) fs.writeFileSync(args.at(-1).replace('%d', String(n)), Buffer.from('frame' + n));
    return { stdout: '' };
  };
  try {
    const service = createCaptionFrames({ run, root });
    await assert.rejects(() => service.sample('../file', 1));
    await assert.rejects(() => service.sample('5C3hh2fO4mE', -1));
    const [a, b] = await Promise.all([service.sample('5C3hh2fO4mE', 364.4), service.sample('5C3hh2fO4mE', 364.4)]);
    assert.equal(a.frames.length, 3); assert.deepEqual(a, b);
    assert.deepEqual(await service.sample('5C3hh2fO4mE', 364.4), a);
    assert.equal(calls.filter(c => c.command === 'yt-dlp').length, 1);
    assert.equal(calls.filter(c => c.command === 'ffmpeg').length, 1);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
