export function watchPlayerSource(videoId: string) {
  if (!/^[A-Za-z0-9_-]{11}$/.test(videoId)) throw new Error('Invalid video ID');
  return { uri: `https://m.youtube.com/watch?v=${videoId}&hl=ja` };
}
export function hostedPlayerSource(videoId: string, hostUri: string) {
  if (!/^[A-Za-z0-9_-]{11}$/.test(videoId)) throw new Error('Invalid video ID');
  const host = new URL(hostUri.startsWith('https://') ? hostUri : `https://${hostUri}`);
  if (host.protocol !== 'https:' || !host.hostname.endsWith('.on.expo.app') || host.pathname !== '/' || host.search || host.hash) throw new Error('Invalid preview host');
  return { uri: `${host.origin}/youtube-player.html?v=${videoId}` };
}
export function swipeAction(dx: number, dy: number): 'forward' | 'backward' | null {
  if (Math.abs(dx) >= 45 && Math.abs(dx) > Math.abs(dy) * 1.4) return dx < 0 ? 'forward' : 'backward';
  return null;
}
