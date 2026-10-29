export const topics = [
  { label: 'Daily life', query: '一人暮らし 日常 vlog -日本語学習 -初心者向け'  },
  { label: 'Food', query: '料理 作り方 食べ歩き -日本語学習'  },
  { label: 'Travel', query: '国内旅行 旅 vlog -日本語学習'  },
  { label: 'Science', query: '科学 宇宙 解説 -日本語学習' },
  { label: 'Gaming', query: 'ゲーム 実況 -日本語学習' },
  { label: 'Conversation', query: '雑談 ラジオ 対談 -日本語学習'  },
];
export const topicUrl = (query: string) => `https://m.youtube.com/results?search_query=${encodeURIComponent(query)}&hl=ja&gl=JP&relevanceLanguage=ja`;
export function youtubeUrl(input: string): string | null {
  try {
    const u = new URL(input.trim());
    if (u.protocol !== 'https:') return null;
    const id = u.hostname === 'youtu.be' ? u.pathname.slice(1) : ['youtube.com', 'www.youtube.com', 'm.youtube.com'].includes(u.hostname) ? (u.searchParams.get('v') || u.pathname.match(/^\/(?:shorts|embed)\/([^/]+)/)?.[1]) : null;
    return id && /^[\w-]{11}$/.test(id) ? `https://m.youtube.com/watch?v=${id}&hl=ja` : null;
  } catch { return null; }
}

