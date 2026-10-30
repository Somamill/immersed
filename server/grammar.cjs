const explanations = {
  'だろう': ['probably; I suppose; ... right?', 'Conjectural form of だ. Can express a guess or seek agreement; tone depends on context.'],
  'でしょう': ['probably; I suppose; ... right? (polite)', 'Polite conjectural expression. It attaches to the preceding statement.'],
  'う': ['volitional / conjectural ending', 'Part of a verb or expression such as だろう; not an independent noun in this grammatical use.'],
  'ん': ['explanatory / sentence-ending ん', 'Often a spoken form related to の. Its role depends on the surrounding sentence.'],
  'は': ['topic marker', 'Marks what the statement is about; pronounced わ.'],
  'を': ['object marker', 'Marks the object of an action; usually pronounced お.'],
  'が': ['subject / focus marker; but', 'Marks a subject or focus, or connects clauses with “but,” depending on context.'],
  'に': ['target; destination; time; location', 'Marks a target, destination, time, or location according to the construction.'],
  'の': ['possession; noun-linking; nominalization', 'Connects nouns or turns a clause into a noun-like expression.'],
  'で': ['place of action; means; connective', 'Marks where/how an action happens, or connects a statement.'],
  'と': ['and; with; quotation; conditional', 'Connects items, marks a companion/quotation, or introduces a condition.'],
  'も': ['also; too; even', 'Adds or emphasizes an item relative to the context.'],
  'ね': ['seeking agreement / shared understanding', 'A sentence-ending particle, often like “right?” or “isn’t it?”.'],
  'よ': ['assertion / information for the listener', 'A sentence-ending particle used to tell or emphasize something.'],
  'か': ['question / uncertainty marker', 'Marks a question, an alternative, or an embedded uncertainty.'],
  'な': ['sentence-ending な / linking form', 'Can express a reaction or connect a な-adjective to a noun.'],
  'って': ['spoken quotation / topic marker', 'Colloquial form often related to と or という.'],
  'だ': ['copula: is / are', 'Connects a noun or な-adjective to a statement. Its inflected form depends on context.'],
  'です': ['polite copula', 'A polite sentence ending; not an ordinary standalone content word.'],
  'ます': ['polite verb ending', 'Attaches to a verb stem.'],
  'ない': ['negative form', 'Expresses negation as part of a surrounding construction.'],
  'た': ['past / completed form', 'An auxiliary marking past or completion.'],
};
function grammarEntry(word, options) {
  if (!['particle', 'auxiliary'].includes(options.pos)) return null;
  const lines = explanations[word] || [options.pos === 'particle' ? 'grammatical particle' : 'auxiliary / grammatical ending', 'Interpret this together with its surrounding sentence.'];
  return { slug: 'grammar-' + options.pos + '-' + word, source: 'Grammar',
    japanese: [{ word, reading: ({ は: 'わ', を: 'お', へ: 'え' })[word] || word }],
    senses: lines.map(line => ({ english_definitions: [line], parts_of_speech: [options.pos] })) };
}
const key = token => ['particle', 'auxiliary'].includes(token.pos) ? 'grammar:' + token.pos + ':' + token.lemma : token.proper ? token.lemma + ':name:' + token.reading : token.lemma;
module.exports = { grammarEntry, key };
