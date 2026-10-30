const { execFile } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
function createTranscriptionService({ execute = execFile, storage = fs, now = Date.now, root = path.join(__dirname, '../.data/transcripts'), python = path.join(__dirname, '../.venv/bin/python') } = {}) {
  const jobs = new Map();
  let running = false;
  const valid = cues => Array.isArray(cues) && cues.length > 0 && cues.every(c => typeof c.text === 'string' && Number.isFinite(c.start) && Number.isFinite(c.end) && c.end > c.start);
  async function start(videoId, retry = false) {
    if (!/^[\w-]{11}$/.test(videoId)) throw new Error('Invalid video id');
    const previous = jobs.get(videoId);
    if (previous) {
      const elapsed = now() - (previous.failedAt || 0);
      if (previous.status === 'processing' && previous.progressFile) {
        try {
          const update = JSON.parse(await storage.promises.readFile(previous.progressFile, 'utf8'));
          if (valid(update.cues)) Object.assign(previous, { cues: update.cues, comparisons: update.comparisons, processedSeconds: update.processedSeconds, duration: update.duration });
        } catch {}
      }
      if (previous.status !== 'unavailable' || elapsed < (retry ? 0 : 60000)) {
        const { progressFile, ...publicJob } = previous;
        return publicJob;
      }
      jobs.delete(videoId);
    }
    try {
      const cached = JSON.parse(await storage.promises.readFile(path.join(root, videoId + '.ensemble-context-v1.json'), 'utf8'));
      if (valid(cached.cues)) return { ...cached, status: 'ready' };
    } catch { /* Missing/stale cache is recomputed. */ }
    if (running) return { status: 'busy', message: 'Another video is being prepared. Waiting for a free subtitle worker…' };
    if (!storage.existsSync(python)) return { status: 'unavailable', canRetry: true, reason: 'NOT_CONFIGURED', message: 'The subtitle worker is unavailable. Existing Japanese captions can still be used.' };
    const progressFile = path.join(root, videoId + '.' + randomUUID() + '.progress.json');
    const job = { status: 'processing', message: 'Preparing Japanese subtitles…', progressFile };
    if (jobs.size >= 20) for (const [id, item] of jobs) { if (item.status !== 'processing') { jobs.delete(id); break; } }
    jobs.set(videoId, job); running = true;
    try { await storage.promises.mkdir(root, { recursive: true }); } catch {}
    const fail = (reason, message) => Object.assign(job, { status: 'unavailable', reason, message, failedAt: now(), canRetry: true });
    execute(python, [path.join(__dirname, 'transcribe.py'), videoId, progressFile], { timeout: 15 * 60 * 1000, maxBuffer: 2 * 1024 * 1024 }, async (error, stdout) => {
      running = false;
      try { await storage.promises.unlink?.(progressFile); } catch {}
      try {
        if (error) throw error;
        const data = JSON.parse(stdout);
        if (data.error) { fail(data.error, data.message); return; }
        if (!valid(data.cues)) throw new Error('No speech detected');
        Object.assign(job, { status: 'ready', cues: data.cues, comparisons: data.comparisons, pipeline: data.pipeline });
        // A cache-write failure must never invalidate successfully generated cues.
        try { await storage.promises.mkdir(root, { recursive: true }); await storage.promises.writeFile(path.join(root, videoId + '.ensemble-context-v1.json'), JSON.stringify(data)); } catch {}
      } catch { fail('TRANSCRIPTION_FAILED', 'Japanese subtitle preparation failed. Existing Japanese captions can still be used.'); }
    });
    const { progressFile: privatePath, ...publicJob } = job;
    return publicJob;
  }
  return { start };
}
module.exports = { ...createTranscriptionService(), createTranscriptionService };
