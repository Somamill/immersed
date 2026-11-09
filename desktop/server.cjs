/* Local-only macOS draft: video stays in YouTube's player; ASR uses local audio. */
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFile, spawn } = require('node:child_process');
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
function recognize(python, audio, id) {
  return new Promise((resolve, reject) => {
    const child = spawn(python, [path.join(__dirname, 'transcribe.py'), audio], { stdio: ['ignore', 'pipe', 'ignore'] });
    let buffer = '', final;
    const timer = setTimeout(() => child.kill(), 60 * 60_000);
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', chunk => {
      buffer += chunk;
      if (buffer.length > 20 * 1024 * 1024) { child.kill(); return; }
      let newline;
      while ((newline = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, newline); buffer = buffer.slice(newline + 1);
        try {
          const message = JSON.parse(line);
          if (message.status === 'processing' && Array.isArray(message.cues)) jobs.set(id, { status: 'processing', stage: 'Recognizing Japanese speech on this Mac', cues: message.cues, processedSeconds: message.processedSeconds });
          if (message.status === 'ready' || message.status === 'unavailable') final = message;
        } catch { /* Ignore model progress that is not JSON. */ }
      }
    });
    child.on('error', error => { clearTimeout(timer); reject(error); });
    child.on('close', code => {
      clearTimeout(timer);
      if (code || !final || final.status !== 'ready') reject(new Error(final?.error || 'Local speech recognition stopped'));
      else resolve(final.cues);
    });
  });
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
    const cues = await recognize(python, path.join(folder, audio), id);
    if (!Array.isArray(cues) || !cues.length) throw new Error('No Japanese speech was recognized');
    fs.writeFileSync(path.join(cache, id + '.json'), JSON.stringify({ cues }));
    jobs.set(id, { status: 'ready', cues });
  } catch (error) {
    jobs.set(id, { status: 'unavailable', message: String(error.message || error).slice(0, 220) });
  } finally { if (folder) fs.rmSync(folder, { recursive: true, force: true }); }
}
const fallback = (req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1');
  if (url.pathname === '/api/desktop/levels' && req.method === 'GET') return json(res, 200, require('../src/data/jlpt-levels.json'));
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
