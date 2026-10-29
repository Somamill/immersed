import PitchAccent from './PitchAccent';
import React, { useMemo } from 'react';
import { ActivityIndicator, Modal, PanResponder, Pressable, ScrollView, StyleSheet, Switch, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import type { AnalyzedToken } from '../language';
import type { Caption, DictionaryEntry } from '../youtube';

type Props = {
  inline?: boolean; pitchAccent?: boolean;
  lookup: { token: AnalyzedToken; caption: Caption } | null;
  dark: boolean; entries: DictionaryEntry[]; loading: boolean; error: string;
  known: boolean; onKnown: (known: boolean) => void;
  saved: boolean; canSave: boolean; onSave: (entry: DictionaryEntry) => void;
  onClose: () => void; controls: React.ReactNode;
};
export default function LookupSheet({ inline = false, pitchAccent = false, lookup, dark, entries, loading, error, known, onKnown, saved, canSave, onSave, onClose, controls }: Props) {
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const ink = dark ? '#F3F3F3' : '#242D28', muted = dark ? '#A0AAA4' : '#66746A', accent = dark ? '#B4DEC4' : '#344C3F';
  const dismiss = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_event, state) => state.dy > 35 && state.dy > Math.abs(state.dx) * 1.5,
    onPanResponderRelease: onClose,
  }), [onClose]);
  const content = <Pressable accessible={false} testID="dictionary-sheet" onPress={onClose} style={[styles.sheet, inline ? { flex: 1, minHeight: 0, borderRadius: 0, paddingTop: 4, paddingHorizontal: 16, paddingBottom: 0, backgroundColor: dark ? '#000' : '#F7F5EF' } : { backgroundColor: dark ? '#090C0A' : '#F7F5EF', maxHeight: height * 0.82, paddingBottom: Math.max(20, insets.bottom + 10) }]}>
        <View {...dismiss.panHandlers} style={{ paddingBottom: inline ? 2 : 14 }}>
          {!inline && <View style={{ width: 32, height: 4, borderRadius: 2, backgroundColor: dark ? '#354039' : '#C5CDC4', alignSelf: 'center', marginBottom: 18 }} />}
          <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
            <View style={{ flex: 1 }}>
              <Text selectable={false} style={{ color: ink, fontSize: inline ? 22 : 30, fontWeight: '600', lineHeight: inline ? 28 : 40 }}>{lookup?.token.text}</Text>
              <Text selectable={false} style={{ color: muted, fontSize: inline ? 12 : 15, lineHeight: inline ? 16 : 23 }}>{lookup?.token.reading}</Text>
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={event => { event.stopPropagation(); onClose(); }} style={styles.close}>
              <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={muted} strokeWidth={1.8} strokeLinecap="round" aria-hidden><Path d="m7 7 10 10M17 7 7 17" /></Svg>
            </Pressable>
          </View>
          {lookup && (lookup.token.lemma !== lookup.token.text || lookup.token.grammar.length > 0) && <Text selectable={false} style={{ color: muted, fontSize: 13, lineHeight: 20, marginTop: inline ? 0 : 7 }}>{[lookup.token.lemma !== lookup.token.text ? lookup.token.lemma : '', ...lookup.token.grammar].filter(Boolean).join(' · ')}</Text>}
        </View>
        <ScrollView testID="lookup-definitions" style={inline ? { flex: 1, minHeight: 0 } : { maxHeight: Math.min(230, height * 0.3), flexShrink: 1 }} contentContainerStyle={{ paddingBottom: 8 }}>
          {loading && <ActivityIndicator accessibilityLabel="Looking up word" color={accent} />}
          {!!error && <Text selectable={false} style={{ color: muted, lineHeight: 23 }}>{error}</Text>}
          {!loading && !error && !entries.length && <Text selectable={false} style={{ color: muted }}>No matching word found.</Text>}
          {entries.map((entry, index) => <View key={entry.slug} style={{ paddingVertical: inline ? 3 : 10, borderTopWidth: index ? StyleSheet.hairlineWidth : 0, borderTopColor: dark ? '#29322C' : '#D8DED5' }}>
            {(index > 0 || entry.source === 'JMnedict') && <Text selectable={false} style={{ color: muted, fontSize: 13, lineHeight: 21 }}>{[...new Set(entry.japanese.map(j => [j.word, j.reading].filter(Boolean).join(' ')))].join(' · ')}{entry.source === 'JMnedict' ? ` · ${[...new Set(entry.senses.flatMap(sense => sense.parts_of_speech))].join(' · ')}` : ''}</Text>}
            {pitchAccent && <PitchAccent accents={entry.pitch} dark={dark} />}
            <Text selectable={false} style={{ color: ink, fontSize: inline ? 15 : 17, lineHeight: inline ? 21 : 25 }}>{entry.senses.slice(0, 2).map(sense => sense.english_definitions.join('; ')).join('\n')}</Text>
          </View>)}
        </ScrollView>
        <View style={{ marginTop: inline ? 2 : 16, marginBottom: inline ? 0 : 12 }}>{controls}</View>
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
