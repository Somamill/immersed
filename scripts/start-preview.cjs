// A development supervisor, not permanent hosting. Only a local browser preview is started; native delivery uses Xcode.
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const root = path.join(__dirname, '..');
const folder = path.join(root, '.expo');
fs.mkdirSync(folder, { recursive: true });
const cli = path.join(path.dirname(require.resolve('expo/package.json')), 'bin/cli');
let child, stopping = false, retry, failures = 0;
function terminate() {
  child?.kill('SIGTERM');
  const current = child;
  const force = setTimeout(() => { if (current?.exitCode === null && current?.signalCode === null) current.kill('SIGKILL'); }, 8000);
  force.unref();
}
function start() {
  const started = Date.now();
  let output = '';
  child = spawn(process.execPath, [cli, 'start', '--web', '--localhost', '--port', '8081'], {
    cwd: root, env: { ...process.env, EXPO_OFFLINE: '1', EXPO_NO_TELEMETRY: '1' }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  function forward(stream, destination) {
    stream.on('data', data => {
      destination.write(data);
      output = (output + data.toString()).slice(-2048);
      const match = /Waiting on (https?:\/\/[^\s\u001b]+)/.exec(output);
      if (match) fs.writeFileSync(path.join(folder, 'immersed-preview.json'), JSON.stringify({ url: match[1], pid: child.pid }, null, 2));
      if (output.includes('Tunnel connection has been closed.')) { output = ''; terminate(); }
    });
  }
  forward(child.stdout, process.stdout); forward(child.stderr, process.stderr);
  child.on('error', error => console.error('Preview process error:', error.message));
  child.on('close', () => {
    if (stopping) return;
    failures = Date.now() - started >= 60000 ? 1 : failures + 1;
    // Keep the preview available for long-running sessions. A bounded retry
    // delay avoids a rapid restart loop during a prolonged local-server outage.
    const delay = Math.min(300000, 3000 * 2 ** Math.min(failures - 1, 7));
    console.error(`Preview disconnected; restarting in ${delay / 1000}s. The preview remains local.`);
    retry = setTimeout(start, delay);
  });
}
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { stopping = true; clearTimeout(retry); terminate(); });
start();
