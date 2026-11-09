/* Compare acoustically overlapping passages, rather than assuming both models
   split the same sentence at the same word. Agreement is not ground truth. */
(function (root) {
  function normalize(text) {
    return text.normalize("NFKC").replace(/[\p{P}\s]/gu, "");
  }
  function compare(current, other, range) {
    const entries = [
      ...current.map((c) => ({ ...c, side: "current" })),
      ...other.map((c) => ({ ...c, side: "other" })),
    ]
      .filter(
        (c) =>
          typeof c.text === "string" &&
          Number.isFinite(c.start) &&
          Number.isFinite(c.end) &&
          c.end > c.start &&
          (!range || (c.end > range.start && c.start < range.end)),
      )
      .sort((a, b) => a.start - b.start || a.end - b.end);
    const groups = [];
    for (const cue of entries) {
      let group = groups.at(-1);
      if (!group || cue.start >= group.end) {
        group = { start: cue.start, end: cue.end, current: [], other: [] };
        groups.push(group);
      }
      group.end = Math.max(group.end, cue.end);
      group[cue.side].push(cue);
    }
    return groups
      .map((group) => ({
        ...group,
        current: group.current.map((c) => c.text).join(""),
        other: group.other.map((c) => c.text).join(""),
      }))
      .filter((group) => normalize(group.current) !== normalize(group.other));
  }
  const api = { compare };
  if (typeof module !== "undefined") module.exports = api;
  else root.ImmersedTranscript = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
