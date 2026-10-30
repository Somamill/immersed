// A development supervisor, not permanent hosting. Expo remains the tunnel owner.
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
  child = spawn(process.execPath, ['--require', path.join(__dirname, 'expo-proxy.cjs'), cli, 'start', '--tunnel', '--go', '--port', '8081'], {
    cwd: root, env: process.env, stdio: ['ignore', 'pipe', 'pipe'],
  });
  function forward(stream, destination) {
    stream.on('data', data => {
      destination.write(data);
      output = (output + data.toString()).slice(-2048);
      const match = /Waiting on (https?:\/\/[^\s\u001b]+)/.exec(output);
      if (match) fs.writeFileSync(path.join(folder, 'immersed-preview.json'), JSON.stringify({ url: match[1].replace('http:', 'https:'), pid: child.pid }, null, 2));
      if (output.includes('Tunnel connection has been closed.')) { output = ''; terminate(); }
    });
  }
  forward(child.stdout, process.stdout); forward(child.stderr, process.stderr);
  child.on('error', error => console.error('Preview process error:', error.message));
  child.on('close', () => {
    if (stopping) return;
    failures = Date.now() - started >= 60000 ? 1 : failures + 1;
    if (failures > 8) { console.error('Preview stopped after repeated connection failures. Check the network/service before restarting.'); process.exitCode = 1; return; }
    const delay = Math.min(30000, 3000 * 2 ** (failures - 1));
    console.error(`Preview disconnected; restarting in ${delay / 1000}s. Expo may assign a new preview address.`);
    retry = setTimeout(start, delay);
  });
}
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { stopping = true; clearTimeout(retry); terminate(); });
start();
