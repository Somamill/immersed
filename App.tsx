import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Keyboard, PanResponder, Linking, Modal, Pressable, ScrollView, StyleSheet, Switch, Text as NativeText, TextInput, useWindowDimensions, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import FloatingGlass from './src/components/FloatingGlass';
import { StatusBar } from 'expo-status-bar';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { readingCue } from './src/captions';
import { automaticRetryDelay } from './src/subtitle-policy';
import { swipeAction } from './src/player';
import { familiarity, type JlptLevel } from './src/learning';
import { PREFERENCES_SCHEMA, restorePreferences } from './src/preferences';
import history from './src/version-history.json';
import YouTubeBrowser, { type BrowserHandle } from './src/components/YouTubeBrowser';
import { topics, topicUrl, youtubeUrl, type Caption, type DictionaryEntry } from './src/youtube';
import { languageRequest, type AnalyzedToken, type GeneratedCue, type Transcription } from './src/language';

type Saved = { key: string; word: string; reading: string; meaning: string; sentence: string; title: string; url: string; time: number };
type Lookup = { token: AnalyzedToken; caption: Caption };
const STORAGE = 'immersed.youtube.words.v1';
const dictionaryCache = new Map<string, DictionaryEntry[]>();
const analysisCache = new Map<string, AnalyzedToken[]>();
const DarkContext = createContext(true);
// Match native Text's non-selectable default in the browser preview, where text
// selection otherwise takes ownership of horizontal navigation gestures.
function Text(props: React.ComponentProps<typeof NativeText>) {
  return <NativeText selectable={false} {...props} />;
}
function Button({ children, onPress, quiet = false }: { children: string; onPress: () => void; quiet?: boolean }) {
  const s = useContext(DarkContext) ? darkStyles : lightStyles;
  return <Pressable accessibilityRole="button" onPress={onPress} style={[s.button, quiet && { backgroundColor: 'transparent', paddingHorizontal: 10 }]}><Text style={s.buttonText}>{children}</Text></Pressable>;
}
export default function App() {
  const browser = useRef<BrowserHandle>(null);
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { panel } = useLocalSearchParams<{ panel?: string }>();
  const settings = panel === 'settings';
  const library = panel === 'words';
  const setSettings = (open: boolean) => router.setParams({ panel: open ? 'settings' : undefined });
  const setLibrary = (open: boolean) => router.setParams({ panel: open ? 'words' : undefined });
  const { width, height } = useWindowDimensions();
  const dockClearance = Math.max(insets.bottom, 12) + 76;
  const readingHeight = Math.max(154, Math.min(246, height * 0.25)) + dockClearance;
  const [dark, setDark] = useState(true);
  const [hideShorts, setHideShorts] = useState(true);
  const [level, setLevel] = useState<JlptLevel>(5);
  const [knowledge, setKnowledge] = useState<Record<string, boolean>>({});
  const s = dark ? darkStyles : lightStyles;
  const [uri, setUri] = useState(topicUrl(topics[0].query));
  const [browserVersion, setBrowserVersion] = useState(0);
  const [pageUrl, setPageUrl] = useState('');
  const [topic, setTopic] = useState('Daily life');
  const [input, setInput] = useState('');
  const [nativeCaption, setNativeCaption] = useState<Caption | null>(null);
  const [lastNativeCaption, setLastNativeCaption] = useState<{ videoId: string; caption: Caption } | null>(null);
  const [clock, setClock] = useState({ time: 0, paused: true });
  const [generated, setGenerated] = useState<GeneratedCue[]>([]);
  const [subtitleStatus, setSubtitleStatus] = useState('');
  const [error, setError] = useState('');
  const [lookup, setLookup] = useState<Lookup | null>(null);
  const [dictionaryResult, setDictionaryResult] = useState<{ key: string; entries: DictionaryEntry[]; error: string } | null>(null);
  const cachedEntries = lookup ? dictionaryCache.get(lookup.token.lemma) : undefined;
  const entries = cachedEntries || (dictionaryResult?.key === lookup?.token.lemma ? dictionaryResult?.entries : []) || [];
  const loading = !!lookup && !cachedEntries && dictionaryResult?.key !== lookup.token.lemma;
  const dictionaryError = dictionaryResult?.key === lookup?.token.lemma ? dictionaryResult?.error || '' : '';
  const [analysis, setAnalysis] = useState<{ text: string; grouped: boolean; tokens: AnalyzedToken[] }>({ text: '', grouped: true, tokens: [] });
  const [analysisFailure, setAnalysisFailure] = useState<{ text: string; message: string } | null>(null);
  const [saved, setSaved] = useState<Saved[]>([]);
  const [grouped, setGrouped] = useState(true);
  const [readings, setReadings] = useState(true);
  const [preferencesReady, setPreferencesReady] = useState(false);
  const [storageReady, setStorageReady] = useState(false);
  const [storageError, setStorageError] = useState('');
  const seenSourceCaption = useRef(false);
  const lookupPlayback = useRef<{ resume: boolean; videoId: string | null }>({ resume: false, videoId: null });
  const [sourceTranscript, setSourceTranscript] = useState<{ videoId: string; cues: GeneratedCue[] } | null>(null);
  const canonical = youtubeUrl(pageUrl);
  const videoId = canonical ? new URL(canonical).searchParams.get('v') : null;
  const watching = !!videoId;
  const sourceCue = sourceTranscript?.videoId === videoId ? readingCue(sourceTranscript.cues, clock.time) : undefined;
  const generatedCue = readingCue(generated, clock.time);
  const hasSourceCaption = !!(nativeCaption?.text && nativeCaption.language === 'ja');
  const timelineCue = sourceCue || generatedCue;
  const previousCaption = lastNativeCaption?.videoId === videoId && lastNativeCaption.caption.time <= clock.time ? lastNativeCaption.caption : null;
  const observedCaption = hasSourceCaption ? nativeCaption : previousCaption;
  const caption: Caption | null = timelineCue ? { text: timelineCue.text, tokens: [], time: timelineCue.start, title: nativeCaption?.title || 'YouTube video', url: pageUrl, language: 'ja', paused: clock.paused } : observedCaption ? { ...observedCaption, paused: clock.paused } : null;
  const sentence = caption?.text || '';
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
      setDark(prefs.dark); setHideShorts(prefs.hideShorts); setLevel(prefs.level); setKnowledge(prefs.knowledge);
      setGrouped(prefs.grouped); setReadings(prefs.readings);
    }).catch(() => {}).finally(() => setPreferencesReady(true));
  }, []);
  useEffect(() => { if (preferencesReady) void AsyncStorage.setItem('immersed.preferences.v1', JSON.stringify({ schema: PREFERENCES_SCHEMA, grouped, readings, dark, hideShorts, level, knowledge })).catch(() => setStorageError('Could not save settings on this device.')); }, [grouped, readings, preferencesReady, dark, hideShorts, level, knowledge]);
  useEffect(() => { if (storageReady) void AsyncStorage.setItem(STORAGE, JSON.stringify(saved)).catch(() => setStorageError('Could not store your changes on this device.')); }, [saved, storageReady]);
  useEffect(() => { if (nativeCaption?.text && nativeCaption.language === 'ja') seenSourceCaption.current = true; }, [nativeCaption]);
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
        if (result.status === 'ready' && result.cues?.length) { setGenerated(result.cues); setSubtitleStatus(''); }
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
    const key = `${grouped}:${sentence}`;
    const cached = analysisCache.get(key);
    if (cached) return;
    let active = true;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    // Keep completed responses cached even if a newer partial caption arrives.
    // Previously every new caption aborted the previous request and discarded it.
    void languageRequest<{ tokens: AnalyzedToken[]; dictionary?: Record<string, DictionaryEntry[]> }>('analyze', { text: sentence, grouped: String(grouped), dictionary: 'true' }, controller.signal).then(result => {
      if (analysisCache.size >= 300) analysisCache.delete(analysisCache.keys().next().value!);
      analysisCache.set(key, result.tokens);
      for (const [lemma, entries] of Object.entries(result.dictionary || {})) dictionaryCache.set(lemma, entries);
      if (active) setAnalysis({ text: sentence, grouped, tokens: result.tokens });
    }).catch(() => { if (active) setAnalysisFailure({ text: sentence, message: 'Word analysis is unavailable. The original subtitle is shown below.' }); }).finally(() => clearTimeout(timeout));
    return () => { active = false; };
  }, [sentence, grouped]);
  useEffect(() => {
    if (!lookup) return;
    const controller = new AbortController();
    let active = true;
    const key = lookup.token.lemma;
    const cached = dictionaryCache.get(key);
    if (cached) return;
    const timer = setTimeout(() => controller.abort(), 12000);
    void languageRequest<{ data: DictionaryEntry[] }>('dictionary', { word: key }, controller.signal).then(result => {
      dictionaryCache.set(key, result.data);
      if (active) setDictionaryResult({ key, entries: result.data, error: '' });
    }).catch(() => { if (active) setDictionaryResult({ key, entries: [], error: 'Dictionary unavailable. Check your connection and tap the word again.' }); }).finally(() => { clearTimeout(timer); });
    return () => { active = false; clearTimeout(timer); controller.abort(); };
  }, [lookup]);
  const pageVideo = useRef<string | null>(null);
  const handlePage = (url: string) => {
    const canonical = youtubeUrl(url);
    const id = canonical ? new URL(canonical).searchParams.get('v') : null;
    if (id !== pageVideo.current) { pageVideo.current = id; seenSourceCaption.current = false; setSubtitleStatus(''); setGenerated([]); setNativeCaption(null); setLastNativeCaption(null); setClock({ time: 0, paused: true }); setLookup(null); lookupPlayback.current = { resume: false, videoId: null }; }
    setPageUrl(url);
  };
  const receiveCaption = (value: Caption | null) => {
    setNativeCaption(value);
    if (value?.language === 'ja' && value.text) {
      const url = youtubeUrl(value.url);
      const id = url ? new URL(url).searchParams.get('v') : null;
      if (id && id === pageVideo.current) { seenSourceCaption.current = true; setSubtitleStatus(''); setLastNativeCaption({ videoId: id, caption: value }); }
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
  const tapWord = (token: AnalyzedToken) => { if (caption) { lookupPlayback.current = { resume: !caption.paused, videoId }; browser.current?.command('pause'); setLookup({ token, caption }); } };
  const closeLookup = useCallback(() => {
    const { resume, videoId: openedVideo } = lookupPlayback.current;
    lookupPlayback.current = { resume: false, videoId: null };
    setLookup(null);
    if (resume && openedVideo === videoId) browser.current?.command('play');
  }, [videoId]);
  const gestures = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_event, state) => !!swipeAction(state.dx, state.dy),
    onPanResponderRelease: (_event, state) => {
      const action = swipeAction(state.dx, state.dy);
      if (action === 'forward' || action === 'backward') browser.current?.command('seek', action === 'forward' ? 10 : -10);
    },
  }), []);
  const navigationState = useRef({ panel: panel || '', watching, width });
  useEffect(() => { navigationState.current = { panel: panel || '', watching, width }; }, [panel, watching, width]);
  const appGestures = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponderCapture: (_event, state) => {
      const current = navigationState.current;
      const horizontal = Math.abs(state.dx) > 65 && Math.abs(state.dx) > Math.abs(state.dy) * 1.6;
      return horizontal && (!!current.panel || state.x0 < 30 || state.x0 > current.width - 30);
    },
    onPanResponderRelease: (_event, state) => {
      const sections = ['', 'words', 'settings'];
      const current = navigationState.current.panel;
      const index = Math.max(0, sections.indexOf(current));
      const next = sections[Math.max(0, Math.min(2, index + (state.dx < 0 ? 1 : -1)))];
      if (next) browser.current?.command('pause');
      router.setParams({ panel: next || undefined });
    },
  }), [router]);
  const dismissGesture = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_event, state) => state.dy > 45 && state.dy > Math.abs(state.dx) * 1.5,
    onPanResponderRelease: () => closeLookup(),
  }), [closeLookup]);
  const save = (entry: DictionaryEntry) => {
    if (!lookup || !storageReady) return;
    const japanese = entry.japanese[0]; const key = `${entry.slug}:${japanese.reading ?? ''}`;
    if (saved.some(w => w.key === key)) return;
    setSaved(old => [{ key, word: japanese.word || lookup.token.lemma, reading: japanese.reading || '', meaning: entry.senses[0].english_definitions.join('; '), sentence: lookup.caption.text, title: lookup.caption.title, url: lookup.caption.url, time: lookup.caption.time }, ...old]);
  };
  return <DarkContext.Provider value={dark}><SafeAreaView edges={watching ? [] : ['top', 'left', 'right']} style={s.safe} {...appGestures.panHandlers}><StatusBar hidden={watching && !panel} style={dark ? "light" : "dark"} />
    {!watching && <View style={s.header}><Text style={s.brand}>immersed.</Text><Text style={s.hint}>日本語 · N{level}</Text></View>}
    {!watching && <><View style={s.search}><TextInput accessibilityLabel="Search Japanese topics or paste a YouTube link" placeholder="Search a topic or paste a YouTube link" placeholderTextColor={dark ? "#999" : "#70776E"} value={input} onChangeText={setInput} onSubmitEditing={openInput} returnKeyType="search" autoCapitalize="none" style={s.input} /><Button onPress={openInput}>Go</Button></View><View><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.topics}>{topics.map(item => <Pressable accessibilityRole="button" key={item.label} onPress={() => { setTopic(item.label); browse(topicUrl(item.query)); }} style={[s.topic, topic === item.label && s.activeTopic]}><Text style={s.topicText}>{item.label}</Text></Pressable>)}</ScrollView></View></>}
    {!!error && <View style={[s.error, watching && { position: 'absolute', top: insets.top + 12, left: 12, right: 12, zIndex: 15, borderRadius: 18 }]}><Text style={s.hint}>{error}</Text></View>}
    <View testID="content-surface" style={s.contentSurface}>
      <View testID="video-surface" style={watching ? s.watchVideo : s.browser}><YouTubeBrowser key={browserVersion} ref={browser} uri={uri} dark={dark} hideShorts={hideShorts} onCaption={receiveCaption} onPage={handlePage} onTranscript={(cues, id) => { if (id !== pageVideo.current) return; seenSourceCaption.current = true; setSourceTranscript({ videoId: id, cues }); setSubtitleStatus(''); }} onClock={(time, paused) => setClock({ time, paused })} onError={setError} /></View>
      {watching && <View testID="subtitle-panel" style={[s.study, { height: readingHeight, paddingBottom: dockClearance }]} {...gestures.panHandlers}>
        <Text style={s.eyebrow}>JAPANESE SUBTITLES</Text>
        <ScrollView style={s.captionScroll} contentContainerStyle={{ paddingVertical: 14 }}>
          {sentence ? <>{tokens.length ? <View style={s.tokens}>{tokens.map((token, i) => <Pressable key={`${sentence}:${i}`} accessibilityRole={token.word ? 'button' : undefined} accessibilityLabel={token.word ? `Look up ${token.text}` : token.text} disabled={!token.word} onPress={() => tapWord(token)} style={s.token}>{readings && /[一-龯]/.test(token.text) && !!token.reading && <Text style={s.furigana}>{token.reading}</Text>}<Text style={[s.japanese, token.word && familiarity(token.lemma, token.reading, level, knowledge) === 'unknown' && s.unknown]}>{token.text}</Text></Pressable>)}{!!unparsedTail && <Text style={s.japanese}>{unparsedTail}</Text>}</View> : <Text style={s.japanese}>{sentence}</Text>}{!!analysisError && <Text style={s.hint}>{analysisError}</Text>}</> : <Text style={s.captionEmpty}>{subtitleStatus ? 'Japanese subtitles unavailable' : '—'}</Text>}
        </ScrollView>
      </View>}
    </View>
    <FloatingGlass dark={dark} style={[s.dock, { bottom: Math.max(insets.bottom, 12) }]}><View style={s.dockRow}><Button quiet onPress={() => { if (panel) router.setParams({ panel: undefined }); else browse(topicUrl(topics.find(t => t.label === topic)?.query || topics[0].query)); }}>{panel && watching ? 'Watch & read' : 'Browse'}</Button><Button quiet onPress={() => { browser.current?.command('pause'); setLibrary(true); }}>{`Words · ${saved.length}`}</Button><Button quiet onPress={() => { browser.current?.command('pause'); setSettings(true); }}>Settings</Button></View></FloatingGlass>
    <Modal visible={!!lookup} transparent animationType="slide" onRequestClose={closeLookup}><View style={s.overlay}><Pressable accessibilityRole="button" accessibilityLabel="Close dictionary" style={StyleSheet.absoluteFill} onPress={closeLookup} /><View style={s.sheet}><View {...dismissGesture.panHandlers} style={s.row}><Text style={s.eyebrow}>JMdict · JAPANESE → ENGLISH</Text><Button onPress={closeLookup}>Close</Button></View><Text style={s.lookupWord}>{lookup?.token.text}</Text>{lookup && <View style={s.row}><Button onPress={() => setKnowledge(old => ({ ...old, [lookup.token.lemma]: true }))}>{knowledge[lookup.token.lemma] === true ? "✓ Known" : "Mark known"}</Button><Button onPress={() => setKnowledge(old => ({ ...old, [lookup.token.lemma]: false }))}>Mark unknown</Button></View>}<Text style={s.reading}>{lookup?.token.reading} · {lookup?.token.pos}</Text>{lookup?.token.lemma !== lookup?.token.text && <Text style={s.hint}>Dictionary form: {lookup?.token.lemma}</Text>}{!!lookup?.token.grammar.length && <Text style={s.grammar}>{lookup.token.grammar.join(' · ')}</Text>}<ScrollView style={{ maxHeight: 230 }}>{loading && <ActivityIndicator color={dark ? "#B4DEC4" : "#344C3F"} />}{!!dictionaryError && <Text style={s.hint}>{dictionaryError}</Text>}{!loading && !dictionaryError && !entries.length && <Text style={s.hint}>No JMdict entry for this form. Grammar labels above are rule-based and may be incomplete.</Text>}{entries.map((entry, index) => <View key={`${entry.slug}:${index}`} style={s.entry}><Text style={s.reading}>{entry.japanese.map(j => `${j.word || ''} ${j.reading || ''}`).join(' · ')}</Text><Text style={s.meaning}>{entry.senses.slice(0, 2).map(sense => sense.english_definitions.join('; ')).join('\n')}</Text><Button onPress={() => save(entry)}>{!storageReady ? 'Library unavailable' : saved.some(w => w.key === `${entry.slug}:${entry.japanese[0].reading ?? ''}`) ? '✓ Saved' : 'Save word + context'}</Button></View>)}</ScrollView><Text numberOfLines={2} style={s.sentence}>{lookup?.caption.text}</Text><Button onPress={closeLookup}>Done →</Button></View></View></Modal>
    {settings && <SafeAreaView edges={['top', 'left', 'right']} style={[s.safe, s.panelScreen]}><View style={s.header}><Text style={s.brand}>Settings.</Text></View><ScrollView contentContainerStyle={{ padding: 24, paddingBottom: 150 }}><Text style={s.hint}>Immersed {history[0].version}</Text><Text style={s.emptyTitle}>Completed Japanese level</Text><View style={s.levels}>{([5,4,3,2,1] as JlptLevel[]).map(n => <Pressable key={n} accessibilityRole="radio" aria-checked={level === n} accessibilityState={{ checked: level === n }} accessibilityLabel={`Completed N${n}`} onPress={() => setLevel(n)} style={[s.topic, level === n && s.activeTopic]}><Text style={s.topicText}>N{n}</Text></Pressable>)}</View><Text style={s.hint}>Words through this level appear normally. More advanced listed words are highlighted. Levels are estimates; unlisted words stay neutral. Mark individual words known or unknown in the dictionary.</Text><Text style={[s.emptyTitle,{marginTop:20}]}>Viewing</Text><Button onPress={() => { void Linking.openURL('https://m.youtube.com/').catch(() => setError('Could not open Safari.')); }}>YouTube / Google sign-in ↗</Button><Text style={s.hint}>Google sign-in opens in your browser or the YouTube app. Its login is not shared with this player. Locked-screen audio is not supported in this Expo Go preview.</Text>{!!subtitleStatus && <View><Text style={s.emptyTitle}>Subtitles</Text><Text style={s.hint}>{subtitleStatus}</Text></View>}<Text style={s.emptyTitle}>Dictionary</Text><Text style={s.meaning}>JMdict · Japanese → English</Text><Text style={s.hint}>Installed on the preview server. No dictionary account or manual import needed. Word lookup uses the dictionary form, including for conjugated verbs.</Text>{[['AMOLED dark mode', 'Pure black backgrounds', dark, setDark], ['Hide Shorts', 'Hide Shorts shelves and block Shorts links', hideShorts, setHideShorts], ['Smart word groups', 'Keep inflections and common grammar together', grouped, setGrouped], ['Furigana', 'Readings above kanji words', readings, setReadings]].map(([label, detail, value, setter]) => <View key={label as string} style={s.setting}><View style={{ flex: 1 }}><Text style={s.emptyTitle}>{label as string}</Text><Text style={s.hint}>{detail as string}</Text></View><Switch accessibilityLabel={label as string} value={value as boolean} onValueChange={setter as (value: boolean) => void} trackColor={{ true: '#344C3F' }} /></View>)}<Text style={[s.emptyTitle, { marginTop: 24 }]}>Version history</Text>{history.map(release => <View key={release.version} style={s.entry}><Text style={s.meaning}>{release.version} · {release.date}</Text><Text style={s.reading}>{release.title}</Text>{release.notes.map(note => <Text key={note} style={s.hint}>• {note}</Text>)}</View>)}<Text style={s.attribution}>JLPT level estimates: OpenJLPT / Jonathan Waller / EDRDG, CC BY-SA 4.0. JMdict © EDRDG, CC BY-SA 4.0. Kuromoji © Atilika, Apache-2.0, with IPADIC/NAIST notices. Grammar groups are heuristic, not complete sentence explanations. Speech recognition uses self-hosted faster-whisper (Whisper base); accuracy and preparation time vary. This cloud preview currently cannot access YouTube audio, so generated subtitles may be unavailable. https://www.edrdg.org/edrdg/licence.html</Text></ScrollView></SafeAreaView>}
    {library && <SafeAreaView edges={['top', 'left', 'right']} style={[s.safe, s.panelScreen]}><View style={s.header}><Text style={s.brand}>Your words.</Text></View><ScrollView contentContainerStyle={{ padding: 22, paddingBottom: 150 }}>{!saved.length && <Text style={s.hint}>Your saved words and their original video context will appear here.</Text>}{!!storageError && <Text style={s.hint}>{storageError}</Text>}{saved.map(word => <View key={word.key} style={s.entry}><Text style={s.lookupWord}>{word.word}</Text><Text style={s.reading}>{word.reading}</Text><Text style={s.meaning}>{word.meaning}</Text><Text style={s.sentence}>{word.sentence}</Text><Text style={s.hint}>{word.title}</Text><View style={s.row}><Button onPress={() => { const link = youtubeUrl(word.url); if (link) { setLibrary(false); browse(`${link}&t=${Math.floor(word.time)}s`); } }}>Watch context ↗</Button><Button onPress={() => setSaved(old => old.filter(w => w.key !== word.key))}>Remove</Button></View></View>)}<Text style={s.attribution}>JMdict/EDRDG data: CC BY-SA 4.0, https://www.edrdg.org/edrdg/licence.html. Caption text and selected words are processed on this preview’s cloud server. Topic searches do not guarantee Japanese-only results. Earlier sample vocabulary remains stored separately.</Text></ScrollView></SafeAreaView>}
  </SafeAreaView></DarkContext.Provider>;
}
function createStyles(dark: boolean) {
  const bg = dark ? '#000000' : '#F7F5EF', ink = dark ? '#F3F3F3' : '#242D28', muted = dark ? '#AAAAAA' : '#70776E', panel = dark ? '#171717' : '#E8EBE1', accent = dark ? '#B4DEC4' : '#344C3F';
  return StyleSheet.create({
  contentSurface: { flex: 1, minHeight: 0 }, watchVideo: { flex: 1, minHeight: 0, backgroundColor: '#000' }, panelScreen: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, zIndex: 20 }, captionEmpty: { color: muted, fontSize: 18, minHeight: 38 },
  dock: { position: 'absolute', left: 14, right: 14, zIndex: 50, borderRadius: 34, overflow: 'hidden', borderWidth: 1, borderColor: dark ? '#ffffff25' : '#00000015' }, dockRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-evenly', padding: 9 }, levels: { flexDirection: 'row', gap: 8, marginVertical: 14 }, unknown: { color: dark ? '#FFD077' : '#8B4800', backgroundColor: dark ? '#332613' : '#F8E5C0', textDecorationLine: 'underline' },
  safe: { flex: 1, backgroundColor: bg }, header: { paddingHorizontal: 14, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }, brand: { color: ink, fontSize: 28, fontWeight: '800', letterSpacing: -1.5 }, button: { backgroundColor: panel, paddingVertical: 12, paddingHorizontal: 13, borderRadius: 12 }, buttonText: { color: accent, fontWeight: '600', fontSize: 12 }, search: { paddingHorizontal: 16, flexDirection: 'row', gap: 8, marginBottom: 10 }, input: { flex: 1, minWidth: 0, color: ink, backgroundColor: bg, borderWidth: 1, borderColor: dark ? '#2A2A2A' : '#DFE2D9', borderRadius: 12, padding: 10, fontSize: 13 }, topics: { paddingHorizontal: 16, gap: 8, paddingBottom: 12 }, topic: { paddingVertical: 10, paddingHorizontal: 15, borderRadius: 24, backgroundColor: panel }, activeTopic: { backgroundColor: dark ? '#294134' : '#DCE4D8' }, topicText: { color: accent, fontSize: 12, fontWeight: '600' },
  browser: { flex: 1, minHeight: 240, backgroundColor: bg }, study: { flexShrink: 0, backgroundColor: bg, borderTopWidth: 1, borderTopColor: dark ? '#2A2A2A' : '#DFE2D9', paddingHorizontal: 18, paddingTop: 16 }, row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 }, eyebrow: { color: muted, fontSize: 10, fontWeight: '700', letterSpacing: 1 }, badge: { color: '#BD512E', fontSize: 10 }, captionScroll: { flex: 1, minHeight: 0 }, tokens: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-end' }, token: { minHeight: 48, paddingHorizontal: 3, justifyContent: 'flex-end', paddingVertical: 6 }, furigana: { color: muted, fontSize: 12, textAlign: 'center', marginBottom: 2 }, japanese: { color: ink, fontSize: 25, lineHeight: 37 }, tappable: { textDecorationLine: 'underline', textDecorationColor: '#BCC8B5' }, emptyTitle: { color: ink, fontSize: 16, fontWeight: '600', marginBottom: 8 }, hint: { color: muted, fontSize: 12, lineHeight: 19 }, error: { padding: 12, backgroundColor: dark ? '#241F1B' : '#F4E3D9', gap: 8 },
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: '#18261D77' }, sheet: { backgroundColor: bg, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 38 }, lookupWord: { color: ink, fontSize: 31, marginTop: 12, marginBottom: 10 }, entry: { borderBottomColor: dark ? '#2A2A2A' : '#DFE2D9', borderBottomWidth: 1, paddingBottom: 18, marginBottom: 18, gap: 10 }, reading: { color: accent, fontSize: 15, lineHeight: 23 }, meaning: { color: ink, fontSize: 17, lineHeight: 25 }, sentence: { color: accent, fontSize: 16, lineHeight: 25, marginVertical: 14 }, grammar: { color: '#95603A', fontSize: 14, marginVertical: 10 }, setting: { flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: 1, borderBottomColor: dark ? '#2A2A2A' : '#DFE2D9', paddingVertical: 20 }, attribution: { color: muted, fontSize: 11, lineHeight: 18, marginVertical: 20 },
});
}
const darkStyles = createStyles(true);
const lightStyles = createStyles(false);
