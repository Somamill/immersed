/* Shared familiarity policy: unlisted words are never assumed difficult. */
(function (root) {
  function familiarity(vocabulary, lemma, reading, completedLevel, overrides) {
    if (Object.prototype.hasOwnProperty.call(overrides, lemma))
      return overrides[lemma] ? "known" : "unknown";
    const level = vocabulary[lemma] || vocabulary[reading];
    return !level ? "unlisted" : level >= completedLevel ? "known" : "unknown";
  }
  function shouldHighlightToken(vocabulary, token, level, knowledge) {
    if (!token.word) return false;
    // Explicit study choices take precedence, including a grammar point the learner chose.
    if (Object.prototype.hasOwnProperty.call(knowledge, token.lemma))
      return !knowledge[token.lemma];
    // Kana grammar forms must not inherit the JLPT rank of an unrelated homophone.
    if (
      token.proper ||
      [
        "particle",
        "auxiliary",
        "punctuation",
        "symbol",
        "unparsed",
        "prefix",
        "interjection",
      ].includes(token.pos) ||
      ["非自立", "接尾", "代名詞"].includes(token.detail)
    )
      return false;
    return (
      familiarity(vocabulary, token.lemma, token.reading, level, knowledge) ===
      "unknown"
    );
  }
  function estimateVocabulary(vocabulary, tokens, level, knowledge) {
    let known = 0,
      unknown = 0,
      unrated = 0;
    for (const token of tokens) {
      if (!token.word || ["particle", "auxiliary"].includes(token.pos))
        continue;
      const state = familiarity(
        vocabulary,
        token.lemma,
        token.reading,
        level,
        knowledge,
      );
      if (state === "known") known++;
      else if (state === "unknown") unknown++;
      else unrated++;
    }
    const total = known + unknown + unrated;
    return total
      ? {
          known,
          unknown,
          unrated,
          total,
          lower: Math.round((100 * known) / total),
          upper: Math.round((100 * (known + unrated)) / total),
        }
      : null;
  }
  const api = { familiarity, estimateVocabulary, shouldHighlightToken };
  if (typeof module === "object") module.exports = api;
  else root.ImmersedLearning = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
