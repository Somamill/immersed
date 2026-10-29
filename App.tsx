import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Keyboard, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import AsyncStorage from '@react-native-async-storage/async-storage';
import YouTubeBrowser, { type BrowserHandle } from './src/components/YouTubeBrowser';
import { topics, topicUrl, youtubeUrl, type Caption, type DictionaryEntry } from './src/youtube';

type Saved = { key: string; word: string; reading: string; meaning: string; sentence: string; title: string; url: string; time: number };
type Lookup = { word: string; caption: Caption };
const STORAGE = 'immersed.youtube.words.v1';
const cache = new Map<string, DictionaryEntry[]>();
function Button({ children, onPress }: { children: string; onPress: () => void }) {
  return <Pressable accessibilityRole="button" onPress={onPress} style={s.button}><Text style={s.buttonText}>{children}</Text></Pressable>;
}
export default function App() {
  const browser = useRef<BrowserHandle>(null);
  const [uri, setUri] = useState(topicUrl(topics[0].query));
  const [topic, setTopic] = useState('Daily life');
  const [input, setInput] = useState('');
  const [caption, setCaption] = useState<Caption | null>(null);
  const [error, setError] = useState('');
  const [lookup, setLookup] = useState<Lookup | null>(null);
  const [entries, setEntries] = useState<DictionaryEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [dictionaryError, setDictionaryError] = useState('');
  const [saved, setSaved] = useState<Saved[]>([]);
  const [library, setLibrary] = useState(false);
  const [storageReady, setStorageReady] = useState(false);
  const [storageError, setStorageError] = useState('');
  useEffect(() => {
    AsyncStorage.getItem(STORAGE).then(raw => {
      const data: unknown = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(data) || !data.every(w => typeof w?.key === 'string' && typeof w.word === 'string' && typeof w.sentence === 'string' && typeof w.meaning === 'string')) throw new Error('Invalid library');
      setSaved(data); setStorageReady(true);
    }).catch(() => setStorageError('Could not load saved words. Saving is disabled to protect your library.'));
  }, []);
  useEffect(() => {
    if (storageReady) AsyncStorage.setItem(STORAGE, JSON.stringify(saved)).catch(() => setStorageError('Could not store your changes on this device.'));
  }, [saved, storageReady]);
  useEffect(() => {
    if (!lookup) return;
    const controller = new AbortController();
    let active = true;
    setEntries([]); setDictionaryError('');
    const cached = cache.get(lookup.word);
    if (cached) { setEntries(cached); setLoading(false); return; }
    setLoading(true);
    const timer = setTimeout(() => controller.abort(), 12000);
    void fetch(`https://jisho.org/api/v1/search/words?keyword=${encodeURIComponent(lookup.word)}`, { signal: controller.signal }).then(async response => {
      if (!response.ok) throw new Error('Dictionary unavailable');
      const data = await response.json();
      if (!Array.isArray(data.data)) throw new Error('Unexpected dictionary response');
      const result = data.data.filter((entry: DictionaryEntry) => Array.isArray(entry.japanese) && entry.japanese.length && Array.isArray(entry.senses) && entry.senses.length).slice(0, 3);
      cache.set(lookup.word, result);
      if (active) setEntries(result);
    }).catch(() => { if (active) setDictionaryError('Dictionary lookup failed. Check your connection, then tap the word again.'); }).finally(() => { clearTimeout(timer); if (active) setLoading(false); });
    return () => { active = false; clearTimeout(timer); controller.abort(); };
  }, [lookup]);
  const browse = (url: string) => { Keyboard.dismiss(); setError(''); setCaption(null); setLookup(null); setUri(url); };
  const openInput = () => {
    const text = input.trim();
    if (!text) return;
    const video = youtubeUrl(text);
    if (/^https?:/i.test(text) && !video) { setError('Use a YouTube video link, or type a topic to search.'); return; }
    setTopic('Search'); browse(video || topicUrl(`${text} 日本語`));
  };
  const tapWord = (word: string) => { if (caption) { browser.current?.command('pause'); setLookup({ word, caption }); } };
  const save = (entry: DictionaryEntry) => {
    if (!lookup || !storageReady) return;
    const japanese = entry.japanese[0];
    const key = `${entry.slug}:${japanese.reading ?? ''}`;
    if (saved.some(w => w.key === key)) return;
    setSaved(old => [{ key, word: japanese.word || lookup.word, reading: japanese.reading || '', meaning: entry.senses[0].english_definitions.join('; '), sentence: lookup.caption.text, title: lookup.caption.title, url: lookup.caption.url, time: lookup.caption.time }, ...old]);
  };
  return <SafeAreaProvider><SafeAreaView style={s.safe}><StatusBar style="dark" />
    <View style={s.header}><Text style={s.brand}>immersed<Text style={{ color: '#BD512E' }}>.</Text></Text><Button onPress={() => { browser.current?.command('pause'); setLibrary(true); }}>{`Words · ${saved.length}`}</Button></View>
    <View style={s.search}><TextInput accessibilityLabel="Search Japanese topics or paste a YouTube link" placeholder="Search a topic or paste a YouTube link" value={input} onChangeText={setInput} onSubmitEditing={openInput} returnKeyType="search" autoCapitalize="none" style={s.input} /><Button onPress={openInput}>Go</Button></View>
    <View><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.topics}>{topics.map(item => <Pressable accessibilityRole="button" key={item.label} onPress={() => { setTopic(item.label); browse(topicUrl(item.query)); }} style={[s.topic, topic === item.label && s.activeTopic]}><Text style={s.topicText}>{item.label}</Text></Pressable>)}</ScrollView></View>
    {!!error && <View style={s.error}><Text style={s.hint}>{error}</Text><Button onPress={() => { setError(''); browser.current?.reload(); }}>Refresh</Button></View>}
    <View style={s.browser}><YouTubeBrowser ref={browser} uri={uri} onCaption={setCaption} onError={setError} /></View>
    <View style={s.study}><View style={s.row}><Text style={s.eyebrow}>JAPANESE SUBTITLES</Text><Text style={s.badge}>Experimental</Text></View>
      <ScrollView style={s.captionScroll} contentContainerStyle={{ paddingVertical: 8 }}>
        {caption?.text && caption.japanese ? <View style={s.tokens}>{caption.tokens.map((token, i) => <Pressable key={i} accessibilityRole={token.word ? 'button' : undefined} accessibilityLabel={token.word ? `Look up ${token.text}` : token.text} disabled={!token.word} onPress={() => tapWord(token.text)} style={s.token}><Text style={[s.japanese, token.word && s.tappable]}>{token.text}</Text></Pressable>)}</View> : <View><Text style={s.emptyTitle}>{caption?.text ? 'Select Japanese captions in the player' : 'Pick a video. Turn on Japanese captions.'}</Text><Text style={s.hint}>Tap a caption word here for its reading and meaning. This draft reads visible YouTube captions, including auto-generated ones. It cannot yet transcribe videos without captions.</Text></View>}
      </ScrollView>
      {caption?.japanese && !!caption.text && <View style={s.row}><Text style={s.hint}>Tap a word to pause & look it up</Text><Button onPress={() => browser.current?.command('replay')}>Replay line</Button></View>}
    </View>
    <Modal visible={!!lookup} transparent animationType="slide" onRequestClose={() => setLookup(null)}><View style={s.overlay}><Pressable accessibilityRole="button" accessibilityLabel="Close dictionary" style={StyleSheet.absoluteFill} onPress={() => setLookup(null)} /><View style={s.sheet}><View style={s.row}><Text style={s.eyebrow}>DICTIONARY · JISHO / JMdict</Text><Button onPress={() => setLookup(null)}>Close</Button></View><Text style={s.lookupWord}>{lookup?.word}</Text><ScrollView style={{ maxHeight: 260 }}>{loading && <ActivityIndicator color="#344C3F" />}{!!dictionaryError && <Text style={s.hint}>{dictionaryError}</Text>}{!loading && !dictionaryError && !entries.length && <Text style={s.hint}>No match for this word form. Dictionary-aware conjugation handling is still needed.</Text>}{entries.map((entry, index) => <View key={`${entry.slug}:${index}`} style={s.entry}><Text style={s.reading}>{entry.japanese.map(j => `${j.word || ''} ${j.reading || ''}`).join(' · ')}</Text><Text style={s.meaning}>{entry.senses.slice(0, 2).map(sense => sense.english_definitions.join('; ')).join('\n')}</Text><Button onPress={() => save(entry)}>{!storageReady ? 'Library unavailable' : saved.some(w => w.key === `${entry.slug}:${entry.japanese[0].reading ?? ''}`) ? '✓ Saved' : 'Save word + context'}</Button></View>)}</ScrollView><Text numberOfLines={2} style={s.sentence}>{lookup?.caption.text}</Text><Button onPress={() => { setLookup(null); browser.current?.command('play'); }}>Resume video →</Button></View></View></Modal>
    <Modal visible={library} animationType="slide" onRequestClose={() => setLibrary(false)}><SafeAreaView style={s.safe}><View style={s.header}><Text style={s.brand}>Your words.</Text><Button onPress={() => setLibrary(false)}>Back to YouTube</Button></View><ScrollView contentContainerStyle={{ padding: 22 }}>{!saved.length && <Text style={s.hint}>Your saved words and their original video context will appear here.</Text>}{!!storageError && <Text style={s.hint}>{storageError}</Text>}{saved.map(word => <View key={word.key} style={s.entry}><Text style={s.lookupWord}>{word.word}</Text><Text style={s.reading}>{word.reading}</Text><Text style={s.meaning}>{word.meaning}</Text><Text style={s.sentence}>{word.sentence}</Text><Text style={s.hint}>{word.title}</Text><View style={s.row}><Button onPress={() => { const link = youtubeUrl(word.url); if (link) { setLibrary(false); browse(`${link}&t=${Math.floor(word.time)}s`); } }}>Watch context ↗</Button><Button onPress={() => setSaved(old => old.filter(w => w.key !== word.key))}>Remove</Button></View></View>)}<Text style={s.attribution}>Dictionary results via Jisho.org. JMdict/EDRDG data: CC BY-SA 4.0, https://www.edrdg.org/edrdg/licence.html. Lookups send the tapped word to Jisho. Topic buttons search YouTube; Japanese-only results are not guaranteed. Earlier sample vocabulary stays stored separately on this device.</Text></ScrollView></SafeAreaView></Modal>
  </SafeAreaView></SafeAreaProvider>;
}
const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F7F5EF' }, header: { paddingHorizontal: 20, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }, brand: { color: '#242D28', fontSize: 28, fontWeight: '800', letterSpacing: -1.5 }, button: { backgroundColor: '#E8EBE1', paddingVertical: 12, paddingHorizontal: 13, borderRadius: 12 }, buttonText: { color: '#344C3F', fontWeight: '600', fontSize: 12 },
  search: { paddingHorizontal: 16, flexDirection: 'row', gap: 8, marginBottom: 10 }, input: { flex: 1, minWidth: 0, color: '#242D28', backgroundColor: '#FFFDF8', borderWidth: 1, borderColor: '#DFE2D9', borderRadius: 12, padding: 10, fontSize: 13 }, topics: { paddingHorizontal: 16, gap: 8, paddingBottom: 12 }, topic: { paddingVertical: 10, paddingHorizontal: 15, borderRadius: 24, backgroundColor: '#ECEAE3' }, activeTopic: { backgroundColor: '#DCE4D8' }, topicText: { color: '#344C3F', fontSize: 12, fontWeight: '600' },
  browser: { flex: 1, minHeight: 240, backgroundColor: '#FFF' }, study: { borderTopWidth: 1, borderTopColor: '#DFE2D9', paddingHorizontal: 18, paddingTop: 12, paddingBottom: 10, minHeight: 155, maxHeight: 230 }, row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 }, eyebrow: { color: '#70776E', fontSize: 10, fontWeight: '700', letterSpacing: 1 }, badge: { color: '#BD512E', fontSize: 10 }, captionScroll: { flexGrow: 0 }, tokens: { flexDirection: 'row', flexWrap: 'wrap' }, token: { minHeight: 44, paddingHorizontal: 3, justifyContent: 'center' }, japanese: { color: '#242D28', fontSize: 23, lineHeight: 35 }, tappable: { textDecorationLine: 'underline', textDecorationColor: '#BCC8B5' }, emptyTitle: { color: '#242D28', fontSize: 16, fontWeight: '600', marginBottom: 8 }, hint: { color: '#70776E', fontSize: 12, lineHeight: 19 }, error: { padding: 12, backgroundColor: '#F4E3D9', gap: 8 },
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: '#18261D77' }, sheet: { backgroundColor: '#F7F5EF', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 38 }, lookupWord: { color: '#242D28', fontSize: 34, marginTop: 12, marginBottom: 10 }, entry: { borderBottomColor: '#DFE2D9', borderBottomWidth: 1, paddingBottom: 18, marginBottom: 18, gap: 10 }, reading: { color: '#344C3F', fontSize: 15, lineHeight: 23 }, meaning: { color: '#242D28', fontSize: 17, lineHeight: 25 }, sentence: { color: '#344C3F', fontSize: 16, lineHeight: 25, marginVertical: 14 }, attribution: { color: '#70776E', fontSize: 11, lineHeight: 18, marginVertical: 20 },
});
