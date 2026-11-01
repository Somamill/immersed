/* Persistent HTTP service: no Metro process, WebSocket tunnel or expiring URL. */
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { pipeline } = require('node:stream');
const root = path.join(__dirname, '..');
const hash = bytes => createHash('sha256').update(bytes).digest('base64url');
function publicOrigin(value) {
  const url = new URL(value);
  if (url.username || url.password || url.search || url.hash || url.pathname !== '/' ||
      (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))))
    throw new Error('PUBLIC_ORIGIN must be an HTTPS origin (HTTP is allowed only on localhost)');
  return url.origin;
}
function createHostedServer({ directory = path.join(root, 'dist/hosted'), origin = process.env.PUBLIC_ORIGIN,
  api, config = require('../app.json').expo } = {}) {
  if (!origin) throw new Error('Set PUBLIC_ORIGIN to the permanent HTTPS address');
  origin = publicOrigin(origin);
  const metadataPath = path.join(directory, 'metadata.json');
  const metadata = fs.existsSync(metadataPath) ? JSON.parse(fs.readFileSync(metadataPath, 'utf8')) : null;
  const manifestCache = new Map();
  function manifest(platform) {
    if (manifestCache.has(platform)) return manifestCache.get(platform);
    const files = metadata?.fileMetadata?.[platform];
    if (!files) return null;
    const bundle = fs.readFileSync(path.join(directory, files.bundle));
    const digest = createHash('sha256').update(bundle).digest('hex');
    const id = [digest.slice(0,8),digest.slice(8,12),'4'+digest.slice(13,16),'a'+digest.slice(17,20),digest.slice(20,32)].join('-');
    const assets = files.assets.map(asset => {
      const bytes = fs.readFileSync(path.join(directory, asset.path));
      return { key: path.basename(asset.path), hash: hash(bytes), fileExtension: asset.ext,
        contentType: asset.ext === 'png' ? 'image/png' : 'application/octet-stream', url: origin + '/' + asset.path };
    });
    const app = { ...config, sdkVersion: '58.0.0', platforms: ['ios','android'], hostUri: new URL(origin).host,
      iconUrl: origin + '/app-icon.png', extra: { ...config.extra, apiBaseUrl: origin, router: {} } };
    const data = { id, createdAt: fs.statSync(metadataPath).mtime.toISOString(), runtimeVersion: 'exposdk:58.0.0',
      launchAsset: { key: 'bundle', hash: hash(bundle), contentType: 'application/javascript', url: origin + '/' + files.bundle },
      assets, metadata: {}, extra: { eas: {}, expoClient: app, expoGo: { packagerOpts: { dev: false }, mainModuleName: 'node_modules/expo-router/entry' }, scopeKey: config.extra?.storageScopeKey || '@somamill/immersed' } };
    manifestCache.set(platform, data); return data;
  }
  const respond = (res, code, body, type = 'application/json; charset=utf-8', headers = {}) => {
    res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...headers });
    res.end(typeof body === 'string' ? body : JSON.stringify(body));
  };
  const landing = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Immersed · Japanese immersion</title><style>body{margin:0;background:#050907;color:#f3f3f3;font:18px system-ui;display:grid;place-items:center;min-height:100svh}main{max-width:520px;padding:32px}img{width:76px;border-radius:20px}h1{font-size:48px;letter-spacing:-2px}p{color:#afbdb4;line-height:1.6}a{display:inline-block;color:#0b1b12;background:#b4dec4;padding:16px 24px;border-radius:18px;text-decoration:none;font-weight:650}small{display:block;margin-top:30px;color:#7d8d82}</style><main><img src="/app-icon.png" alt="Immersed"><h1>Japanese worth watching.</h1><p>Watch a Japanese video. Tap a subtitle word. Keep your flow.</p><a href="${origin.replace('https:','exps:').replace('http:','exp:')}">Open in Expo Go</a><p>Install Expo Go on your iPhone, then open this link. The backend runs on this host rather than an Expo development tunnel.</p><small>Immersed ${config.version} · Japanese subtitle availability and speech quality depend on the source and configured worker.</small></main></html>`;
  const staticResponse = (req, res, filename, type) => {
    if (!fs.existsSync(filename) || !fs.statSync(filename).isFile()) return respond(res, 404, { error: 'Asset not found' });
    const etag = '"' + hash(fs.readFileSync(filename)) + '"';
    if (req.headers['if-none-match'] === etag) { res.writeHead(304); return res.end(); }
    res.writeHead(200, { 'Content-Type': type, 'Content-Length': fs.statSync(filename).size,
      'Cache-Control': filename.includes(directory + path.sep) ? 'public, max-age=31536000, immutable' : 'public, max-age=3600', ETag: etag,
      'X-Content-Type-Options': 'nosniff' });
    if (req.method === 'HEAD') return res.end();
    pipeline(fs.createReadStream(filename), res, () => {});
  };
  const fallback = (req, res) => {
    const url = new URL(req.url, origin);
    if (url.pathname === '/healthz') return respond(res, 200, { status: 'ok', version: config.version, nativeBundle: !!metadata, apiOrigin: origin, hosting: 'standalone' });
    if (req.method !== 'GET' && req.method !== 'HEAD') return respond(res, 405, { error: 'Method not allowed' });
    if (url.pathname === '/' || url.pathname === '/manifest') {
      const platform = req.headers['expo-platform'];
      if (platform) {
        const value = manifest(platform);
        return value ? respond(res, 200, value, 'application/expo+json', { 'expo-protocol-version': '0', 'expo-sfv-version': '0', Vary: 'expo-platform' }) : respond(res, 503, { error: 'Export the requested platform before starting the host' });
      }
      return respond(res, 200, landing, 'text/html; charset=utf-8');
    }
    if (url.pathname === '/app-icon.png') return staticResponse(req, res, path.join(root, 'assets/icon.png'), 'image/png');
    if (url.pathname.startsWith('/assets/') || url.pathname.startsWith('/_expo/')) {
      let decoded;
      try { decoded = decodeURIComponent(url.pathname); } catch { return respond(res, 400, { error: 'Invalid asset path' }); }
      const filename = path.resolve(directory, '.' + decoded);
      if (!filename.startsWith(path.resolve(directory) + path.sep)) return respond(res, 403, { error: 'Invalid asset path' });
      return staticResponse(req, res, filename, /\.(js|hbc)$/.test(filename) ? 'application/javascript' : 'application/octet-stream');
    }
    return respond(res, 404, { error: 'Not found' });
  };
  const handler = api ? api(fallback) : require('./middleware.cjs')(fallback);
  return http.createServer((req, res) => Promise.resolve().then(() => handler(req, res, () => fallback(req, res))).catch(() => { if (!res.headersSent) respond(res, 500, { error: 'Service error' }); else res.destroy(); }));
}
if (require.main === module) {
  const port = Number(process.env.PORT || 8080);
  const server = createHostedServer();
  server.listen(port, '0.0.0.0', () => console.log('Immersed persistent host listening on', port));
  for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => server.close(() => process.exit(0)));
}
module.exports = { createHostedServer, publicOrigin };
