const language = require('./language.cjs');
const transcription = require('./transcription.cjs');
const { reflowCaptions, validBatch } = require('./caption-reflow.cjs');
// Development-preview API, shared through the existing Expo tunnel. Production
// will require a separately hosted service; these files never enter the client.
module.exports = function middleware(next) {
  void language.initialize().catch(() => {});
  return async (req, res, fallback) => {
    const url = new URL(req.url, 'http://localhost');
    if (!url.pathname.startsWith('/api/immersion/')) return next(req, res, fallback);
    const json = (status, value) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(value)); };
    try {
      if (url.pathname.endsWith('/reflow') && req.method === 'POST') {
        const chunks = []; let size = 0;
        for await (const chunk of req) { size += chunk.length; if (size <= 128000) chunks.push(chunk); }
        if (size > 128000) return json(413, { error: 'Caption batch too large' });
        let data;
        try { data = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { return json(400, { error: 'Invalid caption batch' }); }
        if (!validBatch(data.cues)) return json(400, { error: 'Invalid caption batch' });
        return json(200, { cues: await reflowCaptions(data.cues) });
      }
      if (req.method !== 'GET') return json(405, { error: 'Method not allowed' });
      if (url.pathname.endsWith('/analyze')) {
        const text = url.searchParams.get('text') || '';
        if (!text || text.length > 2000) return json(400, { error: 'Caption must be between 1 and 2000 characters' });
        const tokens = await language.analyze(text, true);
        const dictionary = {};
        if (url.searchParams.get('dictionary') === 'true') {
          for (const token of tokens.filter(t => t.word).slice(0, 24)) {
            const key = token.proper ? `${token.lemma}:name:${token.reading}` : token.lemma;
            if (!dictionary[key]) dictionary[key] = await language.lookup(token.lemma, token);
          }
        }
        return json(200, { tokens, dictionary });
      }
      if (url.pathname.endsWith('/dictionary')) {
        const word = url.searchParams.get('word') || '';
        if (!word || word.length > 120) return json(400, { error: 'Invalid word' });
        return json(200, { data: await language.lookup(word, { proper: url.searchParams.get('proper') === 'true', reading: (url.searchParams.get('reading') || '').slice(0, 120) }), source: 'JMdict + JMnedict / EDRDG', license: 'CC BY-SA 4.0' });
      }
      if (url.pathname.endsWith('/search')) {
        const query = (url.searchParams.get('query') || '').trim();
        if (!query || query.length > 120) return json(400, { error: 'Enter up to 120 characters' });
        return json(200, { data: await language.search(query) });
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
