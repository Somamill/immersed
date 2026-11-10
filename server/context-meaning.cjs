const { spawn } = require('node:child_process');
const readline = require('node:readline');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const language = require('./language.cjs');
const VERSION = 2;
const MODEL = 'Qwen3 4B · on-device';
let worker, idle, counter = 0;
const pending = new Map(), cache = new Map();
function stop() {
  clearTimeout(idle);
  const current = worker;
  worker = null;
  current?.kill();
  for (const request of pending.values()) { clearTimeout(request.timer); request.resolve({ status: 'unavailable' }); }
  pending.clear();
}
function armIdle() { clearTimeout(idle); idle = setTimeout(stop, 120000); idle.unref(); }
function infer(data) {
  const python = process.env.IMMERSED_CONTEXT_PYTHON;
  if (!python || !fs.existsSync(python)) return Promise.resolve({ status: 'unavailable' });
  if (pending.size >= 2) return Promise.resolve({ status: 'busy' });
  clearTimeout(idle);
  if (!worker) {
    const child = spawn(python, [path.join(__dirname, 'context_meaning.py')], {
      stdio: ['pipe', 'pipe', 'ignore'], env: { ...process.env, HF_HUB_DISABLE_XET: '1', HF_HUB_OFFLINE: '1' },
    });
    worker = child;
    readline.createInterface({ input: child.stdout }).on('line', line => {
      let result; try { result = JSON.parse(line); } catch { return; }
      const request = pending.get(result.id);
      if (!request) return;
      clearTimeout(request.timer); pending.delete(result.id);
      request.resolve(result.result ? { status: 'ready', ...result.result, model: MODEL } : { status: 'unavailable' });
      if (!pending.size) armIdle();
    });
    child.stdin.on('error', () => {});
    const failed = () => { if (worker === child) stop(); };
    child.on('error', failed); child.on('exit', failed);
  }
  return new Promise(resolve => {
    const id = ++counter;
    const timer = setTimeout(stop, 45000); timer.unref();
    pending.set(id, { resolve, timer });
    worker.stdin.write(JSON.stringify({ id, data }) + '\n');
  });
}
function validContext(data) {
  return typeof data.word === 'string' && data.word.length > 0 && data.word.length <= 120 &&
    typeof data.sentence === 'string' && data.sentence.length <= 1000 &&
    Number.isInteger(data.start) && Number.isInteger(data.end) && data.start >= 0 && data.end > data.start &&
    data.sentence.slice(data.start, data.end) === data.word &&
    typeof data.before === 'string' && data.before.length <= 240 && typeof data.after === 'string' && data.after.length <= 240;
}
async function contextMeaning(data) {
  if (!validContext(data)) return { status: 'invalid' };
  if (!process.env.IMMERSED_CONTEXT_PYTHON) return { status: 'unavailable' };
  const python = process.env.IMMERSED_CONTEXT_PYTHON;
  if (!fs.existsSync(path.join(path.dirname(python), '../.ready'))) {
    return { status: fs.existsSync(path.join(__dirname, '../.context-setup-lock')) ? 'preparing' : 'unavailable' };
  }
  const entries = await language.lookup((data.lemma || data.word).slice(0, 120), { reading: data.reading, pos: data.pos });
  if (!entries.length) return { status: 'unavailable' };
  const phrases = await language.contextPhrases(data.sentence, data.start, data.end);
  const compact = e => ({ form: e.matchedForm || e.form || e.japanese?.[0]?.word || e.japanese?.[0]?.reading,
    senses: e.senses.slice(0, 10).map(s => s.english_definitions.slice(0, 4).join('; ')) });
  const input = { phrases: phrases.map(compact), word: data.word, dictionaryForm: data.lemma || data.word,
    sentence: data.sentence, before: data.before, after: data.after,
    dictionary: entries.slice(0, 2).map(compact) };
  const key = crypto.createHash('sha256').update(JSON.stringify({ version: VERSION, ...input })).digest('hex');
  const root = path.resolve(process.env.IMMERSED_DATA_ROOT || path.join(__dirname, '../.data'), 'context-meanings');
  const file = path.join(root, key + '.json');
  if (cache.has(key)) return cache.get(key);
  try { const value = JSON.parse(await fs.promises.readFile(file, 'utf8')); if (value.status === 'ready') return value; } catch { /* First lookup. */ }
  const result = infer(input).then(async value => {
    cache.delete(key);
    if (value.status === 'ready') {
      if (cache.size >= 200) cache.delete(cache.keys().next().value);
      cache.set(key, value);
      // Exact-context cache is local; no caption or book content is sent to a service.
      await fs.promises.mkdir(root, { recursive: true })
        .then(() => fs.promises.writeFile(file, JSON.stringify(value), { mode: 0o600 })).catch(() => {});
    }
    return value;
  });
  cache.set(key, result);
  return result;
}
module.exports = { contextMeaning, validContext, stop };
