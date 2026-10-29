const { execFile } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const jobs = new Map();
let running = false;
const root = path.join(__dirname, '../.data/transcripts');
async function start(videoId) {
  if (!/^[\w-]{11}$/.test(videoId)) throw new Error('Invalid video id');
  const existing = jobs.get(videoId);
  if (existing) return existing;
  try { return { status: 'ready', cues: JSON.parse(await fs.promises.readFile(path.join(root, videoId + '.json'), 'utf8')) }; } catch {}
  if (running) return { status: 'busy', message: 'Another video is being transcribed. Try again shortly.' };
  const python = path.join(__dirname, '../.venv/bin/python');
  if (!fs.existsSync(python)) return { status: 'unavailable', message: 'Automatic transcription is not configured on this server.' };
  const job = { status: 'processing', message: 'Preparing Japanese subtitles…' };
  if (jobs.size >= 20) for (const [id, item] of jobs) { if (item.status !== 'processing') { jobs.delete(id); break; } }
  jobs.set(videoId, job); running = true;
  execFile(python, [path.join(__dirname, 'transcribe.py'), videoId], { timeout: 15 * 60 * 1000, maxBuffer: 2 * 1024 * 1024 }, async (error, stdout) => {
    running = false;
    try {
      if (error) throw error;
      const data = JSON.parse(stdout);
      if (data.error) { Object.assign(job, { status: 'unavailable', message: data.message, reason: data.error }); return; }
      if (!Array.isArray(data.cues) || !data.cues.length) throw new Error('No speech detected');
      Object.assign(job, { status: 'ready', cues: data.cues });
      await fs.promises.mkdir(root, { recursive: true });
      await fs.promises.writeFile(path.join(root, videoId + '.json'), JSON.stringify(data.cues));
    } catch { Object.assign(job, { status: 'unavailable', message: 'Japanese subtitle generation failed on this server.' }); }
  });
  return job;
}
module.exports = { start };
