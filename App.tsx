import React, { useEffect, useState } from 'react';
import { Alert, Linking, Modal, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as Speech from 'expo-speech';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { lessons, sentence, wordId, type Lesson, type SavedWord, type Token } from './src/content';

const C = { bg: '#F7F5EF', ink: '#242D28', muted: '#70776E', green: '#344C3F', accent: '#BD512E', line: '#DFE2D9', white: '#FFFDF8' };
const STORAGE_KEY = 'immersed.v1.words';
type Tab = 'Immerse' | 'Words' | 'Settings';

function Button({ title, onPress, secondary = false }: { title: string; onPress: () => void; secondary?: boolean }) {
  return <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [s.button, secondary && s.secondary, pressed && { opacity: 0.65 }]}><Text style={[s.buttonText, secondary && { color: C.ink }]}>{title}</Text></Pressable>;
}

export default function App() {
  const [tab, setTab] = useState<Tab>('Immerse');
  const [lesson, setLesson] = useState<Lesson | null>(null);
  const [line, setLine] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [repeat, setRepeat] = useState(false);
  const [cycle, setCycle] = useState(0);
  const [rate, setRate] = useState(0.85);
  const [translation, setTranslation] = useState(true);
  const [furigana, setFurigana] = useState(true);
  const [selected, setSelected] = useState<{ token: Token; line: number } | null>(null);
  const [words, setWords] = useState<SavedWord[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [storageError, setStorageError] = useState('');
  const [speechError, setSpeechError] = useState('');
  const [url, setUrl] = useState('');
  const [showImport, setShowImport] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then(raw => {
      if (raw) {
        const data: unknown = JSON.parse(raw);
        if (!Array.isArray(data) || !data.every(w => w && typeof w.id === 'string' && typeof w.token?.surface === 'string' && typeof w.sentence === 'string' && typeof w.language === 'string')) throw new Error('Invalid library');
        setWords(data);
      }
      setLoaded(true);
    }).catch(() => setStorageError('Your library could not be loaded. Saving is disabled to protect existing data.'));
  }, []);

  useEffect(() => {
    if (loaded) AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(words)).catch(() => setStorageError('Changes could not be stored on this device.'));
  }, [words, loaded]);

  useEffect(() => {
    if (!playing || !lesson) return;
    let active = true;
    setSpeechError('');
    void Speech.stop().then(() => {
      if (!active) return;
      Speech.speak(sentence(lesson.cues[line]), {
        language: lesson.language === 'ja' ? 'ja-JP' : lesson.language, rate,
        onDone: () => {
          if (!active) return;
          if (repeat) setCycle(c => c + 1);
          else if (line < lesson.cues.length - 1) setLine(n => n + 1);
          else setPlaying(false);
        },
        onError: () => { if (active) { setPlaying(false); setSpeechError('Speech is unavailable. Check that a Japanese voice is installed on your device.'); } },
      });
    }).catch(() => { if (active) { setPlaying(false); setSpeechError('Audio could not start. Please try again.'); } });
    return () => { active = false; void Speech.stop(); };
  }, [playing, lesson, line, repeat, rate, cycle]);

  const openLesson = (item: Lesson) => { setPlaying(false); setLine(0); setLesson(item); setSelected(null); setSpeechError(''); };
  const closeLesson = () => { setPlaying(false); setLesson(null); setSelected(null); };
  const tapWord = (token: Token, cueLine: number) => { if (!token.meaning) return; setPlaying(false); setSelected({ token, line: cueLine }); };
  const saveWord = () => {
    if (!selected || !lesson || !loaded) return;
    const id = wordId(lesson.language, selected.token);
    if (!words.some(w => w.id === id)) setWords(old => [{ id, token: selected.token, sentence: sentence(lesson.cues[selected.line]), translation: lesson.cues[selected.line].translation, lesson: lesson.title, language: lesson.language, savedAt: new Date().toISOString() }, ...old]);
  };
  const openYouTube = async () => {
    let parsed: URL;
    try { parsed = new URL(url.trim()); } catch { Alert.alert('Add a YouTube link', 'Paste a full https:// YouTube video URL.'); return; }
    if (parsed.protocol !== 'https:' || !['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be'].includes(parsed.hostname)) { Alert.alert('YouTube links only', 'Use a link from youtube.com or youtu.be.'); return; }
    try { await Linking.openURL(parsed.toString()); setShowImport(false); } catch { Alert.alert('Could not open link', 'Please try opening it in Safari.'); }
  };

  return <SafeAreaProvider><SafeAreaView style={s.safe}><StatusBar style="dark" /><View style={s.shell}>
    <View style={s.header}><Text style={s.brand}>immersed<Text style={{ color: C.accent }}>.</Text></Text><Text style={s.language}>日本語  /  JA</Text></View>
    {lesson ? <ScrollView contentContainerStyle={s.content}>
      <Pressable accessibilityRole="button" onPress={closeLesson} style={s.back}><Text style={s.meta}>←  Your immersion space</Text></Pressable>
      <View style={[s.playerArt, { backgroundColor: lesson.color }]}><Text style={s.artLabel}>{lesson.kind.toUpperCase()} · DEMO LESSON</Text><Text style={s.heroGlyph}>{lesson.glyph}</Text><Text style={s.artFooter}>Small moments. Real understanding.</Text></View>
      <Text style={s.title}>{lesson.title}</Text><Text style={s.meta}>Original sample · Device-generated Japanese speech</Text>
      <View style={s.controls}><Button secondary title="↶ Previous" onPress={() => { setLine(n => Math.max(0, n - 1)); setCycle(c => c + 1); }} /><Button title={playing ? 'Ⅱ Pause' : '▶ Listen'} onPress={() => setPlaying(p => !p)} /><Button secondary title="Next ↷" onPress={() => { setLine(n => Math.min(lesson.cues.length - 1, n + 1)); setCycle(c => c + 1); }} /></View>
      <View style={s.between}><Pressable accessibilityRole="button" onPress={() => setRate(r => r === 0.85 ? 0.65 : r === 0.65 ? 1 : 0.85)}><Text style={s.chip}>{rate}× speech</Text></Pressable><Pressable accessibilityRole="button" onPress={() => setRepeat(v => !v)}><Text style={[s.chip, repeat && { color: C.accent }]}>Repeat sentence {repeat ? 'on' : 'off'}</Text></Pressable></View>
      {!!speechError && <Text accessibilityRole="alert" style={s.notice}>{speechError}</Text>}
      <View style={s.sectionHeading}><Text style={s.sectionTitle}>Follow along</Text><Text style={s.meta}>Tap any word to explore</Text></View>
      {lesson.cues.map((cue, index) => <View key={index} style={[s.cue, index === line && s.activeCue]}>
        <Pressable accessibilityRole="button" accessibilityLabel={`Select sentence ${index + 1}`} onPress={() => { setLine(index); setCycle(c => c + 1); }}><Text style={s.cueNumber}>{String(index + 1).padStart(2, '0')} {index === line ? '· CURRENT' : '· SELECT SENTENCE'}</Text></Pressable>
        <View style={s.tokens}>{cue.tokens.map((token, i) => <Pressable key={i} accessibilityRole={token.meaning ? 'button' : undefined} accessibilityLabel={token.meaning ? `Look up ${token.surface}` : token.surface} disabled={!token.meaning} onPress={() => tapWord(token, index)} style={s.token}>
          {furigana && <Text style={s.reading}>{token.reading ?? ' '}</Text>}<Text style={s.japanese}>{token.surface}</Text>
        </Pressable>)}</View>
        {translation && <Text style={s.translation}>{cue.translation}</Text>}
      </View>)}
      <Text style={s.notice}>Prototype: the active sentence follows synthesized speech. This is not a video player or live transcription.</Text>
    </ScrollView> : <>
      <ScrollView contentContainerStyle={s.content}>
        {tab === 'Immerse' && <>
          <Text style={s.eyebrow}>A LITTLE JAPANESE, EVERY DAY</Text><Text style={s.headline}>Less studying.{ '\n' }More living.</Text><Text style={s.lead}>Get lost in something good.{ '\n' }Find the words along the way.</Text>
          <View style={s.welcome}><Text style={s.welcomeIcon}>ひ</Text><View style={{ flex: 1 }}><Text style={s.welcomeTitle}>Your immersion starts here</Text><Text style={s.welcomeBody}>Listen. Tap a word. Keep going.</Text></View></View>
          <View style={s.sectionHeading}><Text style={s.sectionTitle}>Try the experience</Text><Text style={s.meta}>2 demo lessons</Text></View>
          {lessons.map(item => <Pressable key={item.id} accessibilityRole="button" onPress={() => openLesson(item)} style={({ pressed }) => [s.card, pressed && { opacity: 0.7 }]}>
            <View style={[s.thumbnail, { backgroundColor: item.color }]}><Text style={s.thumbnailGlyph}>{item.glyph}</Text><Text style={s.playBadge}>{item.kind === 'Podcast' ? '♫' : '▶'}</Text></View>
            <View style={s.cardBody}><Text style={s.eyebrow}>{item.kind.toUpperCase()} · {item.duration.toUpperCase()}</Text><Text style={s.cardTitle}>{item.title}</Text><Text style={s.meta}>{item.subtitle}</Text></View>
          </Pressable>)}
          <Pressable accessibilityRole="button" onPress={() => setShowImport(true)} style={s.import}><Text style={s.plus}>＋</Text><View style={{ flex: 1 }}><Text style={s.welcomeTitle}>Bring something you love</Text><Text style={s.meta}>YouTube link · opens externally in this draft</Text></View><Text>↗</Text></Pressable>
          <Text style={s.footnote}>Built around your curiosity. Japanese first, more languages to come.</Text>
        </>}
        {tab === 'Words' && <><Text style={s.eyebrow}>YOUR PERSONAL DICTIONARY</Text><Text style={s.headline}>Words with{ '\n' }a story.</Text><Text style={s.lead}>{words.length} saved {words.length === 1 ? 'word' : 'words'} · stored on this device</Text>
          {!words.length && <View style={s.empty}><Text style={s.emptyGlyph}>言</Text><Text style={s.cardTitle}>Let curiosity build your library.</Text><Text style={s.lead}>Tap a word in any demo lesson, then save it here with its original sentence.</Text><Button title="Explore a lesson →" onPress={() => setTab('Immerse')} /></View>}
          {words.map(word => <View key={word.id} style={s.wordCard}><View style={s.between}><Text style={s.wordSurface}>{word.token.surface}</Text><Pressable accessibilityRole="button" accessibilityLabel={`Remove ${word.token.surface}`} onPress={() => setWords(old => old.filter(w => w.id !== word.id))}><Text style={s.remove}>Remove</Text></Pressable></View><Text style={s.meta}>{word.token.reading}</Text><Text style={s.definition}>{word.token.meaning}</Text><Text style={s.example}>{word.sentence}</Text><Text style={s.meta}>{word.translation}</Text><Text style={s.source}>FROM {word.lesson.toUpperCase()}</Text></View>)}
        </>}
        {tab === 'Settings' && <><Text style={s.eyebrow}>MAKE IT YOURS</Text><Text style={s.headline}>Your pace.{ '\n' }Your space.</Text><Text style={s.lead}>A few small choices for a smoother flow.</Text><View style={s.setting}><View><Text style={s.welcomeTitle}>Furigana</Text><Text style={s.meta}>Readings above Japanese words</Text></View><Switch accessibilityLabel="Show furigana" value={furigana} onValueChange={setFurigana} trackColor={{ true: C.green }} /></View><View style={s.setting}><View><Text style={s.welcomeTitle}>English translations</Text><Text style={s.meta}>Sentence meanings below subtitles</Text></View><Switch accessibilityLabel="Show English translations" value={translation} onValueChange={setTranslation} trackColor={{ true: C.green }} /></View><View style={s.wordCard}><Text style={s.sectionTitle}>Japanese first. Open by design.</Text><Text style={s.lead}>Lessons and vocabulary carry a language code, ready for more language packs later.</Text><Text style={s.notice}>Draft 0.1 · No account or subscription. Words stay on this device. Display preferences reset when the app restarts. On iPhone, turn Silent Mode off to hear demo speech.</Text></View></>}
        {!!storageError && <Text accessibilityRole="alert" style={s.notice}>{storageError}</Text>}
      </ScrollView>
      <View style={s.nav}>{(['Immerse', 'Words', 'Settings'] as Tab[]).map((item, i) => <Pressable key={item} accessibilityRole="tab" accessibilityState={{ selected: tab === item }} onPress={() => setTab(item)} style={s.navItem}><Text style={[s.navIcon, tab === item && { color: C.accent }]}>{['◉', '▤', '☷'][i]}</Text><Text style={[s.navLabel, tab === item && { color: C.ink }]}>{item}</Text></Pressable>)}</View>
    </>}
    <Modal transparent visible={!!selected} animationType="slide" onRequestClose={() => setSelected(null)}><View style={s.overlay}><Pressable accessibilityRole="button" accessibilityLabel="Close word lookup" style={StyleSheet.absoluteFill} onPress={() => setSelected(null)} /><View style={s.sheet}><View style={s.handle} /><View style={s.between}><Text style={s.eyebrow}>WORD LOOKUP · SAMPLE DICTIONARY</Text><Pressable accessibilityRole="button" accessibilityLabel="Close word lookup" onPress={() => setSelected(null)}><Text style={s.close}>×</Text></Pressable></View><Text style={s.lookupWord}>{selected?.token.surface}</Text><Text style={s.lead}>{selected?.token.reading}</Text><Text style={s.definition}>{selected?.token.meaning}</Text>{selected && lesson && <><Text style={s.example}>{sentence(lesson.cues[selected.line])}</Text><Text style={s.meta}>{lesson.cues[selected.line].translation}</Text><View style={{ height: 24 }} /><Button title={!loaded ? 'Library unavailable' : words.some(w => w.id === wordId(lesson.language, selected.token)) ? '✓ Saved to your words' : '＋ Save word & sentence'} onPress={saveWord} /><Button secondary title="Back to the story →" onPress={() => { setLine(selected.line); setSelected(null); setPlaying(true); }} /></>}</View></View></Modal>
    <Modal transparent visible={showImport} animationType="slide" onRequestClose={() => setShowImport(false)}><View style={s.overlay}><Pressable accessibilityRole="button" accessibilityLabel="Close YouTube link" style={StyleSheet.absoluteFill} onPress={() => setShowImport(false)} /><View style={s.sheet}><Text style={s.sectionTitle}>Bring your own curiosity</Text><Text style={s.lead}>YouTube playback inside the app and caption import are planned. For now, this opens your link in YouTube or Safari.</Text><TextInput accessibilityLabel="YouTube video URL" value={url} onChangeText={setUrl} placeholder="https://www.youtube.com/watch?v=…" autoCapitalize="none" autoCorrect={false} keyboardType="url" style={s.input} /><Button title="Open YouTube ↗" onPress={openYouTube} /><Button secondary title="Keep exploring the demo" onPress={() => setShowImport(false)} /></View></View></Modal>
  </View></SafeAreaView></SafeAreaProvider>;
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg }, shell: { flex: 1, width: '100%', maxWidth: 640, alignSelf: 'center' },
  header: { paddingHorizontal: 24, paddingVertical: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomColor: C.line, borderBottomWidth: 1 }, brand: { fontSize: 29, fontWeight: '800', letterSpacing: -1.5, color: C.ink }, language: { color: C.green, fontSize: 12, fontWeight: '700', letterSpacing: 1 },
  content: { padding: 24, paddingBottom: 40 }, eyebrow: { fontSize: 10, letterSpacing: 1.6, fontWeight: '700', color: C.muted }, headline: { fontSize: 43, lineHeight: 49, fontWeight: '600', letterSpacing: -1.7, color: C.ink, marginTop: 18 }, lead: { fontSize: 16, lineHeight: 25, color: C.muted, marginTop: 14, marginBottom: 20 },
  welcome: { backgroundColor: '#E8EBE1', padding: 18, borderRadius: 18, flexDirection: 'row', gap: 16, alignItems: 'center', marginTop: 4, marginBottom: 30 }, welcomeIcon: { fontSize: 32, color: C.green }, welcomeTitle: { fontSize: 15, fontWeight: '600', color: C.ink, marginBottom: 5 }, welcomeBody: { color: C.muted, fontSize: 13 },
  sectionHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 16, marginTop: 14 }, sectionTitle: { fontSize: 19, fontWeight: '600', color: C.ink, letterSpacing: -0.4 }, meta: { color: C.muted, fontSize: 12, lineHeight: 19 },
  card: { backgroundColor: C.white, borderColor: C.line, borderWidth: 1, borderRadius: 20, overflow: 'hidden', marginBottom: 18 }, thumbnail: { height: 134, justifyContent: 'center', alignItems: 'center' }, thumbnailGlyph: { fontSize: 82, color: C.green, opacity: 0.75, fontWeight: '200' }, playBadge: { position: 'absolute', bottom: 14, right: 16, backgroundColor: C.white, color: C.green, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 24, overflow: 'hidden' }, cardBody: { padding: 18, gap: 9 }, cardTitle: { fontSize: 21, lineHeight: 27, fontWeight: '600', color: C.ink, letterSpacing: -0.5 },
  import: { flexDirection: 'row', gap: 14, paddingVertical: 24, alignItems: 'center' }, plus: { color: C.accent, fontSize: 30 }, footnote: { color: C.muted, fontSize: 12, lineHeight: 19, paddingTop: 16, borderTopWidth: 1, borderTopColor: C.line },
  nav: { flexDirection: 'row', backgroundColor: C.bg, borderTopColor: C.line, borderTopWidth: 1, paddingVertical: 10 }, navItem: { flex: 1, alignItems: 'center', padding: 8, gap: 5 }, navIcon: { fontSize: 23, color: C.muted }, navLabel: { color: C.muted, fontSize: 11, fontWeight: '600' },
  back: { paddingVertical: 8, marginBottom: 16 }, playerArt: { borderRadius: 18, padding: 20, alignItems: 'center', marginBottom: 22 }, artLabel: { color: C.green, fontSize: 10, letterSpacing: 2, alignSelf: 'flex-start' }, heroGlyph: { fontSize: 105, color: C.green, fontWeight: '200', marginVertical: 5 }, artFooter: { color: C.green, fontSize: 12 }, title: { color: C.ink, fontSize: 27, fontWeight: '600', marginBottom: 8, letterSpacing: -0.8 }, controls: { flexDirection: 'row', gap: 8, marginTop: 20, marginBottom: 8 }, button: { backgroundColor: C.green, borderRadius: 12, paddingVertical: 15, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center', marginVertical: 5 }, buttonText: { color: C.white, fontSize: 13, fontWeight: '600' }, secondary: { backgroundColor: '#E8EBE1' }, between: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 }, chip: { fontSize: 12, color: C.green, paddingVertical: 12 },
  cue: { padding: 16, borderRadius: 16, borderWidth: 1, borderColor: C.line, marginBottom: 12 }, activeCue: { backgroundColor: '#E8EBE1', borderColor: '#A6B19F' }, cueNumber: { fontSize: 9, letterSpacing: 1, color: C.muted, paddingVertical: 7 }, tokens: { flexDirection: 'row', flexWrap: 'wrap', marginVertical: 10 }, token: { paddingHorizontal: 2, paddingVertical: 5, minHeight: 44 }, reading: { color: C.muted, fontSize: 10, textAlign: 'center', marginBottom: 3 }, japanese: { color: C.ink, fontSize: 25, lineHeight: 36 }, translation: { color: C.muted, fontSize: 14, lineHeight: 22 }, notice: { color: C.muted, fontSize: 12, lineHeight: 20, marginTop: 16 },
  empty: { paddingVertical: 28, gap: 10 }, emptyGlyph: { fontSize: 64, color: C.green }, wordCard: { backgroundColor: C.white, padding: 20, marginTop: 16, borderRadius: 16, borderWidth: 1, borderColor: C.line }, wordSurface: { fontSize: 28, color: C.ink }, definition: { fontSize: 20, color: C.ink, lineHeight: 29, marginVertical: 14 }, example: { fontSize: 17, color: C.green, lineHeight: 28, marginTop: 16, marginBottom: 8 }, source: { color: C.muted, fontSize: 9, letterSpacing: 1, marginTop: 20 }, remove: { color: C.accent, fontSize: 12, paddingVertical: 12 }, setting: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 22, borderBottomColor: C.line, borderBottomWidth: 1 },
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: '#18261D77' }, sheet: { backgroundColor: C.bg, padding: 28, paddingBottom: Platform.OS === 'ios' ? 44 : 28, borderTopLeftRadius: 28, borderTopRightRadius: 28, width: '100%', maxWidth: 640, alignSelf: 'center' }, handle: { height: 4, width: 36, borderRadius: 3, backgroundColor: C.line, alignSelf: 'center', marginBottom: 20 }, close: { color: C.ink, fontSize: 28, padding: 8 }, lookupWord: { fontSize: 46, color: C.ink, marginTop: 12 }, input: { backgroundColor: C.white, borderColor: C.line, borderWidth: 1, borderRadius: 12, padding: 16, color: C.ink, marginBottom: 16, fontSize: 14 },
});
