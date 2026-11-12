const { spawn } = require('node:child_process');
const readline = require('node:readline');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const language = require('./language.cjs');
const VERSION = 5;
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
function selectedMeaning(result, choices, data) {
  if (result.status !== 'ready') return result;
  if (!Number.isInteger(result.choice) || !choices[result.choice]) return { status: 'unclear' };
  const choice = choices[result.choice];
  const gloss = data.grammar?.includes('contracted prohibition: ～るな') && /^to /i.test(choice.gloss)
    ? 'Don’t ' + choice.gloss.replace(/^to /i,'') : choice.gloss;
  return { status: 'ready', gloss, phrase: data.sentence, source: 'Dictionary sense', model: MODEL };
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
  const choices = [], seen = new Set();
  for (const entry of [...phrases, ...entries.slice(0, 2)]) {
    const form = entry.matchedForm || entry.form || entry.japanese?.[0]?.word || entry.japanese?.[0]?.reading;
    for (const sense of entry.senses.slice(0, 12)) for (const gloss of sense.english_definitions.slice(0, 4)) {
      const id = form + ':' + gloss;
      if (!seen.has(id) && choices.length < 48) { seen.add(id); choices.push({ index: choices.length, form, gloss }); }
    }
  }
  if (!choices.length) return { status: 'unavailable' };
  const selected = (await language.analyze(data.sentence)).find(t=>t.start===data.start&&t.end===data.end);
  const grammar = selected?.grammar || [];
  const input = { word: data.word, grammar, selectedRange: [data.start, data.end], dictionaryForm: data.lemma || data.word,
    sentence: data.sentence, before: data.before, after: data.after, choices };
  const key = crypto.createHash('sha256').update(JSON.stringify({ version: VERSION, ...input })).digest('hex');
  const root = path.resolve(process.env.IMMERSED_DATA_ROOT || path.join(__dirname, '../.data'), 'context-meanings');
  const file = path.join(root, key + '.json');
  if (cache.has(key)) return cache.get(key);
  try { const value = JSON.parse(await fs.promises.readFile(file, 'utf8')); if (['ready', 'unclear'].includes(value.status)) return value; } catch { /* First lookup. */ }
  const result = infer(input).then(async result => {
    const value = selectedMeaning(result, choices, {...data,grammar});
    cache.delete(key);
    if (['ready', 'unclear'].includes(value.status)) {
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
module.exports = { contextMeaning, validContext, selectedMeaning, stop };
