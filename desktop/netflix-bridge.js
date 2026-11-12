/* Runs only in the Netflix main frame. Reads subtitle responses already loaded by
   its player, HTML text tracks, or its visible original subtitle text. */
(() => {
  'use strict';
  if (!['netflix.com', 'www.netflix.com'].includes(location.hostname) || window.__immersedNetflixBridge) return;
  window.__immersedNetflixBridge = true;
  const post = data => window.webkit?.messageHandlers?.immersedNetflix?.postMessage(data);
  let titleID = '', lastLine = '', lastTrack = '', lastPayload = null, candidates = [];
  let hoverSession = null;
  let reportedError = '', loadingSince = performance.now();
  let showOriginal = true, selectedLanguage = '', currentLanguage = '', reportedTracks = '', observedLine = false, lastState = '', lastStateAt = 0, lastTracksAt = 0, observedVideo = null, focusMode = false, captionDirty = false;
  const emit = payload => { lastPayload = payload; post(payload); };
  function resetTitle() {
    const id = location.pathname.match(/\/watch\/(\d+)/)?.[1] || '';
    if (id !== titleID) { titleID = id; hoverSession = null; lastTrack = ''; lastLine = ''; lastPayload = null; candidates = []; currentLanguage = ''; selectedLanguage = ''; observedLine = false; lastState = ''; reportedError = ''; loadingSince = performance.now(); post({ event: 'reset', id }); }
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
    captionDirty = true; sync(true);
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
  function netflixPlayer() {
    try {
      const api = window.netflix?.appContext?.state?.playerApp?.getAPI?.().videoPlayer;
      const ids = api?.getAllPlayerSessionIds?.() || [];
      const id = ids.find(id => String(id).includes('watch')) || ids[0];
      return id == null ? null : api.getVideoPlayerBySessionId(id);
    } catch { return null; }
  }
  function playbackError(video) {
    // Netflix can replace <video> with an error page; report it even without media.
    const error = document.querySelector('[data-uia="error-code"], .nfp-error-code, .error-page, .watch-video--error');
    const text = (error?.innerText || (!video ? document.body?.innerText : '') || '').replace(/\uFEFF/gu, '');
    const code = text.match(/\b[SMDFU]\d{4}[-–]\d{3,5}(?:[-–]\d+)?\b/u)?.[0];
    const reason = code ? 'Netflix playback failed (' + code + '). Retry playback or open this title in Safari.' : video?.error ? 'Netflix could not play this title. Retry playback or open it in Safari.' : '';
    if (reason && reason !== reportedError) { reportedError = reason; post({event:'error', code:code || 'media', message:reason}); }
    if (video?.readyState > 0 && !reason) { loadingSince = performance.now(); reportedError = ''; }
    if (!reason && !reportedError && performance.now() - loadingSince > 30000) {
      reportedError = 'loading'; post({event:'error',code:'loading',message:'Netflix is not starting. Retry playback or open this title in Safari.'});
    }
  }
  window.immersedNetflixCommand = command => {
    const video = document.querySelector('video');
    if (command.command === 'fullscreenState') { focusMode = Boolean(command.value); sync(true); return; }
    if (command.command === 'snapshot') { if (lastPayload) post(lastPayload); return; }
    if (command.command === 'original') { showOriginal = Boolean(command.value); sync(true); return; }
    if (command.command === 'subtitles') {
      document.querySelector('[data-uia="control-audio-subtitle"], [data-uia="control-audio-subtitles"], button[aria-label="音声・字幕"], button[aria-label="Audio & Subtitles"]')?.click();
      return;
    }
    if (!video) return;
    const player = netflixPlayer();
    const start = () => typeof player?.play === 'function' ? player.play() : video.play();
    const halt = () => typeof player?.pause === 'function' ? player.pause() : video.pause();
    try {
      if (command.command === 'hoverStart') {
        if (hoverSession?.id === command.value) return;
        const wasRunning = hoverSession?.resume || (!video.paused && !video.ended);
        hoverSession = {id:command.value,resume:wasRunning,title:titleID}; halt(); return;
      }
      if (command.command === 'hoverEnd' || command.command === 'hoverCancel') {
        if (hoverSession?.id !== command.value) return;
        const resume = command.command === 'hoverEnd' && hoverSession.resume && hoverSession.title === titleID;
        hoverSession = null;
        if (resume) start()?.catch?.(()=>post({event:'error',message:'Use Netflix’s play button to resume this title.'}));
        return;
      }
      if (['play','pause','seek'].includes(command.command)) hoverSession = null;
      if (command.command === 'play') {
        const result = start();
        result?.catch?.(() => post({event:'error',message:'Use the Netflix play button to start this title.'}));
      }
      if (command.command === 'pause') halt();
      if (command.command === 'seek' && Number.isFinite(command.value)) {
        // Netflix controls its MediaSource/DRM timeline in milliseconds. Seeking
        // the media element directly can leave that controller out of sync.
        if (typeof player?.seek === 'function') player.seek(Math.max(0, command.value) * 1000);
        else video.currentTime = Math.max(0, command.value);
      }
      if (command.command === 'rate' && Number.isFinite(command.value)) {
        const rate = Math.max(.5, Math.min(2, command.value));
        if (typeof player?.setPlaybackRate === 'function') player.setPlaybackRate(rate);
        else video.playbackRate = rate;
      }
    } catch { post({event:'error',message:'Netflix could not complete playback. Retry this title.'}); }
    if (command.command === 'language' && typeof command.value === 'string') {
      selectedLanguage = command.value;
      for (const track of Array.from(video.textTracks)) if (track.kind === 'subtitles' || track.kind === 'captions') track.mode = track.language === selectedLanguage ? 'showing' : 'disabled';
      lastTrack = ''; lastLine = '';
    }
  };
  document.addEventListener('keydown', event => {
    if (event.ctrlKey || event.metaKey || event.altKey || event.target.closest?.('input, textarea, select, [contenteditable="true"]')) return;
    if (/^[1-4]$/.test(event.key) && !event.shiftKey && !event.repeat && !event.isComposing) { event.preventDefault(); event.stopImmediatePropagation(); post({event:'shortcut',command:'wordStatus',key:event.key}); return; }
    if (event.code === 'Space' || event.key.toLowerCase() === 'k') hoverSession = null;
    const command = event.key === 'ArrowLeft' ? 'previous' : event.key === 'ArrowRight' ? 'next' : event.key.toLowerCase() === 'f' ? 'fullscreen' : event.key === 'Escape' && focusMode ? 'exitFullscreen' : '';
    if (!command || !location.pathname.includes('/watch/')) return;
    event.preventDefault(); event.stopImmediatePropagation(); post({ event: 'shortcut', command });
  }, true);
  function sync(force = false) {
    const id = resetTitle();
    const video = document.querySelector('video');
    if (!id) return;
    playbackError(video);
    if (!video) return;
    if (video !== observedVideo) {
      if (observedVideo) for (const name of mediaEvents) observedVideo.removeEventListener(name, mediaChanged);
      observedVideo = video;
      for (const name of mediaEvents) video.addEventListener(name, mediaChanged);
    }
    const now = performance.now();
    const state = { event: 'state', id, title: document.title.replace(/\s*[-|]\s*Netflix\s*$/, ''), time: video.currentTime, duration: Number.isFinite(video.duration) ? video.duration : 0, paused: video.paused, rate: video.playbackRate };
    const stateKey = JSON.stringify(state);
    if (stateKey !== lastState && (force || now - lastStateAt >= 100)) { lastState = stateKey; lastStateAt = now; post(state); }

    const tracks = Array.from(video.textTracks).filter(t => ['subtitles', 'captions'].includes(t.kind));
    const trackInfo = tracks.map(t => ({ language: t.language, label: t.label, selected: t.mode === 'showing' }));
    const trackKey = JSON.stringify(trackInfo);
    if (trackKey !== reportedTracks) { reportedTracks = trackKey; post({ event: 'tracks', tracks: trackInfo }); }
    const track = tracks.find(t => selectedLanguage ? t.language === selectedLanguage && t.mode !== 'disabled' : t.mode === 'showing');
    if (track?.cues?.length && (force || now - lastTracksAt > 1000)) {
      lastTracksAt = now;
      const cues = Array.from(track.cues).map(c => ({ start: c.startTime, end: c.endTime, text: c.text })).filter(c => c.text && c.end > c.start);
      const key = JSON.stringify([track.language, cues.length, cues[0], cues.at(-1)]);
      if (key !== lastTrack) { lastTrack = key; currentLanguage = track.language; emit({ event: 'cues', cues, language: track.language, label: track.label }); }
    }
    const container = document.querySelector('.player-timedtext');
    const text = container?.textContent?.replace(/\s+/gu, ' ').trim() || '';
    // Netflix may preload more than one language. Only adopt a downloaded track
    // once its timed text matches the subtitle actually selected in its player.
    const normalize = value => value.replace(/\s/gu, '');
    const candidate = (text !== lastLine || captionDirty || !lastPayload) && text && candidates.find(c => c.cues.some(cue => cue.start <= video.currentTime + .25 && cue.end > video.currentTime - .25 && normalize(cue.text) === normalize(text)));
    captionDirty = false;
    if (candidate && candidate.key !== lastTrack) {
      lastTrack = candidate.key; currentLanguage = candidate.language;
      emit({ event: 'cues', cues: candidate.cues, language: candidate.language });
    }
    // Retain the accessible subtitle text; only hide its visual duplicate on request.
    const opacity = showOriginal && !focusMode ? '' : '0';
    if (container && container.style.opacity !== opacity) container.style.opacity = opacity;
    if ((container || observedLine) && (text !== lastLine || !observedLine)) { observedLine = true; lastLine = text; post({ event: 'line', id, text, time: video.currentTime, language: currentLanguage }); }
  }
  const mediaEvents = ['play', 'pause', 'seeking', 'seeked', 'ratechange', 'timeupdate', 'loadedmetadata'];
  const mediaChanged = () => sync(true);
  let queued = false;
  new MutationObserver(() => {
    if (queued) return;
    queued = true; queueMicrotask(() => { queued = false; sync(); });
  }).observe(document, { childList: true, characterData: true, subtree: true });
  // DOM changes carry the exact displayed line immediately; polling is only a
  // clock/discovery fallback, not the subtitle display cadence.
  setInterval(sync, 100);
  sync(true);
  const fullscreen = () => { if (!location.pathname.includes('/watch/')) return false; post({ event: 'shortcut', command: 'fullscreen' }); return true; };
  document.addEventListener('click', event => {
    const button = event.target.closest?.('button');
    if (!button) return;
    const name = (button.getAttribute('data-uia') || '') + ' ' + (button.getAttribute('aria-label') || '');
    if (/control-(?:play|pause)|再.?生|一時停止|\b(?:play|pause)\b/iu.test(name)) hoverSession = null;
    if (/fullscreen|full.screen|全画面|フルスクリーン/iu.test(name) && fullscreen()) { event.preventDefault(); event.stopImmediatePropagation(); }
  }, true);
  // Keep the video in the app's fullscreen layout so the study overlay remains
  // interactive rather than being covered by WebKit's separate fullscreen view.
  for (const method of ['requestFullscreen', 'webkitRequestFullscreen', 'webkitRequestFullScreen']) {
    const original = Element.prototype[method];
    if (typeof original !== 'function') continue;
    Element.prototype[method] = function (...args) {
      if ((this.matches?.('video') || this.querySelector?.('video')) && fullscreen()) return Promise.resolve();
      return original.apply(this, args);
    };
  }

})();
