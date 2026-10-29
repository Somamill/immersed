// Runs before the page loads, then again after navigation. Only caption responses
// are observed; audio, account traffic and unrelated requests are never captured.
export const YOUTUBE_BOOTSTRAP = String.raw`(() => {
  if (!/(^|\.)youtube\.com$/.test(location.hostname)) return;
  if (window.__immersedBootstrap) { window.__immersedApplyOptions?.(); return; }
  window.__immersedBootstrap = true;
  window.__immersedOptions = window.__immersedOptions || { dark: true, hideShorts: true, fillPortrait: true };
  const css = document.createElement('style');
  css.textContent = 'html[data-immersed-dark] { color-scheme:dark!important; background:#000!important; --yt-spec-base-background:#000!important; --yt-spec-raised-background:#171717!important; --yt-spec-menu-background:#171717!important; --yt-spec-general-background-a:#000!important; --yt-spec-general-background-b:#000!important; --yt-spec-text-primary:#eee!important; --yt-spec-text-secondary:#aaa!important; --yt-spec-brand-background-primary:#000!important; --yt-spec-brand-background-secondary:#171717!important; --yt-spec-brand-background-solid:#000!important; } html[data-immersed-dark] body, html[data-immersed-dark] ytm-app, html[data-immersed-dark] ytm-search, html[data-immersed-dark] ytm-mobile-topbar-renderer, html[data-immersed-dark] ytm-header-bar, html[data-immersed-dark] ytm-searchbox, html[data-immersed-dark] .searchbox-input, html[data-immersed-dark] .pivot-bar-renderer { background-color:#000!important; color:#eee!important; } html[data-immersed-fill] video.html5-main-video { width:100vw!important; height:100vh!important; top:0!important; left:0!important; object-fit:cover!important; } [data-immersed-short] { display:none!important; }';
  let preferenceDark;
  const flag = (root, name, enabled) => {
    if (enabled && !root.hasAttribute(name)) root.setAttribute(name, '');
    if (!enabled && root.hasAttribute(name)) root.removeAttribute(name);
  };
  window.__immersedApplyOptions = () => {
    const root = document.documentElement;
    if (!root) return;
    if (!css.isConnected) root.appendChild(css);
    const options = window.__immersedOptions;
    flag(root, 'data-immersed-dark', options.dark);
    flag(root, 'dark', options.dark);
    flag(root, 'data-immersed-fill', options.fillPortrait && /^\/(embed\/|watch)/.test(location.pathname));
    root.style.colorScheme = options.dark ? 'dark' : 'light';
    if (preferenceDark !== options.dark) {
      preferenceDark = options.dark;
      // Preserve all other PREF fields and flags, including language preferences.
      // YouTube's preference format is unofficial; CSS remains the fallback.
      try {
        const current = document.cookie.split('; ').find(c => c.startsWith('PREF='))?.slice(5) || '';
        const pref = new URLSearchParams(current);
        const rawFlags = pref.get('f6') || '0';
        const flags = /^[a-f0-9]+$/i.test(rawFlags) ? BigInt('0x' + rawFlags) : 0n;
        pref.set('f6', ((flags & ~0xc00n) | (options.dark ? 0x400n : 0x800n)).toString(16));
        document.cookie = 'PREF=' + pref.toString() + '; path=/; SameSite=Lax; Secure';
      } catch {}
    }
    if (location.pathname.startsWith('/embed/')) return;
    document.querySelectorAll('ytm-reel-shelf-renderer, ytm-shorts-lockup-view-model, ytm-shorts-lockup-view-model-v2, ytd-reel-shelf-renderer, ytd-rich-section-renderer:has(a[href*="/shorts/"])').forEach(node => flag(node, 'data-immersed-short', options.hideShorts));
    document.querySelectorAll('a[href*="/shorts/"]').forEach(link => flag(link.closest('ytm-rich-item-renderer, ytm-video-with-context-renderer, ytd-rich-item-renderer') || link, 'data-immersed-short', options.hideShorts));
  };
  const captionUrl = input => {
    try {
      const url = new URL(input, location.href);
      return url.protocol === 'https:' && /(^|\.)youtube\.com$/.test(url.hostname) && url.pathname === '/api/timedtext' && /^ja(?:-|$)/.test(url.searchParams.get('lang') || '') && (!url.searchParams.get('tlang') || url.searchParams.get('tlang') === 'ja') ? url : null;
    } catch { return null; }
  };
  let lastResponse = '', lastId = '';
  window.__immersedReadCaptionResponse = (input, raw) => {
    const url = captionUrl(input);
    const videoId = url?.searchParams.get('v');
    if (!videoId || !/^[A-Za-z0-9_-]{11}$/.test(videoId) || typeof raw !== 'string' || !raw.trim() || raw.length > 2 * 1024 * 1024) return false;
    if (lastId === videoId && lastResponse === raw) return true;
    try {
      let data;
      if (raw.trim().startsWith('<')) {
        const xml = new DOMParser().parseFromString(raw, 'application/xml');
        if (xml.querySelector('parsererror')) return false;
        data = { events: [...xml.querySelectorAll('text[start], body > p[t]')].map(node => {
          const multiplier = node.hasAttribute('start') ? 1000 : 1;
          const start = Number(node.getAttribute(multiplier === 1000 ? 'start' : 't'));
          const duration = Number(node.getAttribute(multiplier === 1000 ? 'dur' : 'd') || '0');
          return { tStartMs: start * multiplier, dDurationMs: duration * multiplier || 3000, segs: [{ utf8: node.textContent || '' }] };
        }) };
      } else data = JSON.parse(raw);
      if (!Array.isArray(data?.events) || !data.events.some(e => e.segs?.some(s => typeof s.utf8 === 'string' && s.utf8.trim()))) return false;
      window.ReactNativeWebView?.postMessage(JSON.stringify({ type: 'captionData', videoId, data }));
      lastId = videoId; lastResponse = raw;
      return true;
    } catch { return false; }
  };
  const originalFetch = window.fetch;
  if (originalFetch) window.fetch = function(...args) {
    const result = originalFetch.apply(this, args);
    const url = typeof args[0] === 'string' || args[0] instanceof URL ? String(args[0]) : args[0]?.url;
    if (captionUrl(url)) result.then(response => { if (response.ok) return response.clone().text().then(raw => window.__immersedReadCaptionResponse(url, raw)); }).catch(() => {});
    return result;
  };
  const open = XMLHttpRequest.prototype.open;
  const observed = new WeakSet(), requests = new WeakMap();
  XMLHttpRequest.prototype.open = function(method, url, ...rest) {
    requests.set(this, String(url));
    if (!observed.has(this)) {
      observed.add(this);
      this.addEventListener('load', () => {
        const target = requests.get(this);
        if (!captionUrl(target) || this.status < 200 || this.status >= 300) return;
        try { window.__immersedReadCaptionResponse(target, this.responseType === 'json' ? JSON.stringify(this.response) : this.responseText); } catch {}
      });
    }
    return open.call(this, method, url, ...rest);
  };
  window.__immersedApplyOptions();
  document.addEventListener('DOMContentLoaded', window.__immersedApplyOptions, { once: true });
})(); true;`;

