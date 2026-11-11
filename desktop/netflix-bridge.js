/* Runs only in the Netflix main frame. Reads subtitle responses already loaded by
   its player, HTML text tracks, or its visible original subtitle text. */
(() => {
  'use strict';
  if (!['netflix.com', 'www.netflix.com'].includes(location.hostname) || window.__immersedNetflixBridge) return;
  window.__immersedNetflixBridge = true;
  const post = data => window.webkit?.messageHandlers?.immersedNetflix?.postMessage(data);
  let titleID = '', lastLine = '', lastTrack = '', lastPayload = null, candidates = [];
  let showOriginal = true, selectedLanguage = '', currentLanguage = '', reportedTracks = '';
  const emit = payload => { lastPayload = payload; post(payload); };
  function resetTitle() {
    const id = location.pathname.match(/\/watch\/(\d+)/)?.[1] || '';
    if (id !== titleID) { titleID = id; lastTrack = ''; lastLine = ''; lastPayload = null; candidates = []; currentLanguage = ''; selectedLanguage = ''; post({ event: 'reset', id }); }
    return id;
  }
  function receive(text) {
    if (!resetTitle()) return;
    const result = ImmersedNetflix.parseCaptions(text);
    if (!result || result.cues.length > 30000) return;
    const key = JSON.stringify([result.language, result.cues.length, result.cues[0], result.cues.at(-1)]);
    if (candidates.some(c => c.key === key)) return;
    candidates.push({ key, ...result });
    if (candidates.length > 4) candidates.shift();
  }
  const originalFetch = window.fetch;
  window.fetch = function (...args) {
    const page = location.pathname;
    return originalFetch.apply(this, args).then(response => {
      const type = response.headers.get('content-type') || '';
      // Only inspect textual caption resources; never clone video or account JSON.
      if (/(?:ttml|dfxp|vtt|xml)/i.test(type)) response.clone().text().then(text => { if (location.pathname === page) receive(text); }).catch(() => {});
      return response;
    });
  };
  const send = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.send = function (...args) {
    const page = location.pathname;
    this.addEventListener('load', () => {
      if (location.pathname !== page) return;
      if (this.responseType && this.responseType !== 'text') return;
      const type = this.getResponseHeader('content-type') || '';
      if (/(?:ttml|dfxp|vtt|xml)/i.test(type)) { try { receive(this.responseText); } catch {} }
    }, { once: true });
    return send.apply(this, args);
  };
  window.immersedNetflixCommand = command => {
    const video = document.querySelector('video');
    if (command.command === 'snapshot') { if (lastPayload) post(lastPayload); return; }
    if (command.command === 'original') { showOriginal = Boolean(command.value); return; }
    if (!video) return;
    if (command.command === 'play') video.play().catch(() => post({ event: 'error', message: 'Use the Netflix play button to start this title.' }));
    if (command.command === 'pause') video.pause();
    if (command.command === 'seek' && Number.isFinite(command.value)) video.currentTime = Math.max(0, command.value);
    if (command.command === 'rate' && Number.isFinite(command.value)) video.playbackRate = Math.max(.5, Math.min(2, command.value));
    if (command.command === 'language' && typeof command.value === 'string') {
      selectedLanguage = command.value;
      for (const track of Array.from(video.textTracks)) if (track.kind === 'subtitles' || track.kind === 'captions') track.mode = track.language === selectedLanguage ? 'showing' : 'disabled';
      lastTrack = ''; lastLine = '';
    }
  };
  document.addEventListener('keydown', event => {
    if (event.ctrlKey || event.metaKey || event.altKey || event.target.closest?.('input, textarea, select, [contenteditable="true"]')) return;
    const command = event.key === 'ArrowLeft' ? 'previous' : event.key === 'ArrowRight' ? 'next' : event.key.toLowerCase() === 'f' ? 'fullscreen' : '';
    if (!command || !location.pathname.includes('/watch/')) return;
    event.preventDefault(); event.stopImmediatePropagation(); post({ event: 'shortcut', command });
  }, true);
  setInterval(() => {
    const id = resetTitle();
    const video = document.querySelector('video');
    if (!video || !id) return;
    post({ event: 'state', id, title: document.title.replace(/\s*[-|]\s*Netflix\s*$/, ''), time: video.currentTime, duration: Number.isFinite(video.duration) ? video.duration : 0, paused: video.paused, rate: video.playbackRate });
    const tracks = Array.from(video.textTracks).filter(t => ['subtitles', 'captions'].includes(t.kind));
    const trackInfo = tracks.map(t => ({ language: t.language, label: t.label, selected: t.mode === 'showing' }));
    const trackKey = JSON.stringify(trackInfo);
    if (trackKey !== reportedTracks) { reportedTracks = trackKey; post({ event: 'tracks', tracks: trackInfo }); }
    const track = tracks.find(t => selectedLanguage ? t.language === selectedLanguage && t.mode !== 'disabled' : t.mode === 'showing');
    if (track?.cues?.length) {
      const cues = Array.from(track.cues).map(c => ({ start: c.startTime, end: c.endTime, text: c.text })).filter(c => c.text && c.end > c.start);
      const key = JSON.stringify([track.language, cues.length, cues[0], cues.at(-1)]);
      if (key !== lastTrack) { lastTrack = key; currentLanguage = track.language; emit({ event: 'cues', cues, language: track.language, label: track.label }); }
    }
    const container = document.querySelector('.player-timedtext');
    const text = container?.textContent?.replace(/\s+/gu, ' ').trim() || '';
    // Netflix may preload more than one language. Only adopt a downloaded track
    // once its timed text matches the subtitle actually selected in its player.
    const normalize = value => value.replace(/\s/gu, '');
    const candidate = text && candidates.find(c => c.cues.some(cue => cue.start <= video.currentTime + .25 && cue.end > video.currentTime - .25 && normalize(cue.text) === normalize(text)));
    if (candidate && candidate.key !== lastTrack) {
      lastTrack = candidate.key; currentLanguage = candidate.language;
      emit({ event: 'cues', cues: candidate.cues, language: candidate.language });
    }
    // Retain the accessible subtitle text; only hide its visual duplicate on request.
    if (container) container.style.opacity = showOriginal ? '' : '0';
    if (text !== lastLine) { lastLine = text; post({ event: 'line', text, time: video.currentTime, language: currentLanguage }); }
  }, 200);
})();
