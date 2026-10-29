import React, { forwardRef, useImperativeHandle } from 'react';
import { Text, View } from 'react-native';
import type { TimedCue } from '../captions';
import type { Caption } from '../youtube';
export type BrowserHandle = { command: (command: 'pause' | 'play' | 'replay' | 'restore' | 'seek', time?: number) => void; reload: () => void };
export type BrowserProps = { uri: string; dark?: boolean; fillPortrait?: boolean; hideShorts?: boolean; onCaption: (caption: Caption | null) => void; onError: (message: string) => void; onPage?: (url: string) => void; onClock?: (time: number, paused: boolean) => void; onTranscript?: (cues: TimedCue[], videoId: string) => void };
export default forwardRef<BrowserHandle, BrowserProps>(function YouTubeBrowser({ dark = true }, ref) {
  useImperativeHandle(ref, () => ({ command: () => {}, reload: () => {} }));
  return <View style={{ flex: 1, padding: 24, justifyContent: 'center', gap: 18 }}><Text style={{ color: dark ? '#eee' : '#242D28', fontSize: 23, fontWeight: '600' }}>Open this draft in Expo Go on your iPhone.</Text><Text style={{ color: dark ? "#aaa" : "#70776E" }}>The browser preview cannot read YouTube captions across origins. The phone app contains the experimental YouTube caption adapter.</Text></View>;
});
