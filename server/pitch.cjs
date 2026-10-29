const fs = require('node:fs');
const path = require('node:path');
let index;
function lookup(word, reading) {
  if (!index) {
    index = new Map();
    try {
      for (const line of fs.readFileSync(path.join(__dirname, '../.data/accents.txt'), 'utf8').split('\n')) {
        const [form, kana, accents] = line.trim().split('\t');
        if (!form || !kana || !accents) continue;
        const values = accents.split(',').filter(n => /^\d+$/.test(n)).map(n => ({ reading: kana, downstep: Number(n) }));
        index.set(form, [...(index.get(form) || []), ...values]);
      }
    } catch { /* Optional data never prevents ordinary word lookup. */ }
  }
  return (index.get(word) || []).filter(v => !reading || v.reading === reading);
}
module.exports = { lookup };
