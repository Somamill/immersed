const fs = require('node:fs');
const path = require('node:path');
function createCaptionFrames({ run, root }) {
  const streams = new Map(), flights = new Map();
  let active = 0;
  async function stream(id) {
    const cached = streams.get(id);
    if (cached && Date.now() - cached.at < 30 * 60000) return cached.value;
    const value = run('yt-dlp', ['--no-playlist', '--socket-timeout', '8', '--retries', '1', '-f', 'worstvideo[height>=360][height<=480]/bestvideo[height<=480]', '--get-url', 'https://www.youtube.com/watch?v=' + id], { timeout: 18000, maxBuffer: 128000 })
      .then(result => { const url = result.stdout.trim().split('\n')[0]; if (!/^https:\/\//.test(url)) throw Error('No video frame source'); return url; })
      .catch(error => { streams.delete(id); throw error; });
    streams.set(id, { at: Date.now(), value });
    if (streams.size > 12) streams.delete(streams.keys().next().value);
    return value;
  }
  async function sample(id, at) {
    if (!/^[\w-]{11}$/.test(id || '') || !Number.isFinite(at) || at < 0 || at > 86400) throw Error('Invalid frame position');
    const key = id + '-' + at.toFixed(1), folder = path.join(root, key);
    const files = [1, 2].map(n => path.join(folder, n + '.jpg'));
    const read = async () => Promise.all(files.map(async file => (await fs.promises.readFile(file)).toString('base64')));
    try { return { frames: await read() }; } catch { /* Not sampled yet. */ }
    if (flights.has(key)) return flights.get(key);
    if (active >= 1) return { busy: true, frames: [] };
    active++;
    const job = (async () => {
      await fs.promises.mkdir(folder, { recursive: true });
      const url = await stream(id);
      await run('ffmpeg', ['-v', 'error', '-rw_timeout', '10000000', '-ss', at.toFixed(1), '-i', url, '-t', '0.5', '-vf', 'fps=5,scale=960:-2', '-frames:v', '2', '-q:v', '3', '-y', path.join(folder, '%d.jpg')], { timeout: 18000, maxBuffer: 64000 });
      const frames = await read();
      // Bound the local image cache; no complete video is downloaded here.
      const entries = await fs.promises.readdir(root, { withFileTypes: true });
      if (entries.length > 120) {
        const old = await Promise.all(entries.filter(e => e.isDirectory() && e.name !== key).map(async e => ({ name: e.name, time: (await fs.promises.stat(path.join(root, e.name))).mtimeMs })));
        for (const entry of old.sort((a, b) => a.time - b.time).slice(0, entries.length - 120)) await fs.promises.rm(path.join(root, entry.name), { recursive: true, force: true });
      }
      return { frames };
    })().finally(() => { active--; flights.delete(key); });
    flights.set(key, job);
    return job;
  }
  return { sample };
}
module.exports = { createCaptionFrames };
