import React, { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import * as Application from 'expo-application';
import { embeddedPlayerSource } from '../player';
import { WebView } from 'react-native-webview';
import { japaneseCaptionUrl, parseCaptionTrack, captionSourceRank, type CaptionSource } from '../captions';
import history from '../version-history.json';
import { CAPTION_BRIDGE, YOUTUBE_BOOTSTRAP, isYouTubeSignInUrl, youtubeUrl } from '../youtube';
import type { BrowserHandle, BrowserProps } from './YouTubeBrowser';
export default forwardRef<BrowserHandle, BrowserProps>(function YouTubeBrowser({ uri, dark = true, hideShorts = true, onCaption, onError, onPage, onClock, onTranscript }, ref) {
  // WebView 14 defaults its extra-props generic to undefined, which intersects
  // its props to never under TS 6 strict mode. Explicit object preserves props.
  const initial = youtubeUrl(uri);
  const [playerId, setPlayerId] = useState<string | null>(initial ? new URL(initial).searchParams.get('v') : null);
  const [embedReady, setEmbedReady] = useState(false);
  const web = useRef<WebView<object>>(null);
  const source = useMemo(() => playerId ? embeddedPlayerSource(playerId, Application.applicationId || 'com.somamill.immersed') : { uri }, [playerId, uri]);
  const optionsScript = `window.__immersedOptions = ${JSON.stringify({ dark, hideShorts, fillPortrait: true })}; window.__immersedApplyOptions?.(); true;`;
  useEffect(() => { web.current?.injectJavaScript(optionsScript); }, [optionsScript]);
  const currentVideo = useRef<string | null>(playerId);
  const pendingTrack = useRef<AbortController | null>(null);
  const pendingRank = useRef(0);
  const canGoBack = useRef(false);
  useEffect(() => () => pendingTrack.current?.abort(), []);
  const pageChanged = (url: string) => {
    const canonical = youtubeUrl(url);
    const id = canonical ? new URL(canonical).searchParams.get('v') : null;
    if (!id && playerId) return;
    if (id && id !== playerId) { setEmbedReady(false); setPlayerId(id); }
    if (currentVideo.current !== id) { pendingTrack.current?.abort(); currentVideo.current = id; }
    onPage?.(url);
  };
  const explainYouTubeSignIn = (url: string) => {
    try {
      const target = new URL(url);
      if (isYouTubeSignInUrl(target.toString())) onError('YouTube account sign-in is not available in this preview.');
    } catch { /* Ignore unrelated popup URLs. */ }
  };
  const loadTrack = async (url: string, videoId: string, source: CaptionSource) => {
    try {
      const target = japaneseCaptionUrl(url, videoId);
      if (!target || currentVideo.current !== videoId) return;
      if (pendingTrack.current && !pendingTrack.current.signal.aborted && pendingRank.current > captionSourceRank(source)) return;
      pendingTrack.current?.abort();
      const controller = new AbortController(); pendingTrack.current = controller;
      pendingRank.current = captionSourceRank(source);
      const timer = setTimeout(() => controller.abort(), 8000);
      target.searchParams.set('fmt', 'json3');
      try {
        const response = await fetch(target.toString(), { signal: controller.signal });
        if (!response.ok) return;
        const cues = parseCaptionTrack(await response.json());
        if (!controller.signal.aborted && currentVideo.current === videoId && cues.length) onTranscript?.(cues, videoId, source);
      } finally { clearTimeout(timer); if (pendingTrack.current === controller) { pendingTrack.current = null; pendingRank.current = 0; } }
    } catch { /* Expired or inaccessible tracks fall back to visible captions. */ }
  };
  useImperativeHandle(ref, () => ({
    back: () => { if (!playerId && canGoBack.current) web.current?.goBack(); },
    command: (command, time) => {
      web.current?.injectJavaScript(`window.__immersedCommand?.(${JSON.stringify(command)}, ${Number.isFinite(time) ? time : 'null'}); true;`);
    },
  }));
  return <WebView<object> key={`${history[0].version}:${playerId || 'browse'}`} ref={web} source={source} style={{ flex: 1, opacity: playerId && !embedReady ? 0 : 1, backgroundColor: dark ? '#000' : '#fff' }} containerStyle={{ flex: 1, minHeight: 0, backgroundColor: dark ? '#000' : '#fff' }} contentInsetAdjustmentBehavior="never" automaticallyAdjustContentInsets={false} contentInset={{ top: 0, left: 0, right: 0, bottom: 0 }} forceDarkOn={dark} allowsInlineMediaPlayback mediaPlaybackRequiresUserAction={false} allowsFullscreenVideo={false} injectedJavaScriptBeforeContentLoaded={optionsScript + YOUTUBE_BOOTSTRAP} injectedJavaScript={optionsScript + CAPTION_BRIDGE} allowsPictureInPictureMediaPlayback onContentProcessDidTerminate={() => web.current?.reload()}
    onLoad={event => { try { const url = new URL(event.nativeEvent.url); if (url.pathname === `/embed/${currentVideo.current}`) setEmbedReady(true); } catch {} }}
    onNavigationStateChange={state => { canGoBack.current = state.canGoBack; if (state.url !== 'about:blank') pageChanged(state.url); }} onLoadStart={() => { onCaption(null); onError(''); }} onError={event => onError(event.nativeEvent.description)}
    onShouldStartLoadWithRequest={request => {
      if (request.url === 'about:blank' || request.isTopFrame === false) return true;
      try {
        const u = new URL(request.url);
        if (u.protocol !== 'https:') return false;
        if (isYouTubeSignInUrl(u.toString())) { explainYouTubeSignIn(u.toString()); return false; }
        if (hideShorts && u.pathname.startsWith('/shorts/')) return false;
        if (!/(^|\.)youtube\.com$/.test(u.hostname)) return false;
        const watch = youtubeUrl(request.url);
        const id = watch ? new URL(watch).searchParams.get('v') : null;
        if (id && !u.pathname.startsWith('/embed/')) {
          pageChanged(watch!); setPlayerId(id); return false;
        }
        if (playerId && !u.pathname.startsWith('/embed/')) return false;
        return true;
      } catch { return false; }
    }}
    onOpenWindow={event => explainYouTubeSignIn(event.nativeEvent.targetUrl)}
    onMessage={event => {
      try {
        const v = JSON.parse(event.nativeEvent.data);
        if (v.type === 'page' && typeof v.url === 'string') {
          const url = new URL(v.url);
          if (url.protocol === 'https:' && ['youtube.com', 'www.youtube.com', 'm.youtube.com'].includes(url.hostname)) pageChanged(url.toString());
          return;
        }
        if (v.type === 'playerError' && v.videoId === currentVideo.current) { onError('This video cannot play in the embedded player.'); return; }
        if (v.type === 'captionData' && v.language === 'ja' && typeof v.videoId === 'string' && v.videoId === currentVideo.current) {
          const cues = parseCaptionTrack(v.data);
          if (cues.length) onTranscript?.(cues, v.videoId, v.source === 'human' || v.source === 'youtube-asr' ? v.source : 'unknown');
          return;
        }
        if (v.type === 'captionTrack' && v.language === 'ja' && typeof v.url === 'string' && /^[A-Za-z0-9_-]{11}$/.test(v.videoId)) { void loadTrack(v.url, v.videoId, v.source === 'human' || v.source === 'youtube-asr' ? v.source : 'unknown'); return; }
        if (v.type === 'clock' && v.videoId === currentVideo.current && Number.isFinite(v.time) && typeof v.paused === 'boolean') { onClock?.(v.time, v.paused); return; }
        if (v.type === 'reset') { onCaption(null); return; }
        if (v.type !== 'caption' || typeof v.text !== 'string' || v.text.length > 2000 || (v.text && v.language !== 'ja') || !Array.isArray(v.tokens) || v.tokens.length > 1000 || !v.tokens.every((t: { text?: unknown; word?: unknown }) => typeof t.text === 'string' && typeof t.word === 'boolean') || !Number.isFinite(v.time) || typeof v.url !== 'string' || typeof v.title !== 'string') return;
        const canonical = youtubeUrl(v.url);
        if (!canonical || new URL(canonical).searchParams.get('v') !== currentVideo.current) return;
        onCaption(v);
      } catch { /* Ignore unrelated page messages. */ }
    }} />;
});
