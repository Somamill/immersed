import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Keyboard, Linking, Modal, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import { StatusBar } from 'expo-status-bar';
import AsyncStorage from '@react-native-async-storage/async-storage';
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
function Button({ children, onPress }: { children: string; onPress: () => void }) {
  const s = useContext(DarkContext) ? darkStyles : lightStyles;
  return <Pressable accessibilityRole="button" onPress={onPress} style={s.button}><Text style={s.buttonText}>{children}</Text></Pressable>;
}
export default function App() {
  const browser = useRef<BrowserHandle>(null);
  const { width, height } = useWindowDimensions();
  const [dark, setDark] = useState(true);
  const [hideShorts, setHideShorts] = useState(true);
  const [tall, setTall] = useState(false);
  const [level, setLevel] = useState<JlptLevel>(5);
  const [knowledge, setKnowledge] = useState<Record<string, boolean>>({});
  const s = dark ? darkStyles : lightStyles;
  const [uri, setUri] = useState(topicUrl(topics[0].query));
  const [browserVersion, setBrowserVersion] = useState(0);
  const [pageUrl, setPageUrl] = useState('');
  const [topic, setTopic] = useState('Daily life');
  const [input, setInput] = useState('');
  const [nativeCaption, setNativeCaption] = useState<Caption | null>(null);
  const [clock, setClock] = useState({ time: 0, paused: true });
  const [generated, setGenerated] = useState<GeneratedCue[]>([]);
  const [subtitleStatus, setSubtitleStatus] = useState('');
  const [subtitleCanRetry, setSubtitleCanRetry] = useState(false);
  const [subtitleAttempt, setSubtitleAttempt] = useState(0);
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
  const [library, setLibrary] = useState(false);
  const [settings, setSettings] = useState(false);
  const [grouped, setGrouped] = useState(true);
  const [readings, setReadings] = useState(true);
  const [automatic, setAutomatic] = useState(true);
  const [preferencesReady, setPreferencesReady] = useState(false);
  const [storageReady, setStorageReady] = useState(false);
  const [storageError, setStorageError] = useState('');
  const seenSourceCaption = useRef(false);
  const lookupPlayback = useRef<{ resume: boolean; videoId: string | null }>({ resume: false, videoId: null });
  const [sourceTranscript, setSourceTranscript] = useState<{ videoId: string; cues: GeneratedCue[] } | null>(null);
  const canonical = youtubeUrl(pageUrl);
  const videoId = canonical ? new URL(canonical).searchParams.get('v') : null;
  const watching = !!videoId;
  const sourceCue = sourceTranscript?.videoId === videoId ? sourceTranscript.cues.find(cue => cue.start <= clock.time && cue.end > clock.time) : undefined;
  const generatedCue = generated.find(cue => cue.start <= clock.time && cue.end > clock.time);
  const hasSourceCaption = !!(nativeCaption?.text && nativeCaption.japanese);
  const timelineCue = sourceCue || generatedCue;
  const caption: Caption | null = hasSourceCaption ? nativeCaption : timelineCue ? { text: timelineCue.text, tokens: [], time: timelineCue.start, title: nativeCaption?.title || 'YouTube video', url: pageUrl, japanese: true, paused: clock.paused } : null;
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
      setDark(prefs.dark); setHideShorts(prefs.hideShorts); setTall(prefs.tall); setLevel(prefs.level); setKnowledge(prefs.knowledge);
      setGrouped(prefs.grouped); setReadings(prefs.readings); setAutomatic(prefs.automatic);
    }).catch(() => {}).finally(() => setPreferencesReady(true));
  }, []);
  useEffect(() => { if (preferencesReady) void AsyncStorage.setItem('immersed.preferences.v1', JSON.stringify({ schema: PREFERENCES_SCHEMA, grouped, readings, automatic, dark, hideShorts, tall, level, knowledge })).catch(() => setStorageError('Could not save settings on this device.')); }, [grouped, readings, automatic, preferencesReady, dark, hideShorts, tall, level, knowledge]);
  useEffect(() => { if (storageReady) void AsyncStorage.setItem(STORAGE, JSON.stringify(saved)).catch(() => setStorageError('Could not store your changes on this device.')); }, [saved, storageReady]);
  useEffect(() => { if (nativeCaption?.text && nativeCaption.japanese) seenSourceCaption.current = true; }, [nativeCaption]);
  useEffect(() => { if (sourceTranscript?.videoId === videoId && sourceTranscript.cues.length) seenSourceCaption.current = true; }, [sourceTranscript, videoId]);
  useEffect(() => {
    if (!videoId || !automatic || !preferencesReady) return;
    let active = true;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      if (!active || seenSourceCaption.current) { if (active) setSubtitleStatus(''); return; }
      try {
        const result = await languageRequest<Transcription>('transcribe', { videoId, retry: String(subtitleAttempt > 0) }, controller.signal);
        if (!active) return;
        if (result.status === 'ready') { setGenerated(result.cues || []); setSubtitleStatus('Generated Japanese captions'); }
        else if (result.status === 'processing' || result.status === 'busy') { setSubtitleStatus(result.message || 'Preparing subtitles…'); timer = setTimeout(poll, 1000); }
        else { setSubtitleStatus(result.message || 'Automatic captions are unavailable for this video.'); setSubtitleCanRetry(!!result.canRetry); }
      } catch { if (active) { setSubtitleStatus('The subtitle service is unavailable. Existing Japanese captions can still be used.'); setSubtitleCanRetry(true); } }
    };
    timer = setTimeout(poll, subtitleAttempt > 0 ? 0 : 4000);
    return () => { active = false; clearTimeout(timer); controller.abort(); };
  }, [videoId, automatic, preferencesReady, subtitleAttempt]);
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
    if (id !== pageVideo.current) { pageVideo.current = id; seenSourceCaption.current = false; setSubtitleAttempt(0); setSubtitleStatus(''); setSubtitleCanRetry(false); setGenerated([]); setNativeCaption(null); setClock({ time: 0, paused: true }); setLookup(null); lookupPlayback.current = { resume: false, videoId: null }; }
    setPageUrl(url);
  };
  const browse = (url: string) => { Keyboard.dismiss(); setError(''); setNativeCaption(null); setLookup(null); handlePage(''); setUri(url); setBrowserVersion(v => v + 1); };
  const openInput = () => {
    const text = input.trim(); if (!text) return;
    if (hideShorts && /^https?:/i.test(text)) { try { if (new URL(text).pathname.startsWith('/shorts/')) { setError('Shorts are hidden. Enable them in Settings to open this link.'); return; } } catch {} }
    const video = youtubeUrl(text);
    if (/^https?:/i.test(text) && !video) { setError('Use a YouTube video link, or type a topic to search.'); return; }
    setTopic('Search'); browse(video || topicUrl(`${text} -日本語学習 -JLPT`));
  };
  const tapWord = (token: AnalyzedToken) => { if (caption) { lookupPlayback.current = { resume: !caption.paused, videoId }; browser.current?.command('pause'); setLookup({ token, caption }); } };
  const closeLookup = () => {
    const { resume, videoId: openedVideo } = lookupPlayback.current;
    lookupPlayback.current = { resume: false, videoId: null };
    setLookup(null);
    if (resume && openedVideo === videoId) browser.current?.command('play');
  };
  const save = (entry: DictionaryEntry) => {
    if (!lookup || !storageReady) return;
    const japanese = entry.japanese[0]; const key = `${entry.slug}:${japanese.reading ?? ''}`;
    if (saved.some(w => w.key === key)) return;
    setSaved(old => [{ key, word: japanese.word || lookup.token.lemma, reading: japanese.reading || '', meaning: entry.senses[0].english_definitions.join('; '), sentence: lookup.caption.text, title: lookup.caption.title, url: lookup.caption.url, time: lookup.caption.time }, ...old]);
  };
  return <DarkContext.Provider value={dark}><SafeAreaProvider><SafeAreaView style={s.safe}><StatusBar style={dark ? "light" : "dark"} />
    {!watching && <View style={s.header}><Text style={s.brand}>immersed.</Text><Text style={s.hint}>日本語 · N{level}</Text></View>}
    {!watching && <><View style={s.search}><TextInput accessibilityLabel="Search Japanese topics or paste a YouTube link" placeholder="Search a topic or paste a YouTube link" placeholderTextColor={dark ? "#999" : "#70776E"} value={input} onChangeText={setInput} onSubmitEditing={openInput} returnKeyType="search" autoCapitalize="none" style={s.input} /><Button onPress={openInput}>Go</Button></View><View><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.topics}>{topics.map(item => <Pressable accessibilityRole="button" key={item.label} onPress={() => { setTopic(item.label); browse(topicUrl(item.query)); }} style={[s.topic, topic === item.label && s.activeTopic]}><Text style={s.topicText}>{item.label}</Text></Pressable>)}</ScrollView></View></>}
    {!!error && <View style={s.error}><Text style={s.hint}>{error}</Text><Button onPress={() => { setError(''); browser.current?.reload(); }}>Refresh</Button></View>}
    <View style={watching ? { height: tall ? Math.min(height * 0.56, width * 16 / 9) : Math.max(210, width * 9 / 16), backgroundColor: '#000' } : s.browser}><YouTubeBrowser key={browserVersion} ref={browser} uri={uri} dark={dark} hideShorts={hideShorts} onCaption={setNativeCaption} onPage={handlePage} onTranscript={(cues, id) => { seenSourceCaption.current = true; setSourceTranscript({ videoId: id, cues }); setSubtitleStatus(''); setSubtitleCanRetry(false); }} onClock={(time, paused) => setClock({ time, paused })} onError={setError} /></View>
    {watching && <View style={[s.study, s.focusStudy]}><View style={s.row}><Text style={s.eyebrow}>{generatedCue && !hasSourceCaption && !sourceCue ? 'GENERATED JAPANESE' : 'JAPANESE SUBTITLES'}</Text><Text style={s.badge}>{grouped ? 'Words & grammar' : 'Morphemes'}</Text></View>
      <ScrollView style={s.captionScroll} contentContainerStyle={{ paddingVertical: 12 }}>
        {sentence ? <>{tokens.length ? <View style={s.tokens}>{tokens.map((token, i) => <Pressable key={`${sentence}:${i}`} accessibilityRole={token.word ? 'button' : undefined} accessibilityLabel={token.word ? `Look up ${token.text}` : token.text} disabled={!token.word} onPress={() => tapWord(token)} style={s.token}>{readings && /[一-龯]/.test(token.text) && !!token.reading && <Text style={s.furigana}>{token.reading}</Text>}<Text style={[s.japanese, token.word && familiarity(token.lemma, token.reading, level, knowledge) === 'unknown' && s.unknown]}>{token.text}</Text></Pressable>)}{!!unparsedTail && <Text style={s.japanese}>{unparsedTail}</Text>}</View> : <Text style={s.japanese}>{sentence}</Text>}{!!analysisError && <Text style={s.hint}>{analysisError}</Text>}</> : null}
      </ScrollView>
      {!!sentence && <View style={s.row}><Text style={s.hint}>Tap a word for meaning & grammar</Text><Button onPress={() => browser.current?.command('replay', caption?.time)}>Replay line</Button></View>}
    </View>}
    <BlurView intensity={45} tint={dark ? "dark" : "light"} style={s.dock}><Button onPress={() => browse(topicUrl(topics.find(t => t.label === topic)?.query || topics[0].query))}>Browse</Button>{watching && <Button onPress={() => setTall(v => !v)}>{tall ? 'Wide' : 'Tall'}</Button>}<Button onPress={() => { browser.current?.command('pause'); setLibrary(true); }}>{`Words · ${saved.length}`}</Button><Button onPress={() => { browser.current?.command('pause'); setSettings(true); }}>Settings</Button></BlurView>
    <Modal visible={!!lookup} transparent animationType="slide" onRequestClose={closeLookup}><View style={s.overlay}><Pressable accessibilityRole="button" accessibilityLabel="Close dictionary" style={StyleSheet.absoluteFill} onPress={closeLookup} /><View style={s.sheet}><View style={s.row}><Text style={s.eyebrow}>JMdict · JAPANESE → ENGLISH</Text><Button onPress={closeLookup}>Close</Button></View><Text style={s.lookupWord}>{lookup?.token.text}</Text>{lookup && <View style={s.row}><Button onPress={() => setKnowledge(old => ({ ...old, [lookup.token.lemma]: true }))}>{knowledge[lookup.token.lemma] === true ? "✓ Known" : "Mark known"}</Button><Button onPress={() => setKnowledge(old => ({ ...old, [lookup.token.lemma]: false }))}>Mark unknown</Button></View>}<Text style={s.reading}>{lookup?.token.reading} · {lookup?.token.pos}</Text>{lookup?.token.lemma !== lookup?.token.text && <Text style={s.hint}>Dictionary form: {lookup?.token.lemma}</Text>}{!!lookup?.token.grammar.length && <Text style={s.grammar}>{lookup.token.grammar.join(' · ')}</Text>}<ScrollView style={{ maxHeight: 230 }}>{loading && <ActivityIndicator color={dark ? "#B4DEC4" : "#344C3F"} />}{!!dictionaryError && <Text style={s.hint}>{dictionaryError}</Text>}{!loading && !dictionaryError && !entries.length && <Text style={s.hint}>No JMdict entry for this form. Grammar labels above are rule-based and may be incomplete.</Text>}{entries.map((entry, index) => <View key={`${entry.slug}:${index}`} style={s.entry}><Text style={s.reading}>{entry.japanese.map(j => `${j.word || ''} ${j.reading || ''}`).join(' · ')}</Text><Text style={s.meaning}>{entry.senses.slice(0, 2).map(sense => sense.english_definitions.join('; ')).join('\n')}</Text><Button onPress={() => save(entry)}>{!storageReady ? 'Library unavailable' : saved.some(w => w.key === `${entry.slug}:${entry.japanese[0].reading ?? ''}`) ? '✓ Saved' : 'Save word + context'}</Button></View>)}</ScrollView><Text numberOfLines={2} style={s.sentence}>{lookup?.caption.text}</Text><Button onPress={closeLookup}>Done →</Button></View></View></Modal>
    <Modal visible={settings} animationType="slide" onRequestClose={() => setSettings(false)}><SafeAreaView style={s.safe}><View style={s.header}><Text style={s.brand}>Settings.</Text></View><ScrollView contentContainerStyle={{ padding: 24 }}><Text style={s.hint}>Immersed {history[0].version}</Text><Text style={s.emptyTitle}>Completed Japanese level</Text><View style={s.levels}>{([5,4,3,2,1] as JlptLevel[]).map(n => <Pressable key={n} accessibilityRole="radio" aria-checked={level === n} accessibilityState={{ checked: level === n }} accessibilityLabel={`Completed N${n}`} onPress={() => setLevel(n)} style={[s.topic, level === n && s.activeTopic]}><Text style={s.topicText}>N{n}</Text></Pressable>)}</View><Text style={s.hint}>Words through this level appear normally. More advanced listed words are highlighted. Levels are estimates; unlisted words stay neutral. Mark individual words known or unknown in the dictionary.</Text><Text style={[s.emptyTitle,{marginTop:20}]}>Viewing</Text><Button onPress={() => { void Linking.openURL('https://m.youtube.com/').catch(() => setError('Could not open Safari.')); }}>YouTube / Google sign-in ↗</Button><Text style={s.hint}>Google sign-in opens in your browser or the YouTube app. Its login is not shared with this player. Locked-screen audio is not supported in this Expo Go preview.</Text><Button onPress={() => { browser.current?.command('restore'); setSettings(false); }}>Restore original player layout</Button>{subtitleStatus && subtitleCanRetry ? <View><Text style={s.hint}>{subtitleStatus}</Text><Button onPress={() => setSubtitleAttempt(n => n + 1)}>Retry subtitles</Button></View> : null}<Text style={s.emptyTitle}>Dictionary</Text><Text style={s.meaning}>JMdict · Japanese → English</Text><Text style={s.hint}>Installed on the preview server. No dictionary account or manual import needed. Word lookup uses the dictionary form, including for conjugated verbs.</Text>{[['AMOLED dark mode', 'Pure black backgrounds', dark, setDark], ['Hide Shorts', 'Hide Shorts shelves and block Shorts links', hideShorts, setHideShorts], ['Tall player', 'More space for portrait video; word lookup stays available', tall, setTall], ['Smart word groups', 'Keep inflections and common grammar together', grouped, setGrouped], ['Furigana', 'Readings above kanji words', readings, setReadings], ['Automatic subtitles', 'Try speech recognition when captions are missing', automatic, setAutomatic]].map(([label, detail, value, setter]) => <View key={label as string} style={s.setting}><View style={{ flex: 1 }}><Text style={s.emptyTitle}>{label as string}</Text><Text style={s.hint}>{detail as string}</Text></View><Switch accessibilityLabel={label as string} value={value as boolean} onValueChange={setter as (value: boolean) => void} trackColor={{ true: '#344C3F' }} /></View>)}<Text style={[s.emptyTitle, { marginTop: 24 }]}>Version history</Text>{history.map(release => <View key={release.version} style={s.entry}><Text style={s.meaning}>{release.version} · {release.date}</Text><Text style={s.reading}>{release.title}</Text>{release.notes.map(note => <Text key={note} style={s.hint}>• {note}</Text>)}</View>)}<Text style={s.attribution}>JLPT level estimates: OpenJLPT / Jonathan Waller / EDRDG, CC BY-SA 4.0. JMdict © EDRDG, CC BY-SA 4.0. Kuromoji © Atilika, Apache-2.0, with IPADIC/NAIST notices. Grammar groups are heuristic, not complete sentence explanations. Speech recognition uses self-hosted faster-whisper (Whisper base); accuracy and preparation time vary. This cloud preview currently cannot access YouTube audio, so generated subtitles may be unavailable. https://www.edrdg.org/edrdg/licence.html</Text></ScrollView><View style={s.modalDock}><Button onPress={() => setSettings(false)}>Back to video</Button></View></SafeAreaView></Modal>
    <Modal visible={library} animationType="slide" onRequestClose={() => setLibrary(false)}><SafeAreaView style={s.safe}><View style={s.header}><Text style={s.brand}>Your words.</Text></View><ScrollView contentContainerStyle={{ padding: 22 }}>{!saved.length && <Text style={s.hint}>Your saved words and their original video context will appear here.</Text>}{!!storageError && <Text style={s.hint}>{storageError}</Text>}{saved.map(word => <View key={word.key} style={s.entry}><Text style={s.lookupWord}>{word.word}</Text><Text style={s.reading}>{word.reading}</Text><Text style={s.meaning}>{word.meaning}</Text><Text style={s.sentence}>{word.sentence}</Text><Text style={s.hint}>{word.title}</Text><View style={s.row}><Button onPress={() => { const link = youtubeUrl(word.url); if (link) { setLibrary(false); browse(`${link}&t=${Math.floor(word.time)}s`); } }}>Watch context ↗</Button><Button onPress={() => setSaved(old => old.filter(w => w.key !== word.key))}>Remove</Button></View></View>)}<Text style={s.attribution}>JMdict/EDRDG data: CC BY-SA 4.0, https://www.edrdg.org/edrdg/licence.html. Caption text and selected words are processed on this preview’s cloud server. Topic searches do not guarantee Japanese-only results. Earlier sample vocabulary remains stored separately.</Text></ScrollView><View style={s.modalDock}><Button onPress={() => setLibrary(false)}>Back to YouTube</Button></View></SafeAreaView></Modal>
  </SafeAreaView></SafeAreaProvider></DarkContext.Provider>;
}
function createStyles(dark: boolean) {
  const bg = dark ? '#000000' : '#F7F5EF', ink = dark ? '#F3F3F3' : '#242D28', muted = dark ? '#AAAAAA' : '#70776E', panel = dark ? '#171717' : '#E8EBE1', accent = dark ? '#B4DEC4' : '#344C3F';
  return StyleSheet.create({
  modalDock: { padding: 14, backgroundColor: bg },
  dock: { flexDirection: 'row', alignSelf: 'center', alignItems: 'center', gap: 5, padding: 8, margin: 10, borderRadius: 32, overflow: 'hidden', borderWidth: 1, borderColor: dark ? '#3B3B3B' : '#CDD4CE', backgroundColor: dark ? 'rgba(24,24,24,0.72)' : 'rgba(237,241,235,0.72)' }, levels: { flexDirection: 'row', gap: 8, marginVertical: 14 }, unknown: { color: dark ? '#FFD077' : '#8B4800', backgroundColor: dark ? '#332613' : '#F8E5C0', textDecorationLine: 'underline' },
  safe: { flex: 1, backgroundColor: bg }, header: { paddingHorizontal: 14, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }, brand: { color: ink, fontSize: 28, fontWeight: '800', letterSpacing: -1.5 }, button: { backgroundColor: panel, paddingVertical: 12, paddingHorizontal: 13, borderRadius: 12 }, buttonText: { color: accent, fontWeight: '600', fontSize: 12 }, search: { paddingHorizontal: 16, flexDirection: 'row', gap: 8, marginBottom: 10 }, input: { flex: 1, minWidth: 0, color: ink, backgroundColor: bg, borderWidth: 1, borderColor: dark ? '#2A2A2A' : '#DFE2D9', borderRadius: 12, padding: 10, fontSize: 13 }, topics: { paddingHorizontal: 16, gap: 8, paddingBottom: 12 }, topic: { paddingVertical: 10, paddingHorizontal: 15, borderRadius: 24, backgroundColor: panel }, activeTopic: { backgroundColor: dark ? '#294134' : '#DCE4D8' }, topicText: { color: accent, fontSize: 12, fontWeight: '600' },
  browser: { flex: 1, minHeight: 240, backgroundColor: bg }, study: { borderTopWidth: 1, borderTopColor: dark ? '#2A2A2A' : '#DFE2D9', paddingHorizontal: 18, paddingTop: 12, paddingBottom: 10, minHeight: 145, maxHeight: 210 }, focusStudy: { flex: 1, maxHeight: undefined }, row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 }, eyebrow: { color: muted, fontSize: 10, fontWeight: '700', letterSpacing: 1 }, badge: { color: '#BD512E', fontSize: 10 }, captionScroll: { flexGrow: 0 }, tokens: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-end' }, token: { minHeight: 48, paddingHorizontal: 3, justifyContent: 'flex-end', paddingVertical: 6 }, furigana: { color: muted, fontSize: 12, textAlign: 'center', marginBottom: 2 }, japanese: { color: ink, fontSize: 25, lineHeight: 37 }, tappable: { textDecorationLine: 'underline', textDecorationColor: '#BCC8B5' }, emptyTitle: { color: ink, fontSize: 16, fontWeight: '600', marginBottom: 8 }, hint: { color: muted, fontSize: 12, lineHeight: 19 }, error: { padding: 12, backgroundColor: '#F4E3D9', gap: 8 },
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: '#18261D77' }, sheet: { backgroundColor: bg, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 38 }, lookupWord: { color: ink, fontSize: 31, marginTop: 12, marginBottom: 10 }, entry: { borderBottomColor: dark ? '#2A2A2A' : '#DFE2D9', borderBottomWidth: 1, paddingBottom: 18, marginBottom: 18, gap: 10 }, reading: { color: accent, fontSize: 15, lineHeight: 23 }, meaning: { color: ink, fontSize: 17, lineHeight: 25 }, sentence: { color: accent, fontSize: 16, lineHeight: 25, marginVertical: 14 }, grammar: { color: '#95603A', fontSize: 14, marginVertical: 10 }, setting: { flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: 1, borderBottomColor: dark ? '#2A2A2A' : '#DFE2D9', paddingVertical: 20 }, attribution: { color: muted, fontSize: 11, lineHeight: 18, marginVertical: 20 },
});
}
const darkStyles = createStyles(true);
const lightStyles = createStyles(false);
