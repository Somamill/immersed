import React, { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import * as Application from 'expo-application';
import { embeddedPlayerSource } from '../player';
import { Linking } from 'react-native';
import { WebView } from 'react-native-webview';
import { parseCaptionTrack } from '../captions';
import { CAPTION_BRIDGE, YOUTUBE_BOOTSTRAP, youtubeUrl } from '../youtube';
import type { BrowserHandle, BrowserProps } from './YouTubeBrowser';
export default forwardRef<BrowserHandle, BrowserProps>(function YouTubeBrowser({ uri, dark = true, fillPortrait = true, hideShorts = true, onCaption, onError, onPage, onClock, onTranscript }, ref) {
  // WebView 14 defaults its extra-props generic to undefined, which intersects
  // its props to never under TS 6 strict mode. Explicit object preserves props.
  const initial = youtubeUrl(uri);
  const [playerId, setPlayerId] = useState<string | null>(initial ? new URL(initial).searchParams.get('v') : null);
  const [originalPlayer, setOriginalPlayer] = useState(false);
  const web = useRef<WebView<object>>(null);
  const source = useMemo(() => playerId ? originalPlayer ? { uri: `https://m.youtube.com/watch?v=${playerId}` } : embeddedPlayerSource(playerId, Application.applicationId || 'com.somamill.immersed') : { uri }, [playerId, originalPlayer, uri]);
  const optionsScript = `window.__immersedOptions = ${JSON.stringify({ dark, hideShorts, fillPortrait })}; window.__immersedApplyOptions?.(); true;`;
  useEffect(() => { web.current?.injectJavaScript(optionsScript); }, [optionsScript]);
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
    command: (command, time) => {
      if (command === 'restore') { setOriginalPlayer(true); return; }
      web.current?.injectJavaScript(`window.__immersedCommand?.(${JSON.stringify(command)}, ${Number.isFinite(time) ? time : 'null'}); true;`);
    },
    reload: () => web.current?.reload(),
  }));
  return <WebView<object> ref={web} source={source} style={{ flex: 1, backgroundColor: dark ? '#000' : '#fff' }} containerStyle={{ backgroundColor: dark ? '#000' : '#fff' }} contentInsetAdjustmentBehavior="never" automaticallyAdjustContentInsets={false} contentInset={{ top: 0, left: 0, right: 0, bottom: 0 }} forceDarkOn={dark} allowsInlineMediaPlayback mediaPlaybackRequiresUserAction={false} allowsFullscreenVideo={false} injectedJavaScriptBeforeContentLoaded={optionsScript + YOUTUBE_BOOTSTRAP} injectedJavaScript={optionsScript + CAPTION_BRIDGE} allowsPictureInPictureMediaPlayback onContentProcessDidTerminate={() => web.current?.reload()}
    onNavigationStateChange={state => { if (state.url !== 'about:blank') pageChanged(state.url); }} onLoadStart={() => onCaption(null)} onError={event => onError(event.nativeEvent.description)}
    onShouldStartLoadWithRequest={request => {
      if (request.url === 'about:blank' || request.isTopFrame === false) return true;
      try {
        const u = new URL(request.url);
        if (u.protocol !== 'https:') return false;
        if (u.hostname === 'accounts.google.com' || u.hostname === 'accounts.youtube.com') { void Linking.openURL(u.toString()).catch(() => onError('Could not open the system browser for sign-in.')); return false; }
        if (hideShorts && u.pathname.startsWith('/shorts/')) return false;
        if (!/(^|\.)youtube\.com$/.test(u.hostname)) return false;
        const watch = youtubeUrl(request.url);
        const id = watch ? new URL(watch).searchParams.get('v') : null;
        if (id && (!originalPlayer || id !== playerId) && !u.pathname.startsWith('/embed/')) {
          pageChanged(watch!); setOriginalPlayer(false); setPlayerId(id); return false;
        }
        return true;
      } catch { return false; }
    }}
    onMessage={event => {
      try {
        const v = JSON.parse(event.nativeEvent.data);
        if (v.type === 'captionData' && typeof v.videoId === 'string' && v.videoId === currentVideo.current) {
          const cues = parseCaptionTrack(v.data);
          if (cues.length) { pendingTrack.current?.abort(); onTranscript?.(cues, v.videoId); }
          return;
        }
        if (v.type === 'captionTrack' && typeof v.url === 'string' && /^[A-Za-z0-9_-]{11}$/.test(v.videoId)) { void loadTrack(v.url, v.videoId); return; }
        if (v.type === 'clock' && Number.isFinite(v.time) && typeof v.paused === 'boolean') { onClock?.(v.time, v.paused); return; }
        if (v.type === 'reset') { onCaption(null); return; }
        if (v.type !== 'caption' || typeof v.text !== 'string' || v.text.length > 2000 || !Array.isArray(v.tokens) || v.tokens.length > 1000 || !v.tokens.every((t: { text?: unknown; word?: unknown }) => typeof t.text === 'string' && typeof t.word === 'boolean') || !Number.isFinite(v.time) || typeof v.url !== 'string' || typeof v.title !== 'string' || typeof v.japanese !== 'boolean') return;
        pageChanged(v.url);
        onCaption(v);
      } catch { /* Ignore unrelated page messages. */ }
    }} />;
});
