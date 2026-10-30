import PitchAccent from './PitchAccent';
import React, { useMemo, useState, useRef, useEffect } from 'react';
import { ActivityIndicator, Modal, PanResponder, Pressable, ScrollView, StyleSheet, Switch, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import type { AnalyzedToken } from '../language';
import type { Caption, DictionaryEntry } from '../youtube';

type Props = {
  inline?: boolean; pitchAccent?: boolean; captionSpelling?: string; alternatives?: { entry: DictionaryEntry; form: string; likely: boolean }[]; onChooseSpelling?: (alternative: { entry: DictionaryEntry; form: string; likely: boolean }) => void;
  lookup: { token: AnalyzedToken; caption: Caption } | null;
  dark: boolean; entries: DictionaryEntry[]; loading: boolean; error: string;
  known: boolean; onKnown: (known: boolean) => void;
  saved: boolean; canSave: boolean; onSave: (entry: DictionaryEntry) => void;
  onClose: () => void; controls: React.ReactNode;
};
export default function LookupSheet({ inline = false, pitchAccent = false, captionSpelling, alternatives = [], onChooseSpelling, lookup, dark, entries, loading, error, known, onKnown, saved, canSave, onSave, onClose, controls }: Props) {
  const insets = useSafeAreaInsets();
  const definitions = useRef<React.ComponentRef<typeof ScrollView>>(null);
  useEffect(() => { definitions.current?.scrollTo({ y: 0, animated: false }); }, [lookup?.token.lemma]);
  const [expandedLookup, setExpandedLookup] = useState<Props['lookup']>(null);
  const moreEntries = expandedLookup !== null && expandedLookup === lookup;
  const { height } = useWindowDimensions();
  const ink = dark ? '#F3F3F3' : '#242D28', muted = dark ? '#A0AAA4' : '#66746A', accent = dark ? '#B4DEC4' : '#344C3F';
  const dismiss = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_event, state) => state.dy > 35 && state.dy > Math.abs(state.dx) * 1.5,
    onPanResponderRelease: onClose,
  }), [onClose]);
  const spellingContent = !!alternatives.length && <View testID="same-sound-alternatives" style={{ paddingTop: 10, marginTop: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: dark ? '#29322C' : '#D8DED5' }}>
            <Text style={{ color: muted, fontSize: 12, marginBottom: 3 }}>{alternatives.some(alternative => alternative.likely) ? 'Context suggestion' : 'Same reading'}</Text>
            {alternatives.map(alternative => <Pressable key={alternative.form} accessibilityRole="button" accessibilityLabel={`Use spelling ${alternative.form}`} onPress={event => { event.stopPropagation(); onChooseSpelling?.(alternative); }} style={{ minHeight: 48, paddingVertical: 7 }}>
              <Text style={{ color: accent, fontSize: 17 }}>{alternative.form}</Text>
              <Text numberOfLines={2} style={{ color: muted, fontSize: 13, lineHeight: 19 }}>{alternative.entry.senses[0]?.english_definitions.join('; ')}</Text>
            </Pressable>)}
          </View>;
  const content = <Pressable accessible={false} testID="dictionary-sheet" onPress={onClose} style={[styles.sheet, inline ? { flex: 1, minHeight: 0, borderRadius: 0, paddingTop: 4, paddingHorizontal: 16, paddingBottom: 0, backgroundColor: dark ? '#000' : '#F7F5EF' } : { backgroundColor: dark ? '#090C0A' : '#F7F5EF', height: Math.min(height * .72, Math.max(350, Math.min(510, height * .56))), paddingBottom: Math.max(20, insets.bottom + 10) }]}>
        <View {...dismiss.panHandlers} style={{ paddingBottom: inline ? 2 : 14 }}>
          {!inline && <View style={{ width: 32, height: 4, borderRadius: 2, backgroundColor: dark ? '#354039' : '#C5CDC4', alignSelf: 'center', marginBottom: 18 }} />}
          <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
            <View style={{ flex: 1 }}>
              <Text selectable={false} style={{ color: ink, fontSize: inline ? 22 : 27, fontWeight: '600', lineHeight: inline ? 28 : 36 }}>{lookup?.token.text}</Text>
              <Text selectable={false} style={{ color: muted, fontSize: inline ? 12 : 15, lineHeight: inline ? 16 : 23 }}>{lookup?.token.reading}</Text>
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={event => { event.stopPropagation(); onClose(); }} style={styles.close}>
              <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={muted} strokeWidth={1.8} strokeLinecap="round" aria-hidden><Path d="m7 7 10 10M17 7 7 17" /></Svg>
            </Pressable>
          </View>
          {!!captionSpelling && <Text selectable={false} style={{ color: muted, fontSize: 12, marginTop: 5 }}>Caption spelling: {captionSpelling}</Text>}
          {lookup && (lookup.token.lemma !== lookup.token.text || lookup.token.grammar.length > 0) && <Text selectable={false} style={{ color: muted, fontSize: 13, lineHeight: 20, marginTop: inline ? 0 : 7 }}>{[lookup.token.lemma !== lookup.token.text ? lookup.token.lemma : '', ...lookup.token.grammar].filter(Boolean).join(' · ')}</Text>}
        </View>
        <ScrollView ref={definitions} testID="lookup-definitions" style={{ flex: 1, minHeight: 0 }} contentContainerStyle={{ paddingBottom: 8 }}>
          {loading && <ActivityIndicator accessibilityLabel="Looking up word" color={accent} />}
          {!!error && <Text selectable={false} style={{ color: muted, lineHeight: 23 }}>{error}</Text>}
          {!loading && !error && !entries.length && <Text selectable={false} style={{ color: muted }}>No matching word found.</Text>}
          {alternatives.some(alternative => alternative.likely) && spellingContent}
          {(moreEntries ? entries : entries.slice(0, 1)).map((entry, index) => <View key={entry.slug} style={{ paddingVertical: inline ? 3 : 10, borderTopWidth: index ? StyleSheet.hairlineWidth : 0, borderTopColor: dark ? '#29322C' : '#D8DED5' }}>
            {(index > 0 || entry.source === 'JMnedict' || (entry.source === 'JMdict' && entry.japanese.some(j => j.word && j.word !== lookup?.token.lemma) && /^[ぁ-ゖァ-ヺー]+$/.test(lookup?.token.text || ''))) && <Text selectable={false} style={{ color: muted, fontSize: 13, lineHeight: 21 }}>{[...new Set(entry.japanese.map(j => [j.word, j.reading].filter(Boolean).join(' ')))].join(' · ')}{entry.source === 'JMnedict' ? ` · ${[...new Set(entry.senses.flatMap(sense => sense.parts_of_speech))].join(' · ')}` : ''}</Text>}
            {pitchAccent && <PitchAccent accents={entry.pitch} dark={dark} />}
            <Text selectable={false} style={{ color: ink, fontSize: inline ? 15 : 17, lineHeight: inline ? 21 : 25 }}>{entry.senses.slice(0, 2).map(sense => sense.english_definitions.join('; ')).join('\n')}</Text>
          </View>)}
          {entries.length > 1 && <Pressable accessibilityRole="button" accessibilityLabel={moreEntries ? 'Show fewer entries' : 'More dictionary entries'} onPress={event => { event.stopPropagation(); setExpandedLookup(moreEntries ? null : lookup); }} style={{ minHeight: 44, justifyContent: 'center' }}><Text style={{ color: accent, fontSize: 13 }}>{moreEntries ? 'Show less' : `Other entries (${entries.length - 1})`}</Text></Pressable>}
          {!alternatives.some(alternative => alternative.likely) && spellingContent}
        </ScrollView>
        <View style={{ marginTop: inline ? 2 : 10, marginBottom: inline ? 0 : 8 }}>{controls}</View>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <Pressable accessibilityRole="button" accessibilityLabel={saved ? 'Word saved' : 'Save word'} accessibilityState={{ disabled: !canSave || !entries.length || saved }} disabled={!canSave || !entries.length || saved} onPress={event => { event.stopPropagation(); if (entries[0]) onSave(entries[0]); }} style={{ minHeight: inline ? 44 : 48, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', gap: 8, opacity: canSave && entries.length ? 1 : 0.35 }}>
            <Svg width={21} height={21} viewBox="0 0 24 24" fill={saved ? accent : 'none'} stroke={accent} strokeWidth={1.8} strokeLinejoin="round" aria-hidden><Path d="M6 4h12v17l-6-4-6 4Z" /></Svg>
            <Text selectable={false} style={{ color: accent, fontSize: 14 }}>{saved ? 'Saved' : 'Save'}</Text>
          </Pressable>
          <Pressable accessible={false} testID="word-knowledge-control" onPress={event => event.stopPropagation()} style={{ minHeight: inline ? 44 : 48, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Text selectable={false} style={{ color: muted, fontSize: 14 }}>{known ? 'Known' : 'Unknown'}</Text>
            <Switch accessibilityLabel="Known word" value={known} onValueChange={onKnown} trackColor={{ false: dark ? '#354039' : '#CAD2C9', true: dark ? '#41694D' : '#A5BCA7' }} />
          </Pressable>
        </View>
      </Pressable>;
  if (inline) return lookup ? content : null;
  return <Modal visible={!!lookup} transparent animationType="none" onRequestClose={onClose}>
    <View style={styles.overlay} accessibilityViewIsModal>
      <Pressable accessibilityRole="button" accessibilityLabel="Close dictionary" style={StyleSheet.absoluteFill} onPress={onClose} />
      {content}
    </View>
  </Modal>;
}
const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: '#00000066' },
  sheet: { borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 22, paddingTop: 12 },
  close: { minHeight: 44, width: 44, alignItems: 'center', justifyContent: 'center', alignSelf: 'flex-start' },
});
