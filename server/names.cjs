const fs = require('node:fs');
const path = require('node:path');
let db;
const normalize = text => (text || '').normalize('NFKC').toLowerCase().replace(/[ァ-ヶ]/g, c => String.fromCharCode(c.charCodeAt(0) - 0x60)).trim();
function database() {
  if (!db) {
    const file = path.join(__dirname, '../.data/names.sqlite');
    if (!fs.existsSync(file)) return null;
    const { DatabaseSync } = require('node:sqlite');
    db = new DatabaseSync(file, { readOnly: true });
  }
  return db;
}
function lookup(word, reading = '') {
  const database = module.exports.database();
  if (!database) return [];
  const rows = database.prepare('SELECT e.data FROM forms f JOIN entries e ON e.id=f.id WHERE f.form=? ORDER BY f.id LIMIT 40').all(normalize(word));
  const entries = rows.map(row => JSON.parse(row.data));
  const kana = normalize(reading);
  if (kana) entries.sort((a, b) => Number(b.japanese.some(j => normalize(j.reading) === kana)) - Number(a.japanese.some(j => normalize(j.reading) === kana)));
  return entries.slice(0, 8);
}
function has(word) { return !!database()?.prepare('SELECT 1 FROM forms WHERE form=? LIMIT 1').get(normalize(word)); }
module.exports = { database, lookup, has };
