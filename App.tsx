import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Image, Keyboard, KeyboardAvoidingView, PanResponder, Platform, Pressable, ScrollView, StyleSheet, Switch, Text as NativeText, TextInput, useWindowDimensions, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import FloatingGlass from './src/components/FloatingGlass';
import NavigationButton from './src/components/NavigationButton';
import DictionarySearch from './src/components/DictionarySearch';
import { loadCaptionCache, saveCaptionCache } from './src/caption-cache';
import { refineCaptionTrack } from './src/caption-reflow';
import { StatusBar } from 'expo-status-bar';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { readingCue, normalizeJapaneseCaption, captionSourceRank, sentenceTarget } from './src/captions';
import { automaticRetryDelay } from './src/subtitle-policy';
import { swipeAction } from './src/player';
import { familiarity, type JlptLevel } from './src/learning';
import StudySubtitles from './src/components/StudySubtitles';
import SentenceControls, { PlaybackButton } from './src/components/SentenceControls';
import LookupSheet from './src/components/LookupSheet';
import VideoCoverage from './src/components/VideoCoverage';
import { PREFERENCES_SCHEMA, restorePreferences } from './src/preferences';
import history from './src/version-history.json';
import YouTubeBrowser, { type BrowserHandle } from './src/components/YouTubeBrowser';
import { topics, topicUrl, youtubeUrl, type Caption, type DictionaryEntry } from './src/youtube';
import { dictionaryKey, languageRequest, serviceUrl, type AnalyzedToken, type GeneratedCue, type Transcription } from './src/language';

