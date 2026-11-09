import type { LocalCaptionEvent } from './local-captions.native';
export const localCaptionsAvailable = false;
export const startLocalCaptions = (_videoId: string, _videoTime: number) => Promise.resolve(false);
export const stopLocalCaptions = (_videoId: string) => Promise.resolve();
export const observeLocalCaptions = (_callback: (event: LocalCaptionEvent) => void) => ({ remove() {} });
