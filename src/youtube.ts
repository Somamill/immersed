export const topics = [
  { label: 'Daily life', query: '一人暮らし 日常 vlog -日本語学習 -初心者向け'  },
  { label: 'Food', query: '料理 作り方 食べ歩き -日本語学習'  },
  { label: 'Travel', query: '国内旅行 旅 vlog -日本語学習'  },
  { label: 'Science', query: '科学 宇宙 解説 -日本語学習' },
  { label: 'Gaming', query: 'ゲーム 実況 -日本語学習' },
  { label: 'Conversation', query: '雑談 ラジオ 対談 -日本語学習'  },
];
export const topicUrl = (query: string) => `https://m.youtube.com/results?search_query=${encodeURIComponent(query)}&hl=ja&gl=JP&relevanceLanguage=ja`;
export function isYouTubeSignInUrl(input: string): boolean {
  try {
    const url = new URL(input);
    if (url.protocol !== 'https:') return false;
    return ['accounts.google.com', 'accounts.youtube.com'].includes(url.hostname) || (['youtube.com', 'www.youtube.com', 'm.youtube.com'].includes(url.hostname) && /^\/(?:signin|sign_in)(?:\/|$)/.test(url.pathname));
  } catch { return false; }
}
export function youtubeUrl(input: string): string | null {
  try {
    const u = new URL(input.trim());
    if (u.protocol !== 'https:') return null;
    const id = u.hostname === 'youtu.be' ? u.pathname.slice(1) : ['youtube.com', 'www.youtube.com', 'm.youtube.com'].includes(u.hostname) ? (u.searchParams.get('v') || u.pathname.match(/^\/(?:shorts|embed)\/([^/]+)/)?.[1]) : null;
    return id && /^[\w-]{11}$/.test(id) ? `https://m.youtube.com/watch?v=${id}&hl=ja` : null;
  } catch { return null; }
}

export { CAPTION_BRIDGE, YOUTUBE_BOOTSTRAP } from './youtube-page';
export type Caption = { text: string; tokens: { text: string; word: boolean }[]; time: number; title: string; url: string; language: 'ja' | null; paused: boolean };
export type DictionaryEntry = { japanese: { word?: string; reading?: string }[]; senses: { english_definitions: string[]; parts_of_speech: string[] }[]; slug: string };
