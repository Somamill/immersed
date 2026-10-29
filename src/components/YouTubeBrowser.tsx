import React, { forwardRef, useImperativeHandle } from 'react';
import { Text, View } from 'react-native';
import type { Caption } from '../youtube';
export type BrowserHandle = { command: (command: 'pause' | 'play' | 'replay', time?: number) => void; reload: () => void };
export type BrowserProps = { uri: string; onCaption: (caption: Caption | null) => void; onError: (message: string) => void; onPage?: (url: string) => void; onClock?: (time: number, paused: boolean) => void };
export default forwardRef<BrowserHandle, BrowserProps>(function YouTubeBrowser(_props, ref) {
  useImperativeHandle(ref, () => ({ command: () => {}, reload: () => {} }));
  return <View style={{ flex: 1, padding: 24, justifyContent: 'center', gap: 18 }}><Text style={{ fontSize: 23, fontWeight: '600' }}>Open this draft in Expo Go on your iPhone.</Text><Text>The browser preview cannot read YouTube captions across origins. The phone app contains the experimental YouTube caption adapter.</Text></View>;
});