// Experimental adapter to YouTube's real Japanese tracks and visible captions.
// This does not claim to recognize speech when no source track exists.
export const CAPTION_BRIDGE = YOUTUBE_BOOTSTRAP + String.raw`(() => {
  if (window.__immersedBridge || !/(^|\.)youtube\.com$/.test(location.hostname)) return;
  window.__immersedBridge = true;
  let last = '', lastHref = location.href, lastVideo = null, captionText = '', captionTime = 0, clock = 0, lastModuleAttempt = 0, lastTrackChoice = 0, enabledForVideo = null;
  const requests = new Map();
  const send = value => window.ReactNativeWebView?.postMessage(JSON.stringify(value));
  const currentId = () => new URL(location.href).searchParams.get('v') || location.pathname.match(/^\/(?:embed|shorts)\/([^/]+)/)?.[1];
  const selectVideo = () => {
    const videos = [...document.querySelectorAll('video')].filter(v => v.isConnected && v.getClientRects().length);
    return videos.find(v => !v.paused && v.readyState > 0) || videos.sort((a,b) => b.getBoundingClientRect().width * b.getBoundingClientRect().height - a.getBoundingClientRect().width * a.getBoundingClientRect().height)[0] || null;
  };
  document.addEventListener('click', event => {
    const link = event.target.closest?.('a[href]');
    if (window.__immersedOptions.hideShorts && link?.getAttribute('href')?.includes('/shorts/')) { event.preventDefault(); event.stopImmediatePropagation(); }
  }, true);
  window.__immersedCommand = (command, time) => {
    const video = selectVideo();
    if (!video) return;
    if (command === 'seek') { video.currentTime = Math.max(0, Math.min(Number.isFinite(video.duration) ? video.duration : Infinity, (video.currentTime || 0) + (Number.isFinite(time) ? time : 0))); return; }
    if (command === 'pause') video.pause();
    if (command === 'play') video.play().catch(() => {});
    if (command === 'replay') { video.currentTime = Math.max(0, Number.isFinite(time) ? time : captionTime); video.play().catch(() => {}); }
  };
  const isJapanese = track => /^ja(?:-|$)/.test(track?.languageCode || '');
  const chooseTrack = tracks => Array.isArray(tracks) ? tracks.find(t => isJapanese(t) && t.kind !== 'asr') || tracks.find(isJapanese) : undefined;
  const requestTrack = async (track, videoId) => {
    let url;
    try {
      url = new URL(track.baseUrl);
      if (url.protocol !== 'https:' || !/(^|\.)youtube\.com$/.test(url.hostname) || url.pathname !== '/api/timedtext' || url.searchParams.get('v') !== videoId) return;
    } catch { return; }
    const state = requests.get(videoId) || { attempts: 0, pending: false, ready: false, next: 0, fallback: false };
    if (state.ready || state.pending || state.attempts >= 3 || Date.now() < state.next) return;
    state.attempts++; state.pending = true; requests.set(videoId, state);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    try {
      // Fetch in the page session first: copying the signed URL to native fetch
      // loses cookies/origin context and can return a successful but empty body.
      url.searchParams.set('fmt', 'json3');
      const response = await fetch(url.toString(), { credentials: 'include', signal: controller.signal });
      if (response.ok) state.ready = window.__immersedReadCaptionResponse(url.toString(), await response.text());
    } catch {} finally {
      clearTimeout(timer); state.pending = false; state.next = Date.now() + state.attempts * 2000;
      if (!state.ready && !state.fallback && currentId() === videoId) { state.fallback = true; send({ type: 'captionTrack', videoId, url: track.baseUrl }); }
    }
  };
  const read = () => {
    if (location.href !== lastHref) { lastHref = location.href; last = ''; captionText = ''; lastTrackChoice = 0; send({ type: 'reset' }); }
    window.__immersedApplyOptions?.();
    const videoId = currentId();
    const player = document.getElementById('movie_player');
    let response, tracks = [];
    try { response = player?.getPlayerResponse?.(); } catch {}
    if (response?.videoDetails?.videoId !== videoId) response = window.ytInitialPlayerResponse;
    if (response?.videoDetails?.videoId !== videoId) {
      try { response = JSON.parse(window.ytplayer?.config?.args?.player_response || '{}'); } catch {}
    }
    if (response?.videoDetails?.videoId === videoId) tracks = response.captions?.playerCaptionsTracklistRenderer?.captionTracks || [];
    if (videoId && /^[A-Za-z0-9_-]{11}$/.test(videoId)) {
      const track = chooseTrack(tracks);
      if (track?.baseUrl) void requestTrack(track, videoId);
      // The captions module may load after the player/video. Keep trying until
      // its Japanese track is selected rather than clicking CC for any language.
      try {
        const available = player?.getOption?.('captions', 'tracklist');
        if ((!Array.isArray(available) || !available.length) && Date.now() - lastModuleAttempt > 2000) { lastModuleAttempt = Date.now(); player?.loadModule?.('captions'); }
        const japanese = chooseTrack(Array.isArray(available) ? available : tracks);
        const selected = player?.getOption?.('captions', 'track');
        if (japanese && !isJapanese(selected) && Date.now() - lastTrackChoice > 2000) { lastTrackChoice = Date.now(); player?.setOption?.('captions', 'track', japanese); }
      } catch { /* Player APIs are not guaranteed on every YouTube client. */ }
    }
    const video = selectVideo();
    if (video !== lastVideo) { lastVideo = video; last = ''; captionText = ''; }
    if (!video) return;
    if (Date.now() - clock > 150) { clock = Date.now(); send({ type: 'clock', time: video.currentTime || 0, paused: video.paused }); }
    const japaneseTextTrack = [...video.textTracks].find(t => /^ja(?:-|$)/.test(t.language));
    if (japaneseTextTrack && japaneseTextTrack.mode !== 'showing') { [...video.textTracks].forEach(t => { if (t !== japaneseTextTrack) t.mode = 'disabled'; }); japaneseTextTrack.mode = 'showing'; }
    const button = document.querySelector('.ytp-subtitles-button[aria-pressed="false"]');
    // Some mobile clients expose only CC and no track metadata. Try it once;
    // non-Japanese visible text is still rejected by the native caption handler.
    if (button && (chooseTrack(tracks) || japaneseTextTrack || enabledForVideo !== videoId)) { enabledForVideo = videoId; button.click(); }
    const visible = node => node.getClientRects().length && getComputedStyle(node).visibility !== 'hidden' && getComputedStyle(node).display !== 'none';
    let nodes = [...document.querySelectorAll('.ytp-caption-segment')].filter(visible);
    if (!nodes.length) nodes = [...document.querySelectorAll('.captions-text .caption-visual-line, .ytp-caption-window-container .caption-visual-line')].filter(visible);
    let text = nodes.map(node => node.textContent || '').join('').replace(/\s+/g, ' ').trim();
    if (!text && japaneseTextTrack?.activeCues) text = [...japaneseTextTrack.activeCues].map(cue => cue.text || '').join('').trim();
    if (text && text !== captionText) { captionText = text; captionTime = video.currentTime || 0; }
    if (!text && !video.paused) captionText = '';
    const key = [captionText, video.paused, document.title, location.href].join('|');
    if (key === last) return;
    last = key;
    send({ type: 'caption', text: captionText, tokens: [], time: captionTime, paused: video.paused, title: document.title, url: location.href, japanese: /[ぁ-ヿ一-龯]/.test(captionText) });
  };
  let queued = false;
  const observer = new MutationObserver(() => { if (!queued) { queued = true; setTimeout(() => { queued = false; read(); }, 16); } });
  observer.observe(document.documentElement, { subtree: true, childList: true, characterData: true });
  const timer = setInterval(read, 150);
  window.addEventListener('pagehide', () => { observer.disconnect(); clearInterval(timer); }, { once: true });
  read();
})(); true;`;
