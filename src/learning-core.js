/* Shared familiarity policy: unlisted words are never assumed difficult. */
(function (root) {
  function familiarity(vocabulary, lemma, reading, completedLevel, overrides) {
    if (Object.prototype.hasOwnProperty.call(overrides, lemma))
      return overrides[lemma] ? "known" : "unknown";
    const level = vocabulary[lemma] || vocabulary[reading];
    return !level ? "unlisted" : level >= completedLevel ? "known" : "unknown";
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
  const api = { familiarity, estimateVocabulary };
  if (typeof module === "object") module.exports = api;
  else root.ImmersedLearning = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
