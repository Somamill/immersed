function parseYouTubeCaptions(data) {
  const events = Array.isArray(data?.events) ? data.events : [];
  return events.flatMap((event, index) => {
    const text = (event.segs || [])
      .map((segment) => segment.utf8 || "")
      .join("")
      .replace(/\n+/g, " ")
      .trim();
    const start = Number(event.tStartMs) / 1000;
    const duration = Number(event.dDurationMs) / 1000;
    const next = Number(events[index + 1]?.tStartMs) / 1000;
    const end =
      Number.isFinite(duration) && duration > 0 ? start + duration : next;
    return text &&
      Number.isFinite(start) &&
      start >= 0 &&
      Number.isFinite(end) &&
      end > start
      ? [{ start, end, text }]
      : [];
  });
}
module.exports = { parseYouTubeCaptions };
