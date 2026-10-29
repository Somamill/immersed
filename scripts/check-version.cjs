const fs = require('node:fs');
const history = require('../src/version-history.json');
const version = require('../package.json').version;
if (history[0].version !== version || require('../app.json').expo.version !== version || require('../package-lock.json').version !== version) throw new Error('App, package, lockfile and history versions must match. Use npm run version:update.');
if (!fs.readFileSync('CHANGELOG.md', 'utf8').includes(`## ${version} —`)) throw new Error('Missing changelog entry');
if (process.argv.includes('--notes')) {
  const tag = process.env.RELEASE_TAG?.replace(/^v/, '') || version;
  const release = history.find(entry => entry.version === tag);
  if (!release) throw new Error('Tag has no release notes');
  process.stdout.write(`${release.title}\n\n${release.notes.map(n => '- ' + n).join('\n')}\n`);
} else console.log(`Version ${version} is consistent across app, package and history.`);
