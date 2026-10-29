import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Keyboard, Modal, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import AsyncStorage from '@react-native-async-storage/async-storage';
import YouTubeBrowser, { type BrowserHandle } from './src/components/YouTubeBrowser';
import { topics, topicUrl, youtubeUrl, type Caption, type DictionaryEntry } from './src/youtube';
import { languageRequest, type AnalyzedToken, type GeneratedCue, type Transcription } from './src/language';

type Saved = { key: string; word: string; reading: string; meaning: string; sentence: string; title: string; url: string; time: number };
type Lookup = { token: AnalyzedToken; caption: Caption };
const STORAGE = 'immersed.youtube.words.v1';
const dictionaryCache = new Map<string, DictionaryEntry[]>();
const analysisCache = new Map<string, AnalyzedToken[]>();
function Button({ children, onPress }: { children: string; onPress: () => void }) {
  return <Pressable accessibilityRole="button" onPress={onPress} style={s.button}><Text style={s.buttonText}>{children}</Text></Pressable>;
}
export default function App() {
  const browser = useRef<BrowserHandle>(null);
  const { width } = useWindowDimensions();
  const [uri, setUri] = useState(topicUrl(topics[0].query));
  const [browserVersion, setBrowserVersion] = useState(0);
  const [pageUrl, setPageUrl] = useState('');
  const [topic, setTopic] = useState('Daily life');
  const [input, setInput] = useState('');
  const [nativeCaption, setNativeCaption] = useState<Caption | null>(null);
  const [clock, setClock] = useState({ time: 0, paused: true });
  const [generated, setGenerated] = useState<GeneratedCue[]>([]);
  const [subtitleStatus, setSubtitleStatus] = useState('');
  const [error, setError] = useState('');
  const [lookup, setLookup] = useState<Lookup | null>(null);
  const [entries, setEntries] = useState<DictionaryEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [dictionaryError, setDictionaryError] = useState('');
  const [tokens, setTokens] = useState<AnalyzedToken[]>([]);
  const [analysisError, setAnalysisError] = useState('');
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
  const canonical = youtubeUrl(pageUrl);
  const videoId = canonical ? new URL(canonical).searchParams.get('v') : null;
  const watching = !!videoId;
  const generatedCue = generated.find(cue => cue.start <= clock.time && cue.end > clock.time);
  const hasSourceCaption = !!(nativeCaption?.text && nativeCaption.japanese);
  const caption: Caption | null = hasSourceCaption ? nativeCaption : generatedCue ? { text: generatedCue.text, tokens: [], time: generatedCue.start, title: nativeCaption?.title || 'YouTube video', url: pageUrl, japanese: true, paused: clock.paused } : null;
  const sentence = caption?.text || '';
  useEffect(() => {
    AsyncStorage.getItem(STORAGE).then(raw => {
      const data: unknown = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(data) || !data.every(w => typeof w?.key === 'string' && typeof w.word === 'string' && typeof w.sentence === 'string' && typeof w.meaning === 'string')) throw new Error('Invalid library');
      setSaved(data); setStorageReady(true);
    }).catch(() => setStorageError('Could not load saved words. Saving is disabled to protect your library.'));
    AsyncStorage.getItem('immersed.preferences.v1').then(raw => {
      const prefs = raw ? JSON.parse(raw) : {};
      if (typeof prefs.grouped === 'boolean') setGrouped(prefs.grouped);
      if (typeof prefs.readings === 'boolean') setReadings(prefs.readings);
      if (typeof prefs.automatic === 'boolean') setAutomatic(prefs.automatic);
    }).catch(() => {}).finally(() => setPreferencesReady(true));
  }, []);
  useEffect(() => { if (preferencesReady) void AsyncStorage.setItem('immersed.preferences.v1', JSON.stringify({ grouped, readings, automatic })).catch(() => setStorageError('Could not save settings on this device.')); }, [grouped, readings, automatic, preferencesReady]);
  useEffect(() => { if (storageReady) void AsyncStorage.setItem(STORAGE, JSON.stringify(saved)).catch(() => setStorageError('Could not store your changes on this device.')); }, [saved, storageReady]);
  useEffect(() => { seenSourceCaption.current = false; setGenerated([]); setNativeCaption(null); setClock({ time: 0, paused: true }); setLookup(null); }, [videoId]);
  useEffect(() => { if (nativeCaption?.text && nativeCaption.japanese) seenSourceCaption.current = true; }, [nativeCaption]);
  useEffect(() => {
    setSubtitleStatus('');
    if (!videoId || !automatic || !preferencesReady) return;
    let active = true;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      if (!active || seenSourceCaption.current) { if (active) setSubtitleStatus(''); return; }
      try {
        const result = await languageRequest<Transcription>('transcribe', { videoId }, controller.signal);
        if (!active) return;
        if (result.status === 'ready') { setGenerated(result.cues || []); setSubtitleStatus('Generated Japanese captions'); }
        else if (result.status === 'processing' || result.status === 'busy') { setSubtitleStatus(result.message || 'Preparing subtitles…'); timer = setTimeout(poll, 3000); }
        else setSubtitleStatus(result.message || 'Automatic captions are unavailable for this video.');
      } catch { if (active) setSubtitleStatus('Automatic caption service is unavailable. YouTube captions can still be used.'); }
    };
    timer = setTimeout(poll, 8000);
    return () => { active = false; clearTimeout(timer); controller.abort(); };
  }, [videoId, automatic, preferencesReady]);
  useEffect(() => {
    setTokens([]); setAnalysisError('');
    if (!sentence) return;
    const key = `${grouped}:${sentence}`;
    const cached = analysisCache.get(key);
    if (cached) { setTokens(cached); return; }
    let active = true;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    void languageRequest<{ tokens: AnalyzedToken[] }>('analyze', { text: sentence, grouped: String(grouped) }, controller.signal).then(result => {
      if (analysisCache.size >= 300) analysisCache.delete(analysisCache.keys().next().value!);
      analysisCache.set(key, result.tokens);
      if (active) setTokens(result.tokens);
    }).catch(() => { if (active) setAnalysisError('Word analysis is unavailable. The original subtitle is shown below.'); }).finally(() => clearTimeout(timeout));
    return () => { active = false; clearTimeout(timeout); controller.abort(); };
  }, [sentence, grouped]);
  useEffect(() => {
    if (!lookup) return;
    const controller = new AbortController();
    let active = true;
    setEntries([]); setDictionaryError('');
    const key = lookup.token.lemma;
    const cached = dictionaryCache.get(key);
    if (cached) { setEntries(cached); setLoading(false); return; }
    setLoading(true);
    const timer = setTimeout(() => controller.abort(), 12000);
    void languageRequest<{ data: DictionaryEntry[] }>('dictionary', { word: key }, controller.signal).then(result => {
      dictionaryCache.set(key, result.data);
      if (active) setEntries(result.data);
    }).catch(() => { if (active) setDictionaryError('Dictionary unavailable. Check your connection and tap the word again.'); }).finally(() => { clearTimeout(timer); if (active) setLoading(false); });
    return () => { active = false; clearTimeout(timer); controller.abort(); };
  }, [lookup]);
  const browse = (url: string) => { Keyboard.dismiss(); setError(''); setNativeCaption(null); setLookup(null); setPageUrl(''); setUri(url); setBrowserVersion(v => v + 1); };
  const openInput = () => {
    const text = input.trim(); if (!text) return;
    const video = youtubeUrl(text);
    if (/^https?:/i.test(text) && !video) { setError('Use a YouTube video link, or type a topic to search.'); return; }
    setTopic('Search'); browse(video || topicUrl(`${text} 日本語`));
  };
  const tapWord = (token: AnalyzedToken) => { if (caption) { browser.current?.command('pause'); setLookup({ token, caption }); } };
  const save = (entry: DictionaryEntry) => {
    if (!lookup || !storageReady) return;
    const japanese = entry.japanese[0]; const key = `${entry.slug}:${japanese.reading ?? ''}`;
    if (saved.some(w => w.key === key)) return;
    setSaved(old => [{ key, word: japanese.word || lookup.token.lemma, reading: japanese.reading || '', meaning: entry.senses[0].english_definitions.join('; '), sentence: lookup.caption.text, title: lookup.caption.title, url: lookup.caption.url, time: lookup.caption.time }, ...old]);
  };
  return <SafeAreaProvider><SafeAreaView style={s.safe}><StatusBar style="dark" />
    <View style={s.header}>{watching ? <Button onPress={() => browse(topicUrl(topics.find(t => t.label === topic)?.query || topics[0].query))}>← Browse</Button> : <Text style={s.brand}>immersed.</Text>}<View style={s.row}><Button onPress={() => { browser.current?.command('pause'); setSettings(true); }}>Settings</Button><Button onPress={() => { browser.current?.command('pause'); setLibrary(true); }}>{`Words · ${saved.length}`}</Button></View></View>
    {!watching && <><View style={s.search}><TextInput accessibilityLabel="Search Japanese topics or paste a YouTube link" placeholder="Search a topic or paste a YouTube link" value={input} onChangeText={setInput} onSubmitEditing={openInput} returnKeyType="search" autoCapitalize="none" style={s.input} /><Button onPress={openInput}>Go</Button></View><View><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.topics}>{topics.map(item => <Pressable accessibilityRole="button" key={item.label} onPress={() => { setTopic(item.label); browse(topicUrl(item.query)); }} style={[s.topic, topic === item.label && s.activeTopic]}><Text style={s.topicText}>{item.label}</Text></Pressable>)}</ScrollView></View></>}
    {!!error && <View style={s.error}><Text style={s.hint}>{error}</Text><Button onPress={() => { setError(''); browser.current?.reload(); }}>Refresh</Button></View>}
    <View style={watching ? { height: Math.max(210, width * 9 / 16), backgroundColor: '#000' } : s.browser}><YouTubeBrowser key={browserVersion} ref={browser} uri={uri} onCaption={setNativeCaption} onPage={setPageUrl} onClock={(time, paused) => setClock({ time, paused })} onError={setError} /></View>
    <View style={[s.study, watching && s.focusStudy]}><View style={s.row}><Text style={s.eyebrow}>{generatedCue && !hasSourceCaption ? 'GENERATED JAPANESE' : 'JAPANESE SUBTITLES'}</Text><Text style={s.badge}>{grouped ? 'Words & grammar' : 'Morphemes'}</Text></View>
      <ScrollView style={s.captionScroll} contentContainerStyle={{ paddingVertical: 12 }}>
        {sentence ? <>{tokens.length ? <View style={s.tokens}>{tokens.map((token, i) => <Pressable key={`${sentence}:${i}`} accessibilityRole={token.word ? 'button' : undefined} accessibilityLabel={token.word ? `Look up ${token.text}` : token.text} disabled={!token.word} onPress={() => tapWord(token)} style={s.token}>{readings && /[一-龯]/.test(token.text) && !!token.reading && <Text style={s.furigana}>{token.reading}</Text>}<Text style={[s.japanese, token.pos === 'particle' && { color: '#95603A' }, token.word && s.tappable]}>{token.text}</Text></Pressable>)}</View> : <Text style={s.japanese}>{sentence}</Text>}{!!analysisError && <Text style={s.hint}>{analysisError}</Text>}</> : <View><Text style={s.emptyTitle}>{watching ? 'Preparing Japanese subtitles…' : 'Choose something you want to watch.'}</Text><Text style={s.hint}>{watching ? 'Japanese captions are enabled automatically when the player exposes the control. If no captions appear, the app attempts speech recognition.' : 'Browse real Japanese videos by topic. Tap any video to open focused viewing.'}</Text>{!!subtitleStatus && <Text style={[s.hint, { marginTop: 14 }]}>{subtitleStatus}</Text>}</View>}
      </ScrollView>
      {!!sentence && <View style={s.row}><Text style={s.hint}>Tap a word for meaning & grammar</Text><Button onPress={() => browser.current?.command('replay', caption?.time)}>Replay line</Button></View>}
    </View>
    <Modal visible={!!lookup} transparent animationType="slide" onRequestClose={() => setLookup(null)}><View style={s.overlay}><Pressable accessibilityRole="button" accessibilityLabel="Close dictionary" style={StyleSheet.absoluteFill} onPress={() => setLookup(null)} /><View style={s.sheet}><View style={s.row}><Text style={s.eyebrow}>JMdict · JAPANESE → ENGLISH</Text><Button onPress={() => setLookup(null)}>Close</Button></View><Text style={s.lookupWord}>{lookup?.token.text}</Text><Text style={s.reading}>{lookup?.token.reading} · {lookup?.token.pos}</Text>{lookup?.token.lemma !== lookup?.token.text && <Text style={s.hint}>Dictionary form: {lookup?.token.lemma}</Text>}{!!lookup?.token.grammar.length && <Text style={s.grammar}>{lookup.token.grammar.join(' · ')}</Text>}<ScrollView style={{ maxHeight: 230 }}>{loading && <ActivityIndicator color="#344C3F" />}{!!dictionaryError && <Text style={s.hint}>{dictionaryError}</Text>}{!loading && !dictionaryError && !entries.length && <Text style={s.hint}>No JMdict entry for this form. Grammar labels above are rule-based and may be incomplete.</Text>}{entries.map((entry, index) => <View key={`${entry.slug}:${index}`} style={s.entry}><Text style={s.reading}>{entry.japanese.map(j => `${j.word || ''} ${j.reading || ''}`).join(' · ')}</Text><Text style={s.meaning}>{entry.senses.slice(0, 2).map(sense => sense.english_definitions.join('; ')).join('\n')}</Text><Button onPress={() => save(entry)}>{!storageReady ? 'Library unavailable' : saved.some(w => w.key === `${entry.slug}:${entry.japanese[0].reading ?? ''}`) ? '✓ Saved' : 'Save word + context'}</Button></View>)}</ScrollView><Text numberOfLines={2} style={s.sentence}>{lookup?.caption.text}</Text><Button onPress={() => { setLookup(null); browser.current?.command('play'); }}>Resume video →</Button></View></View></Modal>
    <Modal visible={settings} animationType="slide" onRequestClose={() => setSettings(false)}><SafeAreaView style={s.safe}><View style={s.header}><Text style={s.brand}>Settings.</Text><Button onPress={() => setSettings(false)}>Back to video</Button></View><ScrollView contentContainerStyle={{ padding: 24 }}><Text style={s.emptyTitle}>Dictionary</Text><Text style={s.meaning}>JMdict · Japanese → English</Text><Text style={s.hint}>Installed on the preview server. No dictionary account or manual import needed. Word lookup uses the dictionary form, including for conjugated verbs.</Text>{[['Smart word groups', 'Keep inflections and common grammar together', grouped, setGrouped], ['Furigana', 'Readings above kanji words', readings, setReadings], ['Automatic subtitles', 'Try speech recognition when captions are missing', automatic, setAutomatic]].map(([label, detail, value, setter]) => <View key={label as string} style={s.setting}><View style={{ flex: 1 }}><Text style={s.emptyTitle}>{label as string}</Text><Text style={s.hint}>{detail as string}</Text></View><Switch accessibilityLabel={label as string} value={value as boolean} onValueChange={setter as (value: boolean) => void} trackColor={{ true: '#344C3F' }} /></View>)}<Text style={s.attribution}>JMdict © EDRDG, CC BY-SA 4.0. Kuromoji © Atilika, Apache-2.0, with IPADIC/NAIST notices. Grammar groups are heuristic, not complete sentence explanations. Speech recognition uses self-hosted faster-whisper (Whisper base); accuracy and preparation time vary. This cloud preview currently cannot access YouTube audio, so generated subtitles may be unavailable. https://www.edrdg.org/edrdg/licence.html</Text></ScrollView></SafeAreaView></Modal>
    <Modal visible={library} animationType="slide" onRequestClose={() => setLibrary(false)}><SafeAreaView style={s.safe}><View style={s.header}><Text style={s.brand}>Your words.</Text><Button onPress={() => setLibrary(false)}>Back to YouTube</Button></View><ScrollView contentContainerStyle={{ padding: 22 }}>{!saved.length && <Text style={s.hint}>Your saved words and their original video context will appear here.</Text>}{!!storageError && <Text style={s.hint}>{storageError}</Text>}{saved.map(word => <View key={word.key} style={s.entry}><Text style={s.lookupWord}>{word.word}</Text><Text style={s.reading}>{word.reading}</Text><Text style={s.meaning}>{word.meaning}</Text><Text style={s.sentence}>{word.sentence}</Text><Text style={s.hint}>{word.title}</Text><View style={s.row}><Button onPress={() => { const link = youtubeUrl(word.url); if (link) { setLibrary(false); browse(`${link}&t=${Math.floor(word.time)}s`); } }}>Watch context ↗</Button><Button onPress={() => setSaved(old => old.filter(w => w.key !== word.key))}>Remove</Button></View></View>)}<Text style={s.attribution}>JMdict/EDRDG data: CC BY-SA 4.0, https://www.edrdg.org/edrdg/licence.html. Caption text and selected words are processed on this preview's cloud server. Topic searches do not guarantee Japanese-only results. Earlier sample vocabulary remains stored separately.</Text></ScrollView></SafeAreaView></Modal>
  </SafeAreaView></SafeAreaProvider>;
}
const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F7F5EF' }, header: { paddingHorizontal: 14, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }, brand: { color: '#242D28', fontSize: 28, fontWeight: '800', letterSpacing: -1.5 }, button: { backgroundColor: '#E8EBE1', paddingVertical: 12, paddingHorizontal: 13, borderRadius: 12 }, buttonText: { color: '#344C3F', fontWeight: '600', fontSize: 12 }, search: { paddingHorizontal: 16, flexDirection: 'row', gap: 8, marginBottom: 10 }, input: { flex: 1, minWidth: 0, color: '#242D28', backgroundColor: '#FFFDF8', borderWidth: 1, borderColor: '#DFE2D9', borderRadius: 12, padding: 10, fontSize: 13 }, topics: { paddingHorizontal: 16, gap: 8, paddingBottom: 12 }, topic: { paddingVertical: 10, paddingHorizontal: 15, borderRadius: 24, backgroundColor: '#ECEAE3' }, activeTopic: { backgroundColor: '#DCE4D8' }, topicText: { color: '#344C3F', fontSize: 12, fontWeight: '600' },
  browser: { flex: 1, minHeight: 240, backgroundColor: '#FFF' }, study: { borderTopWidth: 1, borderTopColor: '#DFE2D9', paddingHorizontal: 18, paddingTop: 12, paddingBottom: 10, minHeight: 145, maxHeight: 210 }, focusStudy: { flex: 1, maxHeight: undefined }, row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 }, eyebrow: { color: '#70776E', fontSize: 10, fontWeight: '700', letterSpacing: 1 }, badge: { color: '#BD512E', fontSize: 10 }, captionScroll: { flexGrow: 0 }, tokens: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-end' }, token: { minHeight: 48, paddingHorizontal: 3, justifyContent: 'flex-end', paddingVertical: 6 }, furigana: { color: '#70776E', fontSize: 12, textAlign: 'center', marginBottom: 2 }, japanese: { color: '#242D28', fontSize: 25, lineHeight: 37 }, tappable: { textDecorationLine: 'underline', textDecorationColor: '#BCC8B5' }, emptyTitle: { color: '#242D28', fontSize: 16, fontWeight: '600', marginBottom: 8 }, hint: { color: '#70776E', fontSize: 12, lineHeight: 19 }, error: { padding: 12, backgroundColor: '#F4E3D9', gap: 8 },
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: '#18261D77' }, sheet: { backgroundColor: '#F7F5EF', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 38 }, lookupWord: { color: '#242D28', fontSize: 31, marginTop: 12, marginBottom: 10 }, entry: { borderBottomColor: '#DFE2D9', borderBottomWidth: 1, paddingBottom: 18, marginBottom: 18, gap: 10 }, reading: { color: '#344C3F', fontSize: 15, lineHeight: 23 }, meaning: { color: '#242D28', fontSize: 17, lineHeight: 25 }, sentence: { color: '#344C3F', fontSize: 16, lineHeight: 25, marginVertical: 14 }, grammar: { color: '#95603A', fontSize: 14, marginVertical: 10 }, setting: { flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: 1, borderBottomColor: '#DFE2D9', paddingVertical: 20 }, attribution: { color: '#70776E', fontSize: 11, lineHeight: 18, marginVertical: 20 },
});
