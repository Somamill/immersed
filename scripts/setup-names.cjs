// Pinned, licensed JMnedict names. Build a disk index so captions do not load
// hundreds of thousands of name records into the Metro process's JS heap.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { DatabaseSync } = require('node:sqlite');
const root = path.join(__dirname, '..', '.data');
const release = '3.6.2+20261026175559';
const sha = '552f279d250b162aa0311259130ee82ad1db0879ed32e8d9318b56a9400b1165';
const archive = path.join(root, `jmnedict-all-${release}.json.tgz`);
const destination = path.join(root, 'names.sqlite');
const normalize = text => text.normalize('NFKC').toLowerCase().replace(/[ァ-ヶ]/g, c => String.fromCharCode(c.charCodeAt(0) - 0x60)).trim();
fs.mkdirSync(root, { recursive: true });
if (!fs.existsSync(archive)) execFileSync('curl', ['--fail', '--location', '--retry', '2', '--output', archive, `https://github.com/scriptin/jmdict-simplified/releases/download/${encodeURIComponent(release)}/jmnedict-all-${encodeURIComponent(release)}.json.tgz`], { stdio: 'inherit' });
if (crypto.createHash('sha256').update(fs.readFileSync(archive)).digest('hex') !== sha) throw new Error('JMnedict checksum mismatch');
let current = false;
if (fs.existsSync(destination)) {
  const existing = new DatabaseSync(destination, { readOnly: true });
  try { current = existing.prepare('SELECT sha FROM metadata').get()?.sha === sha; } catch {} finally { existing.close(); }
}
if (!current) {
  const data = JSON.parse(execFileSync('tar', ['-xOzf', archive, 'jmnedict-all-3.6.2.json'], { maxBuffer: 350 * 1024 * 1024 }).toString());
  const temporary = `${destination}.${process.pid}.building`;
  const db = new DatabaseSync(temporary);
  try {
    db.exec('PRAGMA journal_mode=OFF; PRAGMA synchronous=OFF; CREATE TABLE metadata(sha TEXT); CREATE TABLE entries(id TEXT PRIMARY KEY, data TEXT) WITHOUT ROWID; CREATE TABLE forms(form TEXT, id TEXT, PRIMARY KEY(form,id)) WITHOUT ROWID; BEGIN');
    const put = db.prepare('INSERT INTO entries VALUES (?,?)');
    const form = db.prepare('INSERT OR IGNORE INTO forms VALUES (?,?)');
    for (const entry of data.words) {
      const result = { slug: `jmnedict-${entry.id}`, source: 'JMnedict', japanese: entry.kana.map(k => ({ word: entry.kanji.find(w => k.appliesToKanji.includes('*') || k.appliesToKanji.includes(w.text))?.text, reading: k.text })), senses: entry.translation.map(s => ({ english_definitions: s.translation.filter(t => t.lang === 'eng').map(t => t.text), parts_of_speech: s.type.map(t => data.tags[t] || t) })) };
      put.run(entry.id, JSON.stringify(result));
      const forms = [...entry.kanji, ...entry.kana].map(k => k.text).concat(result.senses.flatMap(s => s.english_definitions));
      for (const value of new Set(forms.map(normalize))) if (value) form.run(value, entry.id);
    }
    db.prepare('INSERT INTO metadata VALUES (?)').run(sha);
    db.exec('COMMIT'); db.close(); fs.renameSync(temporary, destination);
    console.log(`JMnedict disk index installed: ${data.words.length} name entries. EDRDG CC BY-SA 4.0.`);
  } catch (error) { db.close(); fs.rmSync(temporary, { force: true }); throw error; }
} else console.log('Pinned JMnedict names index is up to date.');
