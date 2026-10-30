// Publish the checksum-pinned corpus with repository-scoped GitHub Actions auth.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const source = require('../src/data/context-source.json');
async function main() {
  const match = /^https:\/\/github\.com\/Somamill\/immersed\/releases\/download\/(v[\d.]+)\/([^/]+)$/.exec(source.archive);
  if (!match || match[2] !== source.asset) throw new Error('Unexpected pinned archive destination');
  const tag = match[1];
  let release;
  for (let attempt = 0; attempt < 10; attempt++) {
    try { release = JSON.parse(execFileSync('gh', ['release', 'view', tag, '--json', 'assets'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })); break; }
    catch { await new Promise(resolve => setTimeout(resolve, 5000)); }
  }
  if (!release) throw new Error('Publish the matching app release before archiving its corpus');
  if (release.assets.some(asset => asset.name === source.asset)) { console.log('Pinned corpus asset already present'); return; }
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'immersed-corpus-'));
  try {
    const file = path.join(folder, source.asset);
    execFileSync('curl', ['--fail', '--location', '--retry', '2', '--output', file, source.upstream], { stdio: 'inherit' });
    if (crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex') !== source.sha256)
      throw new Error('Upstream corpus changed: refuse to publish a different snapshot');
    execFileSync('gh', ['release', 'upload', tag, file], { stdio: 'inherit' });
  } finally { fs.rmSync(folder, { recursive: true, force: true }); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
