export type Token = { surface: string; reading?: string; meaning?: string; lemma?: string };
export type Cue = { tokens: Token[]; translation: string };
export type Lesson = { id: string; language: string; title: string; subtitle: string; kind: 'Video' | 'Podcast'; duration: string; color: string; glyph: string; cues: Cue[] };
export type SavedWord = { id: string; token: Token; sentence: string; translation: string; lesson: string; language: string; savedAt: string };

const t = (surface: string, reading: string, meaning: string, lemma = surface): Token => ({ surface, reading, meaning, lemma });
export const lessons: Lesson[] = [
  {
    id: 'morning', language: 'ja', title: 'A slower morning in Tokyo', subtitle: 'Everyday Japanese · Original sample', kind: 'Video', duration: '4 sentences', color: '#E9DCC9', glyph: '朝',
    cues: [
      { tokens: [t('今日', 'きょう', 'today'), t('は', 'は', 'topic marker'), t('少し', 'すこし', 'a little'), t('早く', 'はやく', 'early', '早い'), t('起きました', 'おきました', 'woke up (polite past)', '起きる'), { surface: '。' }], translation: 'Today I woke up a little early.' },
      { tokens: [t('朝', 'あさ', 'morning'), t('の', 'の', 'connects nouns; of'), t('空気', 'くうき', 'air; atmosphere'), t('は', 'は', 'topic marker'), t('とても', 'とても', 'very'), t('気持ちいい', 'きもちいい', 'pleasant; feels good'), { surface: '。' }], translation: 'The morning air feels really nice.' },
      { tokens: [t('近く', 'ちかく', 'nearby'), t('の', 'の', 'connects nouns; of'), t('公園', 'こうえん', 'park'), t('まで', 'まで', 'as far as; to'), t('散歩', 'さんぽ', 'a walk; stroll'), t('します', 'します', 'do (polite)', 'する'), { surface: '。' }], translation: 'I’m going for a walk to the nearby park.' },
      { tokens: [t('こんな', 'こんな', 'this kind of'), t('時間', 'じかん', 'time'), t('が', 'が', 'subject marker'), t('好き', 'すき', 'liked; fond of'), t('です', 'です', 'polite sentence ending'), { surface: '。' }], translation: 'I love moments like this.' },
    ],
  },
  {
    id: 'small-things', language: 'ja', title: 'Finding joy in small things', subtitle: 'Slow conversation · Original sample', kind: 'Podcast', duration: '3 sentences', color: '#DCE4DB', glyph: '小',
    cues: [
      { tokens: [t('皆さん', 'みなさん', 'everyone'), { surface: '、' }, t('こんにちは', 'こんにちは', 'hello'), { surface: '。' }], translation: 'Hello, everyone.' },
      { tokens: [t('今日', 'きょう', 'today'), t('は', 'は', 'topic marker'), t('小さな', 'ちいさな', 'small; little'), t('幸せ', 'しあわせ', 'happiness'), t('について', 'について', 'about; concerning'), t('話します', 'はなします', 'speak; talk (polite)', '話す'), { surface: '。' }], translation: 'Today I’ll talk about little moments of happiness.' },
      { tokens: [t('温かい', 'あたたかい', 'warm'), t('お茶', 'おちゃ', 'tea'), t('を', 'を', 'object marker'), t('飲む', 'のむ', 'to drink'), t('時間', 'じかん', 'time'), t('が', 'が', 'subject marker'), t('好き', 'すき', 'liked; fond of'), t('です', 'です', 'polite sentence ending'), { surface: '。' }], translation: 'I like taking time to drink warm tea.' },
    ],
  },
];

export const sentence = (cue: Cue) => cue.tokens.map(token => token.surface).join('');
export const wordId = (language: string, token: Token) => `${language}:${token.lemma ?? token.surface}:${token.reading ?? ''}`;