// Experimental adapter to visible captions. This does not generate transcripts.
export const CAPTION_BRIDGE = `(() => {
  if (window.__immersedBridge || !/(^|\\.)youtube\\.com$/.test(location.hostname)) return;
  window.__immersedBridge = true;
  let last = '', lastHref = location.href, lastVideo = null, captionText = '', captionTokens = [], captionTime = 0, clock = 0, attemptedCaptionVideo = null, attemptedTrackVideo = null;
  window.__immersedOptions = window.__immersedOptions || { dark: true, hideShorts: true };
  const selectVideo = () => {
    const videos = [...document.querySelectorAll('video')].filter(v => v.isConnected && v.getClientRects().length);
    return videos.find(v => !v.paused && v.readyState > 0) || videos.sort((a,b) => b.getBoundingClientRect().width * b.getBoundingClientRect().height - a.getBoundingClientRect().width * a.getBoundingClientRect().height)[0] || null;
  };
  const discoveryStyle = document.createElement('style');
  discoveryStyle.textContent = 'html[data-immersed-dark] { color-scheme:dark; --yt-spec-base-background:#000; --yt-spec-raised-background:#111; --yt-spec-text-primary:#eee; } html[data-immersed-dark] body, html[data-immersed-dark] ytm-app { background-color:#000!important; color:#eee; } [data-immersed-short] { display:none!important; }';
  if (!location.pathname.startsWith('/embed/')) document.documentElement.appendChild(discoveryStyle);
  const applyOptions = () => {
    if (location.pathname.startsWith('/embed/')) return;
    const options = window.__immersedOptions;
    if (options.dark) document.documentElement.setAttribute('data-immersed-dark', ''); else document.documentElement.removeAttribute('data-immersed-dark');
    document.querySelectorAll('ytm-reel-shelf-renderer, ytm-shorts-lockup-view-model, ytm-shorts-lockup-view-model-v2, ytd-reel-shelf-renderer, ytd-rich-section-renderer:has(a[href*="/shorts/"])').forEach(node => {
      if (options.hideShorts && !node.hasAttribute('data-immersed-short')) node.setAttribute('data-immersed-short', '');
      if (!options.hideShorts) node.removeAttribute('data-immersed-short');
    });
    document.querySelectorAll('a[href*="/shorts/"]').forEach(link => {
      const card = link.closest('ytm-rich-item-renderer, ytm-video-with-context-renderer, ytd-rich-item-renderer') || link;
      if (options.hideShorts && !card.hasAttribute('data-immersed-short')) card.setAttribute('data-immersed-short', '');
      if (!options.hideShorts) card.removeAttribute('data-immersed-short');
    });
  };
  document.addEventListener('click', event => {
    const link = event.target.closest?.('a[href]');
    if (window.__immersedOptions.hideShorts && link?.getAttribute('href')?.includes('/shorts/')) { event.preventDefault(); event.stopImmediatePropagation(); }
  }, true);
  const send = value => window.ReactNativeWebView?.postMessage(JSON.stringify(value));
  window.__immersedCommand = (command, time) => {
    const video = selectVideo();
    if (!video) return;
    if (command === 'seek') { video.currentTime = Math.max(0, Math.min(Number.isFinite(video.duration) ? video.duration : Infinity, (video.currentTime || 0) + (Number.isFinite(time) ? time : 0))); return; }
    if (command === 'pause') video.pause();
    if (command === 'play') video.play().catch(() => {});
    if (command === 'replay') { video.currentTime = Math.max(0, Number.isFinite(time) ? time : captionTime); video.play().catch(() => {}); }
  };
  const read = () => {
    if (location.href !== lastHref) { attemptedCaptionVideo = null; attemptedTrackVideo = null; lastHref = location.href; last = ''; captionText = ''; captionTokens = []; send({ type: 'reset' }); }
    const video = selectVideo();
    if (video !== lastVideo) { lastVideo = video; last = ''; captionText = ''; captionTokens = []; }
    applyOptions();
    if (!video) return;
    if (Date.now() - clock > 150) { clock = Date.now(); send({ type: 'clock', time: video.currentTime || 0, paused: video.paused }); }
    const path = location.pathname.split('/');
    const currentVideoId = new URL(location.href).searchParams.get('v') || (['embed', 'shorts'].includes(path[1]) ? path[2] : location.pathname);
    if (attemptedTrackVideo !== currentVideoId && /^[A-Za-z0-9_-]{11}$/.test(currentVideoId)) {
      let response = window.ytInitialPlayerResponse || document.getElementById('movie_player')?.getPlayerResponse?.();
      if (!response && window.ytplayer?.config?.args?.player_response) {
        try { response = JSON.parse(window.ytplayer.config.args.player_response); } catch {}
      }
      if (response?.videoDetails?.videoId === currentVideoId) {
        const tracks = response.captions?.playerCaptionsTracklistRenderer?.captionTracks || [];
        const track = tracks.find(t => t.languageCode === 'ja' && t.kind !== 'asr') || tracks.find(t => t.languageCode === 'ja');
        if (track?.baseUrl) { attemptedTrackVideo = currentVideoId; send({ type: 'captionTrack', videoId: currentVideoId, url: track.baseUrl }); }
      }
    }
    if (attemptedCaptionVideo !== currentVideoId) {
      const track = [...video.textTracks].find(t => t.language?.startsWith('ja'));
      const button = document.querySelector('.ytp-subtitles-button[aria-pressed=\"false\"]');
      if (track) { [...video.textTracks].forEach(t => { if (t !== track) t.mode = 'disabled'; }); track.mode = 'showing'; attemptedCaptionVideo = currentVideoId; }
      else if (button) { attemptedCaptionVideo = currentVideoId; button.click(); }
    }
    const visible = node => node.getClientRects().length && getComputedStyle(node).visibility !== 'hidden' && getComputedStyle(node).display !== 'none';
    let nodes = [...document.querySelectorAll('.ytp-caption-segment')].filter(visible);
    if (!nodes.length) nodes = [...document.querySelectorAll('.captions-text .caption-visual-line')].filter(visible);
    if (!nodes.length) nodes = [...document.querySelectorAll('.ytp-caption-window-container .caption-visual-line')].filter(visible);
    let text = nodes.map(node => node.textContent || '').join('').replace(/\\s+/g, ' ').trim();
    if (!text && video.textTracks) {
      const track = [...video.textTracks].find(t => t.mode === 'showing' && t.language?.startsWith('ja'));
      if (track?.activeCues) text = [...track.activeCues].map(cue => cue.text || '').join('').trim();
    }
    if (text && text !== captionText) {
      captionText = text; captionTime = video.currentTime || 0;
      captionTokens = []; // Real morphological analysis happens on the language service.
    }
    if (!text && !video.paused) { captionText = ''; captionTokens = []; }
    const key = [captionText, video.paused, document.title, location.href].join('|');
    if (key === last) return;
    last = key;
    send({ type: 'caption', text: captionText, tokens: captionTokens, time: captionTime, paused: video.paused, title: document.title, url: location.href, japanese: /[ぁ-ヿ一-龯]/.test(captionText) });
  };
  let queued = false;
  const observer = new MutationObserver(() => { if (!queued) { queued = true; setTimeout(() => { queued = false; read(); }, 16); } });
  observer.observe(document.documentElement, { subtree: true, childList: true, characterData: true });
  const timer = setInterval(read, 150);
  window.addEventListener('pagehide', () => { observer.disconnect(); clearInterval(timer); }, { once: true });
  read();
})(); true;`;
export type Caption = { text: string; tokens: { text: string; word: boolean }[]; time: number; title: string; url: string; japanese: boolean; paused: boolean };
export type DictionaryEntry = { japanese: { word?: string; reading?: string }[]; senses: { english_definitions: string[]; parts_of_speech: string[] }[]; slug: string };
