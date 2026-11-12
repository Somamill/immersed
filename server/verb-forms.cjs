// Recover written verb forms from dictionary-attested lemmas, independently of
// a tokenizer's boundaries. Each lemma must match a dictionary verb class;
// original subtitle spellings and dictionary definitions remain untouched.
const hira = text => text.replace(/[ァ-ヶ]/g, c => String.fromCharCode(c.charCodeAt(0) - 0x60));
function verbForms(surface, index) {
  const rough = /^(.*)じゃ(?:ねえ|ねぇ|ねー)$/u.exec(surface);
  if (rough && /(?:て|で)(?:いる|る|い|ん)$/u.test(rough[1])) return verbForms(rough[1], index).map(c => ({...c, grammar:[...c.grammar, 'rough negative construction: ～じゃない']}));
  const candidates = [];
  function add(form, pos, grammar, written = true) {
    for (const entry of index.get(form) || []) {
      if (!entry.sense.some(s => s.partOfSpeech.some(p => pos.test(p)))) continue;
      const lemma = entry.kanji.find(k => k.text === form)?.text || entry.kanji[0]?.text || form;
      if (!candidates.some(c => c.entry.id === entry.id && c.form === form))
        candidates.push({ entry, form, lemma, grammar, written });
    }
  }
  function recover(text, written) {
    add(text, /^(?:v[1-5]|vk|vs-|vz)/, [], written);
    // A lexical noun such as がってん must not become a guessed inflection.
    if (index.has(text)) return;
    const te = /^(.*)(て|で)(いる|る|い|ん)?$/u.exec(text);
    const past = !te && /^(.*)(た|だ)$/u.exec(text);
    if (te || past) {
      const [, stem, ending, tail] = te || past;
      const grammar = te ? ['て-form'] : ['past'];
      if (tail) grammar.push('て-form construction', 'contracted progressive: ～ている');
      if (tail === 'ん') grammar.push('explanatory の → ん');
      if (tail === 'いる') grammar.splice(grammar.indexOf('contracted progressive: ～ている'), 1);
      const unvoiced = ending === 'て' || ending === 'た';
      if (unvoiced) {
        add(stem + 'る', /^v1(?:-|$)/, grammar, written);
        if (hira(stem.at(-1) || '') === 'っ') {
          for (const [suffix, pos] of [['う', /^v5u/], ['つ', /^v5t/], ['る', /^v5r/], ['く', /^v5k-s$/]])
            add(stem.slice(0, -1) + suffix, pos, grammar, written);
        }
        if (hira(stem.at(-1) || '') === 'い') add(stem.slice(0, -1) + 'く', /^v5k(?!-s)/, grammar, written);
        if (hira(stem.at(-1) || '') === 'し') add(stem.slice(0, -1) + 'す', /^v5s/, grammar, written);
        if (stem === 'し') add('する', /^vs-i$/, grammar, written);
        if (['き', '来'].includes(stem)) add(stem === '来' ? '来る' : 'くる', /^vk$/, grammar, written);
      } else {
        if (hira(stem.at(-1) || '') === 'ん') {
          for (const [suffix, pos] of [['む', /^v5m/], ['ぶ', /^v5b/], ['ぬ', /^v5n/]])
            add(stem.slice(0, -1) + suffix, pos, grammar, written);
        }
        if (hira(stem.at(-1) || '') === 'い') add(stem.slice(0, -1) + 'ぐ', /^v5g/, grammar, written);
      }
    }
    const negative = /^(.*)(なかった|ない|ねえ|ねぇ|ねー)$/u.exec(text);
    if (negative) {
      const [, stem, ending] = negative, grammar = ['negative'];
      if (ending === 'なかった') grammar.push('past');
      if (ending.startsWith('ね')) grammar.push('rough negative: ～ない');
      add(stem + 'る', /^v1(?:-|$)/, grammar, written);
      const row = { わ: ['う', /^v5u/], か: ['く', /^v5k/], が: ['ぐ', /^v5g/], さ: ['す', /^v5s/], た: ['つ', /^v5t/], な: ['ぬ', /^v5n/], ば: ['ぶ', /^v5b/], ま: ['む', /^v5m/], ら: ['る', /^v5r/] }[hira(stem.at(-1) || '')];
      if (row) add(stem.slice(0, -1) + row[0], row[1], grammar, written);
      if (stem === 'し') add('する', /^vs-i$/, grammar, written);
      if (['こ', '来'].includes(stem)) add(stem === '来' ? '来る' : 'くる', /^vk$/, grammar, written);
    }
  }
  recover(surface, true);
  // Preserve an attested mixed-script spelling (シメる), before trying homophones.
  if (!candidates.length && hira(surface) !== surface) recover(hira(surface), false);
  return candidates;
}
module.exports = { verbForms };
