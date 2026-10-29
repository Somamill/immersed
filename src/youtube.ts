export const topics = [
  { label: 'Daily life', query: '日常 vlog 日本語' },
  { label: 'Food', query: '料理 食べ歩き 日本語' },
  { label: 'Travel', query: '国内旅行 日本語 vlog' },
  { label: 'Conversation', query: '日本語 雑談 ラジオ' },
];
export const topicUrl = (query: string) => `https://m.youtube.com/results?search_query=${encodeURIComponent(query)}&hl=ja&gl=JP`;
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
  const focusStyle = document.createElement('style');
  focusStyle.textContent = 'body[data-immersed-focus] { margin:0!important; background:#000!important; overflow:hidden!important; } body[data-immersed-focus] *:not([data-immersed-ancestor]):not([data-immersed-player]):not([data-immersed-player] *) { display:none!important; } body[data-immersed-focus] [data-immersed-ancestor] { position:static!important; transform:none!important; overflow:visible!important; } body[data-immersed-focus] [data-immersed-player] { position:fixed!important; inset:0!important; width:100vw!important; height:100vh!important; max-width:none!important; max-height:none!important; margin:0!important; } body[data-immersed-focus] [data-immersed-player] video { width:100%!important; height:100%!important; object-fit:contain!important; }';
  document.documentElement.appendChild(focusStyle);
  const focus = video => {
    const watching = location.pathname === '/watch' || location.pathname.startsWith('/shorts/');
    if (!watching) { document.body?.removeAttribute('data-immersed-focus'); document.querySelectorAll('[data-immersed-player], [data-immersed-ancestor]').forEach(n => { n.removeAttribute('data-immersed-player'); n.removeAttribute('data-immersed-ancestor'); }); return; }
    const player = video?.closest('#player-container-id, #player-container') || video?.closest('.html5-video-player');
    if (!player || player.hasAttribute('data-immersed-player')) return;
    document.querySelectorAll('[data-immersed-player], [data-immersed-ancestor]').forEach(n => { n.removeAttribute('data-immersed-player'); n.removeAttribute('data-immersed-ancestor'); });
    player.setAttribute('data-immersed-player', '');
    for (let parent = player.parentElement; parent && parent !== document.body; parent = parent.parentElement) parent.setAttribute('data-immersed-ancestor', '');
    document.body.setAttribute('data-immersed-focus', '');
  };
  const send = value => window.ReactNativeWebView?.postMessage(JSON.stringify(value));
  window.__immersedCommand = (command, time) => {
    const video = document.querySelector('video');
    if (!video) return;
    if (command === 'pause') video.pause();
    if (command === 'play') video.play().catch(() => {});
    if (command === 'replay') { video.currentTime = Math.max(0, Number.isFinite(time) ? time : captionTime); video.play().catch(() => {}); }
  };
  const read = () => {
    if (location.href !== lastHref) { attemptedCaptionVideo = null; attemptedTrackVideo = null; lastHref = location.href; last = ''; captionText = ''; captionTokens = []; send({ type: 'reset' }); }
    const video = document.querySelector('video');
    if (video !== lastVideo) { lastVideo = video; last = ''; captionText = ''; captionTokens = []; }
    focus(video);
    if (!video) return;
    if (Date.now() - clock > 150) { clock = Date.now(); send({ type: 'clock', time: video.currentTime || 0, paused: video.paused }); }
    const currentVideoId = new URL(location.href).searchParams.get('v') || location.pathname;
    if (attemptedTrackVideo !== currentVideoId && /^[A-Za-z0-9_-]{11}$/.test(currentVideoId)) {
      let response = window.ytInitialPlayerResponse;
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
