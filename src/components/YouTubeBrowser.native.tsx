import React, { forwardRef, useImperativeHandle, useRef } from 'react';
import { WebView } from 'react-native-webview';
import { CAPTION_BRIDGE } from '../youtube';
import type { BrowserHandle, BrowserProps } from './YouTubeBrowser';
export default forwardRef<BrowserHandle, BrowserProps>(function YouTubeBrowser({ uri, onCaption, onError }, ref) {
  // WebView 14 defaults its extra-props generic to undefined, which intersects
  // its props to never under TS 6 strict mode. Explicit object preserves props.
  const web = useRef<WebView<object>>(null);
  useImperativeHandle(ref, () => ({
    command: command => web.current?.injectJavaScript(`window.__immersedCommand?.(${JSON.stringify(command)}); true;`),
    reload: () => web.current?.reload(),
  }));
  return <WebView<object> ref={web} source={{ uri }} style={{ flex: 1 }} allowsInlineMediaPlayback mediaPlaybackRequiresUserAction allowsFullscreenVideo injectedJavaScript={CAPTION_BRIDGE}
    onLoadStart={() => onCaption(null)} onError={event => onError(event.nativeEvent.description)}
    onShouldStartLoadWithRequest={request => {
      if (request.url === 'about:blank') return true;
      try { const u = new URL(request.url); return u.protocol === 'https:' && /(^|\.)youtube\.com$/.test(u.hostname); } catch { return false; }
    }}
    onMessage={event => {
      try {
        const v = JSON.parse(event.nativeEvent.data);
        if (v.type === 'reset') { onCaption(null); return; }
        if (v.type !== 'caption' || typeof v.text !== 'string' || v.text.length > 2000 || !Array.isArray(v.tokens) || v.tokens.length > 1000 || !v.tokens.every((t: { text?: unknown; word?: unknown }) => typeof t.text === 'string' && typeof t.word === 'boolean') || !Number.isFinite(v.time) || typeof v.url !== 'string' || typeof v.title !== 'string' || typeof v.japanese !== 'boolean') return;
        onCaption(v);
      } catch { /* Ignore unrelated page messages. */ }
    }} />;
});
