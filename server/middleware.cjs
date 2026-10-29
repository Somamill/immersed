const language = require('./language.cjs');
const transcription = require('./transcription.cjs');
// Development-preview API, shared through the existing Expo tunnel. Production
// will require a separately hosted service; these files never enter the client.
module.exports = function middleware(next) {
  void language.initialize().catch(() => {});
  return async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    if (!url.pathname.startsWith('/api/immersion/')) return next(req, res);
    const json = (status, value) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(value)); };
    if (req.method !== 'GET') return json(405, { error: 'Method not allowed' });
    try {
      if (url.pathname.endsWith('/analyze')) {
        const text = url.searchParams.get('text') || '';
        if (!text || text.length > 2000) return json(400, { error: 'Caption must be between 1 and 2000 characters' });
        const tokens = await language.analyze(text, url.searchParams.get('grouped') !== 'false');
        const dictionary = {};
        if (url.searchParams.get('dictionary') === 'true') {
          for (const lemma of [...new Set(tokens.filter(t => t.word).map(t => t.lemma))].slice(0, 24)) dictionary[lemma] = await language.lookup(lemma);
        }
        return json(200, { tokens, dictionary });
      }
      if (url.pathname.endsWith('/dictionary')) {
        const word = url.searchParams.get('word') || '';
        if (!word || word.length > 120) return json(400, { error: 'Invalid word' });
        return json(200, { data: await language.lookup(word), source: 'JMdict / EDRDG', license: 'CC BY-SA 4.0' });
      }
      if (url.pathname.endsWith('/transcribe')) {
        const id = url.searchParams.get('videoId') || '';
        if (!/^[\w-]{11}$/.test(id)) return json(400, { error: 'Invalid video ID' });
        return json(200, await transcription.start(id, url.searchParams.get('retry') === 'true'));
      }
      return json(404, { error: 'Unknown endpoint' });
    } catch { return json(503, { error: 'Language service unavailable. Install the dictionary with npm run language:setup.' }); }
  };
};
