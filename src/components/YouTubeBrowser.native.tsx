import React, { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { WebView } from 'react-native-webview';
import { parseCaptionTrack } from '../captions';
import { CAPTION_BRIDGE, youtubeUrl } from '../youtube';
import type { BrowserHandle, BrowserProps } from './YouTubeBrowser';
export default forwardRef<BrowserHandle, BrowserProps>(function YouTubeBrowser({ uri, onCaption, onError, onPage, onClock, onTranscript }, ref) {
  // WebView 14 defaults its extra-props generic to undefined, which intersects
  // its props to never under TS 6 strict mode. Explicit object preserves props.
  const web = useRef<WebView<object>>(null);
  const currentVideo = useRef<string | null>(null);
  const pendingTrack = useRef<AbortController | null>(null);
  useEffect(() => () => pendingTrack.current?.abort(), []);
  const pageChanged = (url: string) => {
    const canonical = youtubeUrl(url);
    const id = canonical ? new URL(canonical).searchParams.get('v') : null;
    if (currentVideo.current !== id) { pendingTrack.current?.abort(); currentVideo.current = id; }
    onPage?.(url);
  };
  const loadTrack = async (url: string, videoId: string) => {
    try {
      const target = new URL(url);
      if (target.protocol !== 'https:' || !/(^|\.)youtube\.com$/.test(target.hostname) || target.pathname !== '/api/timedtext' || target.searchParams.get('v') !== videoId) return;
      pendingTrack.current?.abort();
      const controller = new AbortController(); pendingTrack.current = controller;
      const timer = setTimeout(() => controller.abort(), 8000);
      target.searchParams.set('fmt', 'json3');
      try {
        const response = await fetch(target.toString(), { signal: controller.signal });
        if (!response.ok) return;
        const cues = parseCaptionTrack(await response.json());
        if (!controller.signal.aborted && currentVideo.current === videoId && cues.length) onTranscript?.(cues, videoId);
      } finally { clearTimeout(timer); }
    } catch { /* Expired or inaccessible tracks fall back to visible captions. */ }
  };
  useImperativeHandle(ref, () => ({
    command: (command, time) => web.current?.injectJavaScript(`window.__immersedCommand?.(${JSON.stringify(command)}, ${Number.isFinite(time) ? time : 'null'}); true;`),
    reload: () => web.current?.reload(),
  }));
  return <WebView<object> ref={web} source={{ uri }} style={{ flex: 1 }} allowsInlineMediaPlayback mediaPlaybackRequiresUserAction allowsFullscreenVideo injectedJavaScript={CAPTION_BRIDGE}
    onNavigationStateChange={state => pageChanged(state.url)} onLoadStart={() => onCaption(null)} onError={event => onError(event.nativeEvent.description)}
    onShouldStartLoadWithRequest={request => {
      if (request.url === 'about:blank') return true;
      try { const u = new URL(request.url); return u.protocol === 'https:' && /(^|\.)youtube\.com$/.test(u.hostname); } catch { return false; }
    }}
    onMessage={event => {
      try {
        const v = JSON.parse(event.nativeEvent.data);
        if (v.type === 'captionTrack' && typeof v.url === 'string' && /^[A-Za-z0-9_-]{11}$/.test(v.videoId)) { void loadTrack(v.url, v.videoId); return; }
        if (v.type === 'clock' && Number.isFinite(v.time) && typeof v.paused === 'boolean') { onClock?.(v.time, v.paused); return; }
        if (v.type === 'reset') { onCaption(null); return; }
        if (v.type !== 'caption' || typeof v.text !== 'string' || v.text.length > 2000 || !Array.isArray(v.tokens) || v.tokens.length > 1000 || !v.tokens.every((t: { text?: unknown; word?: unknown }) => typeof t.text === 'string' && typeof t.word === 'boolean') || !Number.isFinite(v.time) || typeof v.url !== 'string' || typeof v.title !== 'string' || typeof v.japanese !== 'boolean') return;
        pageChanged(v.url);
        onCaption(v);
      } catch { /* Ignore unrelated page messages. */ }
    }} />;
});
