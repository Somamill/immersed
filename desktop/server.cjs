/* Local-only macOS draft: video stays in YouTube's player; ASR uses local audio. */
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const api = require('../server/middleware.cjs');
const run = promisify(execFile);
const root = path.join(__dirname, '..');
const cache = path.join(root, '.data/mac-transcripts');
const jobs = new Map();
const validId = id => /^[A-Za-z0-9_-]{11}$/.test(id || '');
fs.mkdirSync(cache, { recursive: true });
const json = (res, status, value) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(value)); };
function state(id) {
  const file = path.join(cache, id + '.json');
  if (fs.existsSync(file)) {
    try { return { status: 'ready', cues: JSON.parse(fs.readFileSync(file, 'utf8')).cues }; } catch { /* regenerate */ }
  }
  return jobs.get(id) || { status: 'idle' };
}
async function transcribe(id) {
  let folder;
  try {
    folder = fs.mkdtempSync(path.join(os.tmpdir(), 'immersed-mac-'));
    const output = path.join(folder, 'audio.%(ext)s');
    await run('yt-dlp', ['--no-playlist', '--no-progress', '--max-filesize', '500M', '-f', 'bestaudio/best', '-o', output, 'https://www.youtube.com/watch?v=' + id], { timeout: 10 * 60_000, maxBuffer: 1024 * 1024 });
    const audio = fs.readdirSync(folder).find(name => name.startsWith('audio.') && !name.endsWith('.part'));
    if (!audio) throw new Error('Video audio could not be downloaded on this Mac');
    jobs.set(id, { status: 'processing', stage: 'Recognizing Japanese speech on this Mac' });
    const python = process.env.IMMERSED_PYTHON || path.join(root, '.venv/bin/python');
    const { stdout } = await run(python, [path.join(__dirname, 'transcribe.py'), path.join(folder, audio)], { timeout: 60 * 60_000, maxBuffer: 20 * 1024 * 1024 });
    const result = JSON.parse(stdout);
    if (result.error || !Array.isArray(result.cues) || !result.cues.length) throw new Error(result.error || 'No Japanese speech was recognized');
    fs.writeFileSync(path.join(cache, id + '.json'), JSON.stringify({ cues: result.cues }));
    jobs.set(id, { status: 'ready', cues: result.cues });
  } catch (error) {
    jobs.set(id, { status: 'unavailable', message: String(error.message || error).slice(0, 220) });
  } finally { if (folder) fs.rmSync(folder, { recursive: true, force: true }); }
}
const fallback = (req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1');
  if (url.pathname === '/api/desktop/transcribe') {
    const id = url.searchParams.get('videoId');
    if (!validId(id)) return json(res, 400, { error: 'Invalid video ID' });
    if (req.method === 'POST' && !jobs.has(id) && state(id).status !== 'ready') {
      jobs.set(id, { status: 'processing', stage: 'Downloading video audio' });
      void transcribe(id);
    }
    if (req.method !== 'GET' && req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });
    return json(res, 200, state(id));
  }
  if (req.method !== 'GET') return json(res, 405, { error: 'Method not allowed' });
  if (url.pathname === '/' || url.pathname === '/index.html') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Content-Security-Policy': "default-src 'self' https://www.youtube.com https://www.youtube-nocookie.com; script-src 'self' 'unsafe-inline' https://www.youtube.com; style-src 'self' 'unsafe-inline'; frame-src https://www.youtube.com https://www.youtube-nocookie.com; connect-src 'self'; img-src 'self' data: https://i.ytimg.com" });
    return fs.createReadStream(path.join(__dirname, 'index.html')).pipe(res);
  }
  if (url.pathname === '/icon.png') { res.writeHead(200, { 'Content-Type': 'image/png' }); return fs.createReadStream(path.join(root, 'assets/icon.png')).pipe(res); }
  return json(res, 404, { error: 'Not found' });
};
const handler = api(fallback);
const server = http.createServer((req, res) => Promise.resolve(handler(req, res, () => fallback(req, res))).catch(() => json(res, 500, { error: 'Local service failed' })));
if (require.main === module) server.listen(Number(process.env.IMMERSED_MAC_PORT || 4765), '127.0.0.1', () => console.log('Immersed Mac: http://127.0.0.1:' + server.address().port));
module.exports = { server, validId };