type Saved = { key: string; word: string; reading: string; meaning: string; sentence: string; title: string; url: string; time: number };
type Lookup = { token: AnalyzedToken; caption: Caption };
const STORAGE = 'immersed.youtube.words.v1';
const dictionaryCache = new Map<string, DictionaryEntry[]>();
const analysisCache = new Map<string, AnalyzedToken[]>();
const pendingAnalysis = new Map<string, Promise<AnalyzedToken[]>>();
function loadAnalysis(sentence: string): Promise<AnalyzedToken[]> {
  const key = `true:${sentence}`;
  const cached = analysisCache.get(key);
  if (cached) return Promise.resolve(cached);
  const pending = pendingAnalysis.get(key);
  if (pending) return pending;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6000);
  const request = languageRequest<{ tokens: AnalyzedToken[]; dictionary?: Record<string, DictionaryEntry[]> }>('analyze', { text: sentence, dictionary: 'true' }, controller.signal).then(result => {
    if (analysisCache.size >= 300) analysisCache.delete(analysisCache.keys().next().value!);
    analysisCache.set(key, result.tokens);
    for (const [lemma, entries] of Object.entries(result.dictionary || {})) dictionaryCache.set(lemma, entries);
    return result.tokens;
  }).finally(() => { clearTimeout(timer); pendingAnalysis.delete(key); });
  pendingAnalysis.set(key, request);
  return request;
}
const DarkContext = createContext(true);
// Match native Text's non-selectable default in the browser preview, where text
// selection otherwise takes ownership of horizontal navigation gestures.
function Text(props: React.ComponentProps<typeof NativeText>) {
  return <NativeText selectable={false} {...props} />;
}
function Button({ children, onPress, quiet = false }: { children: string; onPress: () => void; quiet?: boolean }) {
  const s = useContext(DarkContext) ? darkStyles : lightStyles;
  return <Pressable accessibilityRole="button" onPress={event => { event.stopPropagation(); onPress(); }} style={[s.button, quiet && { backgroundColor: 'transparent', paddingHorizontal: 10 }]}><Text style={s.buttonText}>{children}</Text></Pressable>;
}
export default function App() {
  const browser = useRef<BrowserHandle>(null);
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { panel } = useLocalSearchParams<{ panel?: string }>();
  const panelHistory = useRef<string[]>([]);
  const currentPanel = useRef(panel || '');
  useEffect(() => { currentPanel.current = panel || ''; }, [panel]);
  const openPanel = useCallback((next?: string) => {
    if (currentPanel.current !== (next || '')) panelHistory.current.push(currentPanel.current);
    currentPanel.current = next || '';
    Keyboard.dismiss();
    setLookup(null);
    router.setParams({ panel: next });
  }, [router]);
  const settings = panel === 'settings';
  const library = panel === 'words';
  const setSettings = (open: boolean) => openPanel(open ? 'settings' : undefined);
  const setLibrary = (open: boolean) => openPanel(open ? 'words' : undefined);
  const { width, height } = useWindowDimensions();
  const [viewportHeight, setViewportHeight] = useState(height);
  const dockClearance = Math.max(insets.bottom, 12) + 76;
  const normalReadingHeight = Math.max(224, Math.min(310, height * 0.32)) + dockClearance;
  const readingHeight = Math.min(normalReadingHeight, Math.max(dockClearance + 120, Math.min(height, viewportHeight) - 128));
  const [dark, setDark] = useState(true);
  const [hideShorts, setHideShorts] = useState(true);
  const [minimumMinutes, setMinimumMinutes] = useState(0);
  const [level, setLevel] = useState<JlptLevel>(5);
  const [knowledge, setKnowledge] = useState<Record<string, boolean>>({});
  const s = dark ? darkStyles : lightStyles;
  const [uri, setUri] = useState(topicUrl(topics[0].query));
  const lastBrowse = useRef(uri);
  const [browserVersion, setBrowserVersion] = useState(0);
  const [pageUrl, setPageUrl] = useState('');
  const [topic, setTopic] = useState('Daily life');
  const [input, setInput] = useState('');
  const [nativeCaption, setNativeCaption] = useState<Caption | null>(null);
  const [clock, setClock] = useState({ time: 0, paused: true });
  const latestTime = useRef(0);
  const pendingSeek = useRef<{ target: number; requestedAt: number } | null>(null);
  const [generated, setGenerated] = useState<GeneratedCue[]>([]);
  const [subtitleStatus, setSubtitleStatus] = useState('');
  const [error, setError] = useState('');
  const [lookup, setLookup] = useState<Lookup | null>(null);
  const [dictionaryResult, setDictionaryResult] = useState<{ key: string; entries: DictionaryEntry[]; error: string } | null>(null);
  const lookupKey = lookup ? dictionaryKey(lookup.token) : '';
  const cachedEntries = lookup ? dictionaryCache.get(lookupKey) : undefined;
  const entries = cachedEntries || (dictionaryResult?.key === lookupKey ? dictionaryResult?.entries : []) || [];
  const loading = !!lookup && !cachedEntries && dictionaryResult?.key !== lookupKey;
  const dictionaryError = dictionaryResult?.key === lookupKey ? dictionaryResult?.error || '' : '';
  const [analysis, setAnalysis] = useState<{ text: string; grouped: boolean; tokens: AnalyzedToken[] }>({ text: '', grouped: true, tokens: [] });
  const [analysisFailure, setAnalysisFailure] = useState<{ text: string; message: string } | null>(null);
  const [saved, setSaved] = useState<Saved[]>([]);
  const grouped = true;
  const [readings, setReadings] = useState(true);
  const [aboutExpanded, setAboutExpanded] = useState(false);
  const [preferencesReady, setPreferencesReady] = useState(false);
  const [storageReady, setStorageReady] = useState(false);
  const [storageError, setStorageError] = useState('');
  const seenSourceCaption = useRef(false);
  const transcriptRank = useRef(0);
  const [sourceTranscript, setSourceTranscript] = useState<{ videoId: string; cues: GeneratedCue[] } | null>(null);
  const canonical = youtubeUrl(pageUrl);
  const videoId = canonical ? new URL(canonical).searchParams.get('v') : null;
  const watching = !!videoId;
  const rawTimeline = sourceTranscript?.videoId === videoId ? sourceTranscript.cues : generated;
  const [refinedTrack, setRefinedTrack] = useState<{ raw: GeneratedCue[]; cues: GeneratedCue[] } | null>(null);
  const timeline = refinedTrack?.raw === rawTimeline ? refinedTrack.cues : rawTimeline;
  useEffect(() => {
    if (rawTimeline.length < 2) return;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 45000);
    void refineCaptionTrack(rawTimeline, serviceUrl('reflow', {}), controller.signal, cues => setRefinedTrack({ raw: rawTimeline, cues })).catch(() => {
      // Source captions stay usable even if boundary analysis is unavailable.
    }).finally(() => clearTimeout(timeout));
    return () => { controller.abort(); clearTimeout(timeout); };
  }, [rawTimeline]);
  const cueIndex = timeline.findIndex(cue => cue.start <= clock.time && cue.end > clock.time);
  const receiveClock = useCallback((time: number, paused: boolean) => {
    const seek = pendingSeek.current;
    // Old decoded frames can arrive while a seek buffers. Keep the requested
    // caption visible briefly rather than snapping back to the previous line.
    const reachedTarget = seek && time >= seek.target - 0.02 && readingCue(timeline, time) === readingCue(timeline, seek.target);
    if (seek && !reachedTarget && Date.now() - seek.requestedAt < 1200) {
      setClock(old => old.paused === paused ? old : { ...old, paused });
      return;
    }
    pendingSeek.current = null;
    latestTime.current = time;
    // The bridge keeps frame time; React only needs to redraw at cue boundaries
    // or playback changes, not the entire WebView/sheet tree every 40 ms.
    setClock(old => old.paused === paused && readingCue(timeline, old.time) === readingCue(timeline, time) ? old : { time, paused });
  }, [timeline]);
  const hasSourceCaption = !!(nativeCaption?.text && nativeCaption.language === 'ja');
  const timelineCue = readingCue(timeline, clock.time);
  const hasTimeline = sourceTranscript?.videoId === videoId || generated.length > 0;
  const observedCaption = !hasTimeline && hasSourceCaption ? nativeCaption : null;
  const caption: Caption | null = timelineCue ? { text: timelineCue.text, tokens: [], time: timelineCue.start, title: nativeCaption?.title || 'YouTube video', url: pageUrl, language: 'ja', paused: clock.paused } : observedCaption ? { ...observedCaption, paused: clock.paused } : null;
  const sentence = normalizeJapaneseCaption(caption?.text || '');
  const analysisError = analysisFailure?.text === sentence ? analysisFailure.message : '';
  const cachedTokens = analysisCache.get(`${grouped}:${sentence}`);
  const currentAnalysis = cachedTokens ? { text: sentence, tokens: cachedTokens } : analysis.grouped === grouped && sentence.startsWith(analysis.text) ? analysis : null;
  const tokens = currentAnalysis?.tokens || [];
  const unparsedTail = currentAnalysis ? sentence.slice(currentAnalysis.text.length) : sentence;
  useEffect(() => {
    AsyncStorage.getItem(STORAGE).then(raw => {
      const data: unknown = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(data) || !data.every(w => typeof w?.key === 'string' && typeof w.word === 'string' && typeof w.sentence === 'string' && typeof w.meaning === 'string')) throw new Error('Invalid library');
      setSaved(data); setStorageReady(true);
    }).catch(() => setStorageError('Could not load saved words. Saving is disabled to protect your library.'));
    AsyncStorage.getItem('immersed.preferences.v1').then(raw => {
      const prefs = restorePreferences(raw ? JSON.parse(raw) : {});
      setDark(prefs.dark); setHideShorts(prefs.hideShorts); setMinimumMinutes(prefs.minimumMinutes); setLevel(prefs.level); setKnowledge(prefs.knowledge); setReadings(prefs.readings);
    }).catch(() => {}).finally(() => setPreferencesReady(true));
  }, []);
  useEffect(() => { if (preferencesReady) void AsyncStorage.setItem('immersed.preferences.v1', JSON.stringify({ schema: PREFERENCES_SCHEMA, readings, dark, hideShorts, minimumMinutes, level, knowledge })).catch(() => setStorageError('Could not save settings on this device.')); }, [preferencesReady, readings, dark, hideShorts, minimumMinutes, level, knowledge]);
  useEffect(() => { if (storageReady) void AsyncStorage.setItem(STORAGE, JSON.stringify(saved)).catch(() => setStorageError('Could not store your changes on this device.')); }, [saved, storageReady]);
  useEffect(() => { if (nativeCaption?.text && nativeCaption.language === 'ja') seenSourceCaption.current = true; }, [nativeCaption]);
  useEffect(() => {
    if (!videoId) return;
    let active = true;
    void loadCaptionCache(videoId).then(cues => {
      if (!active || !cues || seenSourceCaption.current) return;
      seenSourceCaption.current = true; setSourceTranscript({ videoId, cues }); setSubtitleStatus('');
    });
    return () => { active = false; };
  }, [videoId]);
  useEffect(() => { if (sourceTranscript?.videoId === videoId && sourceTranscript.cues.length) seenSourceCaption.current = true; }, [sourceTranscript, videoId]);
  useEffect(() => {
    if (!videoId || !preferencesReady) return;
    let active = true;
    let pending: AbortController | undefined;
    let attempts = 0;
    let timer: ReturnType<typeof setTimeout>;
    const recover = (reason: string | undefined, message: string, canRetry = true) => {
      if (!active || seenSourceCaption.current) return;
      const delay = canRetry ? automaticRetryDelay(reason, attempts) : undefined;
      if (delay === undefined) { setSubtitleStatus(message); return; }
      attempts++;
      timer = setTimeout(poll, delay);
    };
    const poll = async () => {
      if (!active || seenSourceCaption.current) { if (active) setSubtitleStatus(''); return; }
      const controller = new AbortController(); pending = controller;
      const timeout = setTimeout(() => controller.abort(), 8000);
      try {
        const result = await languageRequest<Transcription>('transcribe', { videoId, retry: String(attempts > 0) }, controller.signal);
        if (!active || seenSourceCaption.current) return;
        if (result.status === 'ready' && result.cues?.length) { seenSourceCaption.current = true; setGenerated(result.cues); setSubtitleStatus(''); void saveCaptionCache(videoId, result.cues); }
        else if (result.status === 'processing' || result.status === 'busy') timer = setTimeout(poll, 1000);
        else recover(result.reason, result.message || 'Japanese subtitles are unavailable for this video.', result.canRetry !== false);
      } catch { recover(undefined, 'The subtitle service is unavailable. Existing Japanese captions can still be used.'); }
      finally { clearTimeout(timeout); }
    };
    timer = setTimeout(poll, 2000);
    return () => { active = false; clearTimeout(timer); pending?.abort(); };
  }, [videoId, preferencesReady]);
  useEffect(() => {
    if (!sentence) return;
    if (analysisCache.has(`${grouped}:${sentence}`)) return;
    let active = true;
    void loadAnalysis(sentence).then(tokens => {
      if (active) setAnalysis({ text: sentence, grouped, tokens });
    }).catch(() => { if (active) setAnalysisFailure({ text: sentence, message: 'Word analysis is unavailable. The original subtitle is shown below.' }); });
    return () => { active = false; };
  }, [sentence, grouped]);
  useEffect(() => {
    // Prepare a small look-ahead window, not the whole video. Share in-flight
    // requests with the active line to avoid duplicate work and ruby popping in.
    const next = cueIndex >= 0 ? cueIndex + 1 : Math.max(0, timeline.findIndex(cue => cue.start > clock.time));
    for (const cue of timeline.slice(next, next + 3)) {
      if (pendingAnalysis.size >= 4) break;
      const text = normalizeJapaneseCaption(cue.text);
      if (text) void loadAnalysis(text).catch(() => {});
    }
  }, [timeline, cueIndex, clock.time]);
  useEffect(() => {
    if (!lookup) return;
    const controller = new AbortController();
    let active = true;
    const key = dictionaryKey(lookup.token);
    const cached = dictionaryCache.get(key);
    if (cached) return;
    const timer = setTimeout(() => controller.abort(), 12000);
    void languageRequest<{ data: DictionaryEntry[] }>('dictionary', { word: lookup.token.lemma, reading: lookup.token.reading, proper: String(!!lookup.token.proper) }, controller.signal).then(result => {
      dictionaryCache.set(key, result.data);
      if (active) setDictionaryResult({ key, entries: result.data, error: '' });
    }).catch(() => { if (active) setDictionaryResult({ key, entries: [], error: 'Dictionary unavailable. Check your connection and tap the word again.' }); }).finally(() => { clearTimeout(timer); });
    return () => { active = false; clearTimeout(timer); controller.abort(); };
  }, [lookup]);
  const pageVideo = useRef<string | null>(null);
  const handlePage = (url: string) => {
    const canonical = youtubeUrl(url);
    const id = canonical ? new URL(canonical).searchParams.get('v') : null;
    if (id !== pageVideo.current) { pageVideo.current = id; seenSourceCaption.current = false; transcriptRank.current = 0; pendingSeek.current = null; latestTime.current = 0; setSubtitleStatus(''); setGenerated([]); setNativeCaption(null); setClock({ time: 0, paused: true }); setLookup(null); }
    if (!id && /^https:\/\/(?:m\.|www\.)?youtube\.com\//.test(url)) lastBrowse.current = url;
    setPageUrl(url);
  };
  const receiveCaption = (value: Caption | null) => {
    setNativeCaption(value);
    if (value?.language === 'ja' && value.text) {
      const url = youtubeUrl(value.url);
      const id = url ? new URL(url).searchParams.get('v') : null;
      if (id && id === pageVideo.current) { seenSourceCaption.current = true; setSubtitleStatus(''); }
    }
  };
  const browse = (url: string) => { Keyboard.dismiss(); setError(''); setNativeCaption(null); setLookup(null); handlePage(url); setUri(url); setBrowserVersion(v => v + 1); };
  const openInput = () => {
    const text = input.trim(); if (!text) return;
    if (hideShorts && /^https?:/i.test(text)) { try { if (new URL(text).pathname.startsWith('/shorts/')) { setError('Shorts are hidden. Enable them in Settings to open this link.'); return; } } catch {} }
    const video = youtubeUrl(text);
    if (/^https?:/i.test(text) && !video) { setError('Use a YouTube video link, or type a topic to search.'); return; }
    setTopic('Search'); browse(video || topicUrl(`${text} -日本語学習 -JLPT`));
  };
  const tapWord = (token: AnalyzedToken) => { if (caption) setLookup({ token, caption }); };
  const closeLookup = useCallback(() => setLookup(null), []);
  const togglePlayback = () => {
    browser.current?.command(clock.paused ? 'play' : 'pause');
    setClock(old => ({ ...old, paused: !old.paused }));
  };
  const previousSentence = sentenceTarget(timeline, clock.time, -1);
  const nextSentence = sentenceTarget(timeline, clock.time, 1);
  const jumpSentence = (time: number) => {
    // Seeking closes the inline definition and keeps the current playback state.
    pendingSeek.current = { target: time, requestedAt: Date.now() };
    latestTime.current = time;
    browser.current?.command('seekTo', time);
    setClock(old => ({ ...old, time }));
    if (lookup) closeLookup();
  };
  const skipSentence = (direction: -1 | 1) => {
    const target = sentenceTarget(timeline, pendingSeek.current?.target ?? latestTime.current, direction);
    if (target !== undefined) jumpSentence(target);
  };
  const gestures = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_event, state) => state.numberActiveTouches < 2 && !!swipeAction(state.dx, state.dy),
    onPanResponderRelease: (_event, state) => {
      const action = swipeAction(state.dx, state.dy);
      if (action === 'forward' || action === 'backward') browser.current?.command('seek', action === 'forward' ? 10 : -10);
    },
  }), []);
  const navigationState = useRef({ panel: panel || '', watching, width });
  const backAction = useRef<() => void>(() => {});
  const sectionAction = useRef<(dx: number) => void>(() => {});
  const edgeOrigin = useRef(false);
  useEffect(() => { navigationState.current = { panel: panel || '', watching, width }; }, [panel, watching, width]);
  const navigateBySwipe = useCallback((dx: number) => {
    const sections = ['', 'words', 'settings'];
    const index = Math.max(0, sections.indexOf(navigationState.current.panel));
    const next = sections[Math.max(0, Math.min(2, index + (dx < 0 ? 1 : -1)))];
    Keyboard.dismiss();
    openPanel(next || undefined);
  }, [openPanel]);
  sectionAction.current = navigateBySwipe;
  const appGestures = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponderCapture: event => {
      if (event.nativeEvent.touches.length > 1) { edgeOrigin.current = false; return false; }
      const x = event.nativeEvent.touches[0]?.pageX ?? event.nativeEvent.pageX;
      edgeOrigin.current = x < 22;
      if (edgeOrigin.current && Platform.OS === 'web') event.preventDefault();
      return edgeOrigin.current;
    },
    onMoveShouldSetPanResponderCapture: (_event, state) => {
      if (state.numberActiveTouches > 1) return false;
      // x0 is assigned only after the responder is granted. Derive the start
      // during capture so a normal swipe is not mistaken for an edge gesture.
      const startX = state.moveX - state.dx;
      if (startX < 22) return false;
      if (TextInput.State.currentlyFocusedInput?.() || (Platform.OS === 'web' && typeof document !== 'undefined' && /^(INPUT|TEXTAREA)$/.test(document.activeElement?.tagName || ''))) return false;
      const current = navigationState.current;
      const horizontal = Math.abs(state.dx) > 65 && Math.abs(state.dx) > Math.abs(state.dy) * 1.6;
      return horizontal && (!!current.panel || !current.watching || startX > current.width - 30);
    },
    onPanResponderTerminationRequest: () => !edgeOrigin.current,
    onPanResponderRelease: (_event, state) => {
      if (edgeOrigin.current) {
        if (state.dx > 60 && state.dx > Math.abs(state.dy) * 1.5) backAction.current();
      } else sectionAction.current(state.dx);
      edgeOrigin.current = false;
    },
  }), []);
  const dockGestures = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_event, state) => Math.abs(state.dx) > 40 && Math.abs(state.dx) > Math.abs(state.dy) * 1.6,
    onPanResponderTerminationRequest: () => false,
    onPanResponderRelease: (_event, state) => sectionAction.current(state.dx),
  }), []);
  const goBack = useCallback(() => {
    Keyboard.dismiss();
    if (lookup) { closeLookup(); return; }
    if (currentPanel.current) {
      currentPanel.current = panelHistory.current.pop() || '';
      router.setParams({ panel: currentPanel.current || undefined });
    }
    else if (watching) browse(lastBrowse.current);
    else browser.current?.back();
  // browse reads the current browsing destination, not a new video selection.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panel, watching, router, lookup, closeLookup]);
  backAction.current = goBack;
  const save = (entry: DictionaryEntry) => {
    if (!lookup || !storageReady) return;
    const japanese = entry.japanese[0]; const key = `${entry.slug}:${japanese.reading ?? ''}`;
    if (saved.some(w => w.key === key)) return;
    setSaved(old => [{ key, word: japanese.word || lookup.token.lemma, reading: japanese.reading || '', meaning: entry.senses[0].english_definitions.join('; '), sentence: lookup.caption.text, title: lookup.caption.title, url: lookup.caption.url, time: lookup.caption.time }, ...old]);
  };
  const settingsPanel = <View testID="settings-panel" style={{ flex: 1, minHeight: 0 }}><View style={[s.header, watching && { paddingVertical: 0, minHeight: 44 }]}><Text style={[s.brand, watching && { fontSize: 18, letterSpacing: -0.3 }]}>Settings.</Text>{watching && <PlaybackButton dark={dark} paused={clock.paused} onTogglePlayback={togglePlayback} compact />}</View>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: watching ? 16 : 24, paddingTop: watching ? 4 : 24, paddingBottom: 16 }}>
        <View style={s.setting}><Text style={[s.emptyTitle, { flex: 1 }]}>Dark mode</Text><Switch accessibilityLabel="Dark mode" value={dark} onValueChange={setDark} trackColor={{ true: '#344C3F' }} /></View>
        <Text style={[s.emptyTitle, { marginTop: 24 }]}>Completed Japanese level</Text><View style={s.levels}>{([5,4,3,2,1] as JlptLevel[]).map(n => <Pressable key={n} accessibilityRole="radio" aria-checked={level === n} accessibilityState={{ checked: level === n }} accessibilityLabel={`Completed N${n}`} onPress={() => setLevel(n)} style={[s.topic, level === n && s.activeTopic]}><Text style={s.topicText}>N{n}</Text></Pressable>)}</View>
        <Text style={s.hint}>Only words above your level or marked unknown are softly highlighted.</Text>
        <View style={s.setting}><View style={{ flex: 1 }}><Text style={s.emptyTitle}>Furigana</Text><Text style={s.hint}>Readings for words above your level or marked unknown.</Text></View><Switch accessibilityLabel="Furigana" value={readings} onValueChange={setReadings} trackColor={{ true: '#344C3F' }} /></View>
        <View style={s.setting}><Text style={[s.emptyTitle, { flex: 1 }]}>Hide Shorts</Text><Switch accessibilityLabel="Hide Shorts" value={hideShorts} onValueChange={setHideShorts} trackColor={{ true: '#344C3F' }} /></View>
        <View style={{ paddingTop: 24 }}><Text style={s.emptyTitle}>Minimum video length</Text><View accessibilityRole="radiogroup" accessibilityLabel="Minimum video length" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 14 }}>{[0, 15, 30, 60].map(minutes => <Pressable key={minutes} accessibilityRole="radio" accessibilityLabel={minutes ? `At least ${minutes} minutes` : 'Any video length'} aria-checked={minimumMinutes === minutes} accessibilityState={{ checked: minimumMinutes === minutes }} onPress={() => setMinimumMinutes(minutes)} style={[s.topic, minimumMinutes === minutes && s.activeTopic]}><Text style={s.topicText}>{minutes ? `${minutes}+ min` : 'Any'}</Text></Pressable>)}</View></View>
        <View style={{ marginTop: 24, paddingTop: 8 }}><Button onPress={() => setAboutExpanded(value => !value)}>About</Button></View>
        {aboutExpanded && <View style={{ marginTop: 24 }}><Text style={s.meaning}>Immersed {history[0].version}</Text><Text style={s.emptyTitle}>Dictionary & credits</Text><Text style={s.hint}>JMdict + JMnedict / EDRDG · Japanese ↔ English, including names. Kuromoji/IPADIC provides word and grammar grouping. Grammar labels and JLPT levels are estimates. Lookup and grouping are always enabled. Furigana follows the selected level and your known/unknown overrides; unlisted words have no assumed JLPT level.</Text><Text style={s.hint}>YouTube account sign-in is unavailable in this preview. Google prohibits embedded sign-in; browser sessions cannot be imported into this player. Locked-screen playback is not supported in Expo Go.</Text>{!!subtitleStatus && <Text style={s.hint}>{subtitleStatus}</Text>}<Text style={s.attribution}>JMdict © EDRDG, CC BY-SA 4.0. Kuromoji © Atilika, Apache-2.0, with IPADIC/NAIST notices. JLPT estimates: OpenJLPT / Jonathan Waller / EDRDG, CC BY-SA 4.0. Speech recognition: faster-whisper. Caption text is processed on the preview server; saved words and caption cache stay on the device. https://www.edrdg.org/edrdg/licence.html</Text>
        <Text style={s.hint}>Video difficulty estimates use a sample of caption vocabulary and your level/word overrides. The range includes unrated words; grammar, speed and listening comprehension are not measured.</Text><Text style={s.emptyTitle}>Version history</Text>{history.map(release => <View key={release.version} style={s.entry}><Text style={s.meaning}>{release.version} · {release.date}</Text><Text style={s.reading}>{release.title}</Text>{release.notes.map(note => <Text key={note} style={s.hint}>• {note}</Text>)}</View>)}</View>}
      </ScrollView></View>;
  const libraryPanel = <View testID="words-panel" style={{ flex: 1, minHeight: 0 }}><View style={[s.header, watching && { paddingVertical: 0, minHeight: 44 }]}><Text style={[s.brand, watching && { fontSize: 18, letterSpacing: -0.3 }]}>Words.</Text>{watching && <PlaybackButton dark={dark} paused={clock.paused} onTogglePlayback={togglePlayback} compact />}</View><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: watching ? 16 : 22, paddingTop: watching ? 4 : 22, paddingBottom: 16 }}><DictionarySearch dark={dark} compact={watching} /><Text style={s.emptyTitle}>Saved words</Text>{!saved.length && <Text style={s.hint}>Your saved words and their original video context will appear here.</Text>}{!!storageError && <Text style={s.hint}>{storageError}</Text>}{saved.map(word => <View key={word.key} style={s.entry}><Text style={s.lookupWord}>{word.word}</Text><Text style={s.reading}>{word.reading}</Text><Text style={s.meaning}>{word.meaning}</Text><Text style={s.sentence}>{word.sentence}</Text><Text style={s.hint}>{word.title}</Text><View style={s.row}><Button onPress={() => { const link = youtubeUrl(word.url); if (link) { setLibrary(false); browse(`${link}&t=${Math.floor(word.time)}s`); } }}>Watch context ↗</Button><Button onPress={() => setSaved(old => old.filter(w => w.key !== word.key))}>Remove</Button></View></View>)}</ScrollView></View>;
  const lookupContent = <LookupSheet inline lookup={lookup} dark={dark} entries={entries} loading={loading} error={dictionaryError} onClose={closeLookup}
      known={!!lookup && familiarity(lookup.token.lemma, lookup.token.reading, level, knowledge) === 'known'}
      onKnown={known => { if (lookup) setKnowledge(old => ({ ...old, [lookup.token.lemma]: known })); }}
      canSave={storageReady} saved={!!entries[0] && saved.some(word => word.key === `${entries[0].slug}:${entries[0].japanese[0]?.reading ?? ''}`)} onSave={save}
      controls={<SentenceControls dark={dark} compact paused={clock.paused} onTogglePlayback={togglePlayback} previous={previousSentence === undefined ? undefined : () => skipSentence(-1)} next={nextSentence === undefined ? undefined : () => skipSentence(1)} />} />;
  return <DarkContext.Provider value={dark}><KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}><SafeAreaView edges={watching ? [] : ['top', 'left', 'right']} style={s.safe} onLayout={event => { const next = event.nativeEvent.layout.height; setViewportHeight(old => Math.abs(old - next) < 1 ? old : next); }} {...appGestures.panHandlers}><StatusBar hidden={watching} style={dark ? "light" : "dark"} />
    {!watching && <View style={s.header}><View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><Image source={require('./assets/icon.png')} accessibilityLabel="Immersed app icon" style={{ width: 36, height: 36, borderRadius: 9 }} /><Text style={s.brand}>immersed.</Text></View><Text style={s.hint}>日本語 · N{level}</Text></View>}
    {!watching && <><View style={s.search}><TextInput accessibilityLabel="Search Japanese topics or paste a YouTube link" placeholder="Search a topic or paste a YouTube link" placeholderTextColor={dark ? "#999" : "#70776E"} value={input} onChangeText={setInput} onSubmitEditing={openInput} returnKeyType="search" autoCapitalize="none" style={s.input} /><Button onPress={openInput}>Go</Button></View><View><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.topics}>{topics.map(item => <Pressable accessibilityRole="button" key={item.label} onPress={() => { setTopic(item.label); browse(topicUrl(item.query)); }} style={[s.topic, topic === item.label && s.activeTopic]}><Text style={s.topicText}>{item.label}</Text></Pressable>)}</ScrollView></View></>}
    {!!error && <View style={[s.error, watching && { position: 'absolute', top: insets.top + 12, left: 12, right: 12, zIndex: 15, borderRadius: 18 }]}><Text style={s.hint}>{error}</Text></View>}
    <View testID="content-surface" style={s.contentSurface}>
      <View testID="video-surface" style={watching ? s.watchVideo : s.browser}><YouTubeBrowser key={browserVersion} ref={browser} uri={uri} dark={dark} hideShorts={hideShorts} minimumMinutes={minimumMinutes} onCaption={receiveCaption} onPage={handlePage} onTranscript={(cues, id, source = 'unknown') => { if (id !== pageVideo.current || captionSourceRank(source) < transcriptRank.current) return; transcriptRank.current = captionSourceRank(source); seenSourceCaption.current = true; setSourceTranscript({ videoId: id, cues }); setSubtitleStatus(''); void saveCaptionCache(id, cues); }} onClock={receiveClock} onError={setError} /></View>
      {watching && <View testID="subtitle-panel" style={[s.study, { height: readingHeight, paddingBottom: dockClearance, paddingHorizontal: panel || lookup ? 0 : 18, paddingTop: panel || lookup ? 0 : 8 }]} {...(!panel && !lookup ? gestures.panHandlers : {})}>
        {settings ? settingsPanel : library ? libraryPanel : lookup ? lookupContent : <>
          <VideoCoverage cues={rawTimeline} level={level} knowledge={knowledge} dark={dark} />
          <ScrollView style={s.captionScroll} contentContainerStyle={{ paddingVertical: 8, flexGrow: 1, justifyContent: 'center' }}>
            {sentence ? <><StudySubtitles tokens={tokens} tail={unparsedTail} dark={dark} level={level} knowledge={knowledge} readings={readings} onWord={tapWord} />{!!analysisError && <Text style={s.hint}>{analysisError}</Text>}</> : <Text style={s.captionEmpty}>{subtitleStatus ? 'Japanese subtitles unavailable' : '—'}</Text>}
          </ScrollView>
          <SentenceControls dark={dark} paused={clock.paused} onTogglePlayback={togglePlayback} previous={previousSentence === undefined ? undefined : () => skipSentence(-1)} next={nextSentence === undefined ? undefined : () => skipSentence(1)} />
        </>}
      </View>}
    </View>
    <FloatingGlass dark={dark} style={[s.dock, { bottom: Math.max(insets.bottom, 12), left: (width - 182) / 2 }]}><View style={s.dockRow} {...dockGestures.panHandlers}>
      <NavigationButton icon={(panel || lookup) && watching ? 'watch' : 'browse'} label={(panel || lookup) && watching ? 'Watch & read' : 'Browse'} active={!panel && !lookup} dark={dark} onPress={() => { if (lookup) closeLookup(); else if (panel) openPanel(undefined); else browse(topicUrl(topics.find(t => t.label === topic)?.query || topics[0].query)); }} />
      <NavigationButton icon="words" label={`Words · ${saved.length}`} active={library || !!lookup} dark={dark} onPress={() => setLibrary(true)} />
      <NavigationButton icon="settings" label="Settings" active={settings} dark={dark} onPress={() => setSettings(true)} />
    </View></FloatingGlass>
    {!watching && settings && <SafeAreaView edges={['top', 'left', 'right']} style={[s.safe, s.panelScreen, { paddingBottom: dockClearance }]}>{settingsPanel}</SafeAreaView>}
    {!watching && library && <SafeAreaView edges={['top', 'left', 'right']} style={[s.safe, s.panelScreen, { paddingBottom: dockClearance }]}>{libraryPanel}</SafeAreaView>}
    <View testID="back-gesture-edge" style={{ position: 'absolute', left: 0, top: 0, bottom: dockClearance, width: 22, zIndex: 70 }} />
  </SafeAreaView></KeyboardAvoidingView></DarkContext.Provider>;
}
function createStyles(dark: boolean) {
  const bg = dark ? '#000000' : '#F7F5EF', ink = dark ? '#F3F3F3' : '#242D28', muted = dark ? '#AAAAAA' : '#70776E', panel = dark ? '#171717' : '#E8EBE1', accent = dark ? '#B4DEC4' : '#344C3F';
  return StyleSheet.create({
  contentSurface: { flex: 1, minHeight: 0 }, watchVideo: { flex: 1, minHeight: 0, backgroundColor: '#000' }, panelScreen: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, zIndex: 20 }, captionEmpty: { color: muted, fontSize: 18, minHeight: 38, textAlign: 'center' },
  dock: { position: 'absolute', width: 182, zIndex: 50, borderRadius: 34, overflow: 'hidden', borderWidth: 1, borderColor: dark ? '#ffffff25' : '#00000015' }, dockRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 6 }, levels: { flexDirection: 'row', gap: 8, marginVertical: 14 },
  safe: { flex: 1, backgroundColor: bg }, header: { paddingHorizontal: 14, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }, brand: { color: ink, fontSize: 28, fontWeight: '800', letterSpacing: -1.5 }, button: { backgroundColor: panel, paddingVertical: 12, paddingHorizontal: 13, borderRadius: 12 }, buttonText: { color: accent, fontWeight: '600', fontSize: 12 }, search: { paddingHorizontal: 16, flexDirection: 'row', gap: 8, marginBottom: 10 }, input: { flex: 1, minWidth: 0, color: ink, backgroundColor: bg, borderWidth: 1, borderColor: dark ? '#2A2A2A' : '#DFE2D9', borderRadius: 12, padding: 10, fontSize: 13 }, topics: { paddingHorizontal: 16, gap: 8, paddingBottom: 12 }, topic: { paddingVertical: 10, paddingHorizontal: 15, borderRadius: 24, backgroundColor: panel }, activeTopic: { backgroundColor: dark ? '#294134' : '#DCE4D8' }, topicText: { color: accent, fontSize: 12, fontWeight: '600' },
  browser: { flex: 1, minHeight: 240, backgroundColor: bg }, study: { flexShrink: 0, backgroundColor: bg, borderTopWidth: 1, borderTopColor: dark ? '#2A2A2A' : '#DFE2D9', paddingHorizontal: 18, paddingTop: 16 }, row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 }, eyebrow: { color: muted, fontSize: 10, fontWeight: '700', letterSpacing: 1 }, badge: { color: '#BD512E', fontSize: 10 }, captionScroll: { flex: 1, minHeight: 0 }, tokens: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-end' }, token: { minHeight: 48, paddingHorizontal: 3, justifyContent: 'flex-end', paddingVertical: 6 }, furigana: { color: muted, fontSize: 12, textAlign: 'center', marginBottom: 2 }, japanese: { color: ink, fontSize: 25, lineHeight: 37 }, tappable: { textDecorationLine: 'underline', textDecorationColor: '#BCC8B5' }, emptyTitle: { color: ink, fontSize: 16, fontWeight: '600', marginBottom: 8 }, hint: { color: muted, fontSize: 12, lineHeight: 19 }, error: { padding: 12, backgroundColor: dark ? '#241F1B' : '#F4E3D9', gap: 8 },
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: '#18261D77' }, sheet: { backgroundColor: bg, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 38 }, lookupWord: { color: ink, fontSize: 31, marginTop: 12, marginBottom: 10 }, entry: { borderBottomColor: dark ? '#2A2A2A' : '#DFE2D9', borderBottomWidth: 1, paddingBottom: 18, marginBottom: 18, gap: 10 }, reading: { color: accent, fontSize: 15, lineHeight: 23 }, meaning: { color: ink, fontSize: 17, lineHeight: 25 }, sentence: { color: accent, fontSize: 16, lineHeight: 25, marginVertical: 14 }, grammar: { color: '#95603A', fontSize: 14, marginVertical: 10 }, setting: { flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: 1, borderBottomColor: dark ? '#2A2A2A' : '#DFE2D9', paddingVertical: 20 }, attribution: { color: muted, fontSize: 11, lineHeight: 18, marginVertical: 20 },
});
}
const darkStyles = createStyles(true);
const lightStyles = createStyles(false);
