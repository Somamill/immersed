export function embeddedPlayerSource(videoId: string, applicationId: string) {
  if (!/^[A-Za-z0-9_-]{11}$/.test(videoId)) throw new Error('Invalid video ID');
  if (!/^[A-Za-z0-9._-]+$/.test(applicationId)) throw new Error('Invalid application identifier');
  const referer = `https://${applicationId.toLowerCase()}`;
  const params = new URLSearchParams({ playsinline: '1', fs: '0', cc_load_policy: '1', cc_lang_pref: 'ja', hl: 'ja', autoplay: '1', enablejsapi: '1', origin: referer });
  return { uri: `https://www.youtube.com/embed/${videoId}?${params}`, headers: { Referer: referer } };
}
export function swipeAction(dx: number, dy: number): 'forward' | 'backward' | 'portrait' | 'compact' | null {
  if (Math.abs(dx) >= 45 && Math.abs(dx) > Math.abs(dy) * 1.4) return dx < 0 ? 'forward' : 'backward';
  if (Math.abs(dy) >= 45 && Math.abs(dy) > Math.abs(dx) * 1.4) return dy < 0 ? 'portrait' : 'compact';
  return null;
}
