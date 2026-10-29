const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const target = path.join(__dirname, '../.data/accents.txt');
fs.mkdirSync(path.dirname(target), { recursive: true });
if (!fs.existsSync(target)) execFileSync('curl', ['--fail', '--location', '--retry', '2', '--output', target, 'https://raw.githubusercontent.com/mifunetoshiro/kanjium/9ebca4589565c696e7c39e089e2e928ad65f678c/data/source_files/raw/accents.txt'], { stdio: 'inherit' });
if (crypto.createHash('sha256').update(fs.readFileSync(target)).digest('hex') !== '8bd0dd127dab32ceec94cb03ab1ba6b68858ea73421dfa1731af2f373deb4f20') throw new Error('Pitch dataset checksum mismatch');
console.log('Pinned Kanjium pitch accents installed. Uros O., CC BY-SA 4.0; see THIRD_PARTY.md.');
