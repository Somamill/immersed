const path = require('node:path');
const { execFileSync } = require('node:child_process');
execFileSync(process.execPath, [path.join(path.dirname(require.resolve('expo/package.json')), 'bin/cli'), 'export', '--platform', 'all', '--output-dir', 'dist/hosted'], { stdio: 'inherit' });
