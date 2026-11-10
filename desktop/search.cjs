const VALID = /^[A-Za-z0-9_-]{11}$/;
function createSearch({ run, videoInfo, peek = () => null }) {
  const cache = new Map(),
    pending = new Map(),
    queue = [];
  let active = 0;
  function snapshot(job) {
    return {
      items: job.items,
      status: job.remaining ? "checking" : "ready",
      checked: job.items.length - job.remaining,
      total: job.items.length,
    };
  }
  function pump() {
    while (active < 2 && queue.length) {
      const { job, index } = queue.shift();
      active++;
      const item = job.items[index];
      Promise.resolve()
        .then(() => videoInfo(item.id))
        .then((info) => {
          job.items[index] = {
            ...item,
            ...Object.fromEntries(
              Object.entries(info).filter(([, v]) => v != null && v !== ""),
            ),
            checked: true,
          };
        })
        .catch(() => {
          job.items[index] = { ...item, checked: true };
        })
        .finally(() => {
          job.remaining--;
          active--;
          pump();
        });
    }
  }
  async function search(query) {
    const old = cache.get(query);
    if (old && Date.now() - old.time < 300000) return snapshot(old);
    if (pending.has(query)) return pending.get(query);
    const task = (async () => {
      const { stdout } = await run(
        "yt-dlp",
        [
          "--flat-playlist",
          "--skip-download",
          "--no-warnings",
          "--ignore-errors",
          "--socket-timeout",
          "8",
          "--retries",
          "1",
          "--extractor-retries",
          "1",
          "--dump-single-json",
          "ytsearch12:" + query,
        ],
        { timeout: 25000, maxBuffer: 4 * 1024 * 1024 },
      );
      const raw = JSON.parse(stdout),
        seen = new Set();
      const items = (raw.entries || [])
        .filter(
          (e) => e && VALID.test(e.id) && !seen.has(e.id) && seen.add(e.id),
        )
        .map((e) => ({
          id: e.id,
          title: e.title || "YouTube video",
          duration: e.duration || 0,
          channel: e.channel || e.uploader || "",
          thumbnail:
            e.thumbnail ||
            e.thumbnails?.at(-1)?.url ||
            "https://i.ytimg.com/vi/" + e.id + "/hqdefault.jpg",
          isShort: /\/shorts\//.test(e.url || ""),
          language: null,
          ...(peek(e.id) || {}),
          checked: !!peek(e.id),
        }));
      const job = {
        items,
        time: Date.now(),
        remaining: items.filter((x) => !x.checked).length,
      };
      cache.set(query, job);
      if (cache.size > 30) cache.delete(cache.keys().next().value);
      queue.unshift(
        ...items.flatMap((item, index) =>
          item.checked ? [] : [{ job, index }],
        ),
      );
      pump();
      return snapshot(job);
    })().finally(() => pending.delete(query));
    pending.set(query, task);
    return task;
  }
  return { search };
}
module.exports = { createSearch };
