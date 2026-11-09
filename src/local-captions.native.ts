import { requireOptionalNativeModule } from 'expo-modules-core';

export type LocalSpeechSegment = { text: string; start: number; end: number };
export type LocalCaptionEvent = { videoId: string; cues: LocalSpeechSegment[]; final: boolean };
type NativeCaptionModule = {
  start(videoId: string, videoTime: number): Promise<boolean>;
  stop(videoId: string): Promise<void>;
  available(): Promise<boolean>;
  addListener(name: 'onCaption', callback: (event: LocalCaptionEvent) => void): { remove(): void };
};
const native = requireOptionalNativeModule<NativeCaptionModule>('ImmersedLiveCaptions');
export const localCaptionsAvailable = !!native;
export const startLocalCaptions = (videoId: string, videoTime: number) => native?.start(videoId, videoTime) ?? Promise.resolve(false);
export const stopLocalCaptions = (videoId: string) => native?.stop(videoId) ?? Promise.resolve();
export const observeLocalCaptions = (callback: (event: LocalCaptionEvent) => void) => native?.addListener('onCaption', callback) ?? { remove() {} };
