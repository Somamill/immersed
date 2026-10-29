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
  let last = '', lastHref = location.href, lastVideo = null, captionText = '', captionTokens = [], captionTime = 0;
  const send = value => window.ReactNativeWebView?.postMessage(JSON.stringify(value));
  const segmenter = typeof Intl.Segmenter === 'function' ? new Intl.Segmenter('ja', { granularity: 'word' }) : null;
  window.__immersedCommand = command => {
    const video = document.querySelector('video');
    if (!video) return;
    if (command === 'pause') video.pause();
    if (command === 'play') video.play().catch(() => {});
    if (command === 'replay') { video.currentTime = Math.max(0, captionTime); video.play().catch(() => {}); }
  };
  const read = () => {
    if (location.href !== lastHref) { lastHref = location.href; last = ''; captionText = ''; captionTokens = []; send({ type: 'reset' }); }
    const video = document.querySelector('video');
    if (video !== lastVideo) { lastVideo = video; last = ''; captionText = ''; captionTokens = []; }
    if (!video) return;
    const visible = node => node.getClientRects().length && getComputedStyle(node).visibility !== 'hidden' && getComputedStyle(node).display !== 'none';
    let nodes = [...document.querySelectorAll('.ytp-caption-segment')].filter(visible);
    if (!nodes.length) nodes = [...document.querySelectorAll('.captions-text .caption-visual-line')].filter(visible);
    if (!nodes.length) nodes = [...document.querySelectorAll('.ytp-caption-window-container .caption-visual-line')].filter(visible);
    let text = nodes.map(node => node.textContent || '').join(' ').replace(/\\s+/g, ' ').trim();
    if (!text && video.textTracks) {
      const track = [...video.textTracks].find(t => t.mode === 'showing' && t.language?.startsWith('ja'));
      if (track?.activeCues) text = [...track.activeCues].map(cue => cue.text || '').join(' ').trim();
    }
    if (text && text !== captionText) {
      captionText = text; captionTime = video.currentTime || 0;
      captionTokens = segmenter ? [...segmenter.segment(text)].map(t => ({ text: t.segment, word: t.isWordLike })) : [{ text, word: true }];
    }
    if (!text && !video.paused) { captionText = ''; captionTokens = []; }
    const key = [captionText, video.paused, document.title, location.href].join('|');
    if (key === last) return;
    last = key;
    send({ type: 'caption', text: captionText, tokens: captionTokens, time: captionTime, paused: video.paused, title: document.title, url: location.href, japanese: /[ぁ-ヿ一-龯]/.test(captionText) });
  };
  const observer = new MutationObserver(read);
  observer.observe(document.documentElement, { subtree: true, childList: true, characterData: true });
  const timer = setInterval(read, 400);
  window.addEventListener('pagehide', () => { observer.disconnect(); clearInterval(timer); }, { once: true });
  read();
})(); true;`;
export type Caption = { text: string; tokens: { text: string; word: boolean }[]; time: number; title: string; url: string; japanese: boolean; paused: boolean };
export type DictionaryEntry = { japanese: { word?: string; reading?: string }[]; senses: { english_definitions: string[]; parts_of_speech: string[] }[]; slug: string };
