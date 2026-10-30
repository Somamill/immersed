/* Rebuild a reproducible, attributed word-sequence database from an open corpus. */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const readline = require('node:readline');
const { execFileSync, spawn } = require('node:child_process');
const { DatabaseSync } = require('node:sqlite');
const { initialize } = require('../server/language.cjs');
const { VERSION, gramKey, tokenize } = require('../server/statistical-context.cjs');
const root = path.join(__dirname, '../.data');
const source = require('../src/data/context-source.json');
async function main() {
  fs.mkdirSync(root, { recursive: true });
  const archive = path.join(root, source.asset);
  if (!fs.existsSync(archive)) {
    try { execFileSync('curl', ['--fail', '--location', '--retry', '2', '--output', archive, source.archive], { stdio: 'inherit' }); }
    catch { execFileSync('curl', ['--fail', '--location', '--retry', '2', '--output', archive, source.upstream], { stdio: 'inherit' }); }
  }
  if (crypto.createHash('sha256').update(fs.readFileSync(archive)).digest('hex') !== source.sha256) throw new Error('Corpus checksum mismatch');
  const file = path.join(root, 'context-ngrams.sqlite'), temporary = file + '.building';
  fs.rmSync(temporary, { force: true });
  const db = new DatabaseSync(temporary);
  db.exec('PRAGMA journal_mode=OFF; PRAGMA synchronous=OFF; CREATE TABLE grams(key TEXT PRIMARY KEY, count INTEGER NOT NULL, documents INTEGER NOT NULL) WITHOUT ROWID; CREATE TABLE metadata(key TEXT PRIMARY KEY, value TEXT NOT NULL); CREATE TABLE attribution(id INTEGER PRIMARY KEY, author TEXT NOT NULL);');
  const put = db.prepare('INSERT INTO grams VALUES(?,?,1) ON CONFLICT(key) DO UPDATE SET count=count+excluded.count, documents=documents+1');
  const credit = db.prepare('INSERT INTO attribution VALUES(?,?)');
  const { tokenizer } = await initialize();
  const decompressor = spawn('bzip2', ['-dc', archive]);
  const completion = new Promise((resolve, reject) => { decompressor.on('error', reject); decompressor.on('exit', c => c === 0 ? resolve() : reject(new Error('Corpus decompression failed'))); });
  const seen = new Set(), authors = new Set();
  let sentences = 0, tokens = 0, heldOut = 0;
  db.exec('BEGIN');
  for await (const line of readline.createInterface({ input: decompressor.stdout, crlfDelay: Infinity })) {
    const [id, language, raw, author] = line.split('\t');
    const text = raw?.normalize('NFKC').trim();
    if (language !== 'jpn' || !text || text.length < 6 || text.length > 180 || !/[ぁ-ゖァ-ヺ一-龯]/.test(text) || seen.has(text)) continue;
    seen.add(text);
    if (Number(id) % 20 === 0) { heldOut++; continue; }
    const parsed = tokenize(tokenizer, text);
    if (!parsed.length || parsed.length > 80) continue;
    const values = ['<s>', '<s>', ...parsed.map(t => t.value), '</s>'];
    const counts = new Map();
    for (let n = 1; n <= 3; n++) for (let i = 0; i <= values.length - n; i++) {
      const key = gramKey(values.slice(i, i + n)); counts.set(key, (counts.get(key) || 0) + 1);
    }
    for (const [key, count] of counts) put.run(key, count);
    credit.run(Number(id), author || '\\N'); authors.add(author || '\\N');
    sentences++; tokens += values.length;
    if (sentences % 10000 === 0) { db.exec('COMMIT; BEGIN'); console.log('Indexed', sentences, 'sentences'); }
  }
  await completion;
  db.exec('COMMIT');
  const vocabulary = db.prepare("SELECT COUNT(*) AS n FROM grams WHERE instr(key, char(31)) = 0").get().n;
  const meta = { ...source, version: VERSION, sentences, heldOut, tokens, vocabulary, attribution: 'Tatoeba contributors, CC BY 2.0 FR; sentence IDs and author names retained in attribution table.' };
  db.prepare('INSERT INTO metadata VALUES(?,?)').run('corpus', JSON.stringify(meta));
  db.close(); fs.renameSync(temporary, file);
  fs.writeFileSync(path.join(root, 'context-authors.json'), JSON.stringify([...authors].sort(), null, 2));
  console.log(JSON.stringify(meta, null, 2));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
