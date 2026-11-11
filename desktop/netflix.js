/* Original Netflix captions only. No media extraction or speech recognition. */
(function (root) {
  'use strict';
  function netflixURL(value) {
    try {
      const url = new URL(value);
      if (url.protocol !== 'https:' || !['netflix.com', 'www.netflix.com'].includes(url.hostname) || url.username || url.password || url.port) return null;
      const watch = url.pathname.match(/^\/(?:[a-z]{2}(?:-[A-Z]{2})?\/)?watch\/(\d+)\/?$/);
      return watch ? 'https://www.netflix.com/watch/' + watch[1] : null;
    } catch { return null; }
  }
  function parseCaptions(text) {
    if (typeof text !== 'string' || text.length > 8e6) return null;
    const clean = value => value.replace(/\s+/gu, ' ').trim();
    if (/^\uFEFF?WEBVTT/.test(text.trimStart())) {
      const time = value => value.split(':').reduce((n, part) => n * 60 + Number(part.replace(',', '.')), 0);
      const cues = [];
      for (const block of text.replace(/\r/g, '').split(/\n\s*\n/)) {
        const lines = block.split('\n'), i = lines.findIndex(x => x.includes('-->'));
        if (i < 0) continue;
        const times = lines[i].match(/([\d:.]+)\s+-->\s+([\d:.]+)/);
        if (!times) continue;
        const start = time(times[1]), end = time(times[2]);
        const doc = new DOMParser().parseFromString('<body>' + lines.slice(i + 1).join(' ') + '</body>', 'text/html');
        const caption = clean(doc.body.textContent);
        if (Number.isFinite(start) && end > start && caption) cues.push({ start, end, text: caption });
      }
      return cues.length ? { cues, language: '' } : null;
    }
    if (!/<(?:\w+:)?tt[\s>]/.test(text)) return null;
    const doc = new DOMParser().parseFromString(text, 'application/xml');
    if (doc.getElementsByTagName('parsererror').length || doc.documentElement.localName !== 'tt') return null;
    const tt = doc.documentElement;
    const attr = (node, name) => [...node.attributes].find(a => a.localName === name)?.value;
    const tickRate = Number(attr(tt, 'tickRate')) || 1, frameRate = Number(attr(tt, 'frameRate')) || 30;
    const multiplier = (attr(tt, 'frameRateMultiplier') || '1 1').split(' ').map(Number);
    const fps = frameRate * (multiplier[0] / multiplier[1] || 1);
    const time = value => {
      if (!value) return NaN;
      const offset = value.match(/^(\d+(?:\.\d+)?)(h|m|s|ms|f|t)$/);
      if (offset) return Number(offset[1]) * ({ h: 3600, m: 60, s: 1, ms: .001, f: 1 / fps, t: 1 / tickRate }[offset[2]]);
      const clock = value.match(/^(\d+):(\d{2}):(\d{2})(?:\.(\d+)|:(\d+))?$/);
      return clock ? Number(clock[1]) * 3600 + Number(clock[2]) * 60 + Number(clock[3]) + (clock[4] ? Number('0.' + clock[4]) : Number(clock[5] || 0) / fps) : NaN;
    };
    const textOf = node => [...node.childNodes].map(child => child.nodeType === 3 ? child.textContent : child.localName === 'br' ? ' ' : textOf(child)).join('');
    const cues = [...doc.getElementsByTagNameNS('*', 'p')].map(p => {
      const start = time(p.getAttribute('begin'));
      let end = time(p.getAttribute('end'));
      if (!Number.isFinite(end)) end = start + time(p.getAttribute('dur'));
      return { start, end, text: clean(textOf(p)) };
    }).filter(c => Number.isFinite(c.start) && c.start >= 0 && c.end > c.start && c.text).sort((a, b) => a.start - b.start || a.end - b.end);
    return cues.length ? { cues, language: attr(tt, 'lang') || '' } : null;
  }
  root.ImmersedNetflix = { netflixURL, parseCaptions };
  if (typeof module === 'object') module.exports = root.ImmersedNetflix;
})(globalThis);
