/* Bounded local vocabulary history; no inferred mastery from lookup counts. */
(function(root) {
  function record(items, word, now = Date.now()) {
    const old = items.find(item => item.key === word.key);
    const context = !word.url && old?.url ? { url: old.url, time: old.time, sentence: old.sentence, title: old.title } : {};
    return [{ ...old, ...word, ...context, firstSeen: old?.firstSeen || now, lastSeen: now,
      lookups: (old?.lookups || 0) + (!old || now - old.lastSeen > 30000 ? 1 : 0) },
      ...items.filter(item => item.key !== word.key)].slice(0, 100);
  }
  function progress(saved, knowledge) {
    const known = saved.filter(word => knowledge[word.lemma || word.word] === true).length;
    return { saved: saved.length, known, learning: saved.length - known };
  }
  const api = { record, progress };
  if (typeof module === 'object') module.exports = api; else root.ImmersedWordHistory = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
