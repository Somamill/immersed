const fs = require("node:fs");
const path = require("node:path");
const WINDOW = 60;
function createTranscriptWindows({ folder, get, recognize }) {
  const states = new Map(),
    queue = [];
  let running = false;
  function context(id, quality) {
    const key = id + ":" + quality;
    if (states.has(key)) return states.get(key);
    const dir = path.join(folder, "windows", id, quality);
    fs.mkdirSync(dir, { recursive: true });
    const state = {
      dir,
      complete: new Map(),
      partial: new Map(),
      jobs: new Map(),
    };
    for (const name of fs.readdirSync(dir)) {
      const match = /^(\d+)(\.partial)?\.json$/.exec(name);
      if (!match) continue;
      try {
        const data = JSON.parse(fs.readFileSync(path.join(dir, name), "utf8"));
        if (Array.isArray(data.cues))
          (match[2] ? state.partial : state.complete).set(
            Number(match[1]),
            data,
          );
      } catch {}
    }
    states.set(key, state);
    return state;
  }
  function bounds(item, at) {
    const start =
      Math.floor(
        Math.max(0, Math.min(Number(at) || 0, item.duration - 0.01)) / WINDOW,
      ) * WINDOW;
    return { start, end: Math.min(item.duration, start + WINDOW) };
  }
  function write(state, start, data, partial = false) {
    const file = path.join(
      state.dir,
      start + (partial ? ".partial" : "") + ".json",
    );
    fs.writeFileSync(file + ".tmp", JSON.stringify(data));
    fs.renameSync(file + ".tmp", file);
  }
  function result(id, quality, at = 0) {
    const item = get(id);
    if (!item) throw Error("Media not found");
    const state = context(id, quality),
      range = bounds(item, at),
      job = state.jobs.get(range.start),
      done = state.complete.get(range.start),
      part = state.partial.get(range.start),
      near = [];
    function append(start, data) {
      for (const cue of data.cues) {
        const left = Math.max(start, cue.start),
          right = Math.min(item.duration, start + WINDOW, cue.end);
        if (
          typeof cue.text === "string" &&
          Number.isFinite(left) &&
          Number.isFinite(right) &&
          right > left
        )
          near.push({ ...cue, start: left, end: right });
      }
    }
    for (const [start, data] of state.complete)
      if (start >= range.start - WINDOW && start <= range.start + WINDOW)
        append(start, data);
    for (const [start, data] of state.partial)
      if (
        !state.complete.has(start) &&
        start >= range.start - WINDOW &&
        start <= range.start + WINDOW
      )
        append(start, data);
    const unique = new Map();
    for (const cue of near)
      unique.set([cue.start, cue.end, cue.text].join(":"), cue);
    return {
      status: done ? "ready" : job?.status || "idle",
      ...(job || {}),
      source: "generated",
      windowed: true,
      rangeStart: range.start,
      rangeEnd: range.end,
      bookDuration: item.duration,
      duration: range.end - range.start,
      processedSeconds: done
        ? range.end - range.start
        : part?.processedSeconds || 0,
      cues: [...unique.values()].sort((a, b) => a.start - b.start),
      preparedMinutes: state.complete.size,
      pipeline: done?.pipeline || part?.pipeline || null,
      model:
        quality === "accurate"
          ? "Whisper large-v3 / MLX"
          : "Whisper large-v3-turbo / MLX",
    };
  }
  async function drain() {
    if (running) return;
    running = true;
    try {
      while (queue.length) {
        const task = queue.shift(),
          { id, quality, start } = task,
          item = get(id);
        if (!item) continue;
        const state = context(id, quality),
          end = Math.min(item.duration, start + WINDOW),
          previous = state.partial.get(start) || {
            cues: [],
            processedSeconds: 0,
          };
        const prepared = Math.min(end - start, previous.processedSeconds || 0);
        state.jobs.set(start, {
          status: "processing",
          stage: "Loading the local speech model",
          phase: "loading",
        });
        try {
          const cues =
            prepared >= end - start
              ? []
              : await recognize(
                  path.join(folder, item.file),
                  (progress) => {
                    const checkpoint = {
                      cues: previous.cues.concat(progress.cues || []),
                      processedSeconds:
                        prepared + (progress.processedSeconds || 0),
                      pipeline: "mac-whisper-context-v3",
                    };
                    state.partial.set(start, checkpoint);
                    write(state, start, checkpoint, true);
                    state.jobs.set(start, {
                      status: "processing",
                      stage: progress.stage || "Recognizing this minute",
                      phase: progress.phase,
                    });
                  },
                  quality,
                  {
                    start: start + prepared,
                    duration: end - start - prepared,
                    priority: 10,
                  },
                );
          const final = {
            cues: previous.cues.concat(cues),
            processedSeconds: end - start,
            pipeline: "mac-whisper-context-v3",
          };
          state.complete.set(start, final);
          write(state, start, final);
          state.partial.delete(start);
          fs.rmSync(path.join(state.dir, start + ".partial.json"), {
            force: true,
          });
          state.jobs.delete(start);
        } catch (error) {
          state.jobs.set(start, {
            status: "unavailable",
            message: String(error.message).slice(0, 240),
            canRetry: true,
          });
        }
      }
    } finally {
      running = false;
    }
  }
  function start(id, quality, at = 0, retry = false) {
    const item = get(id);
    if (!item) throw Error("Media not found");
    const state = context(id, quality),
      range = bounds(item, at);
    if (state.complete.has(range.start) && !retry)
      return result(id, quality, at);
    if (retry && state.jobs.get(range.start)?.status === "processing")
      return result(id, quality, at);
    if (retry) {
      state.complete.delete(range.start);
      state.partial.delete(range.start);
      for (const suffix of [".json", ".partial.json"])
        fs.rmSync(path.join(state.dir, range.start + suffix), { force: true });
    }
    // Discard unstarted distant work after a seek. Completed work stays on disk.
    for (let i = queue.length - 1; i >= 0; i--) {
      const pending = queue[i];
      if (
        pending.id === id &&
        pending.quality === quality &&
        Math.abs(pending.start - range.start) > WINDOW * 2
      ) {
        queue.splice(i, 1);
        state.jobs.delete(pending.start);
      }
    }
    const job = state.jobs.get(range.start);
    if (!job || job.status === "unavailable") {
      state.jobs.set(range.start, {
        status: "queued",
        stage: "Preparing the minute at your listening position",
      });
      queue.unshift({ id, quality, start: range.start });
      void drain();
    } else if (job.status === "queued") {
      const index = queue.findIndex(
        (t) => t.id === id && t.quality === quality && t.start === range.start,
      );
      if (index > 0) queue.unshift(...queue.splice(index, 1));
    }
    return result(id, quality, at);
  }
  function seedProgress(id, quality, data) {
    const item = get(id);
    if (!item || !Number.isFinite(data.processedSeconds)) return;
    const state = context(id, quality),
      processed = Math.min(item.duration, data.processedSeconds);
    for (let start = 0; start < processed; start += WINDOW) {
      const end = Math.min(item.duration, start + WINDOW),
        cues = (data.cues || []).filter((c) => c.start < end && c.end > start);
      const done = processed >= end,
        entry = { cues, processedSeconds: Math.min(end, processed) - start };
      (done ? state.complete : state.partial).set(start, entry);
      write(state, start, entry, !done);
    }
  }
  function busy(id) {
    return [...states.entries()].some(
      ([key, state]) =>
        key.startsWith(id + ":") &&
        [...state.jobs.values()].some((j) => j.status === "processing"),
    );
  }
  return { start, result, seedProgress, busy };
}
module.exports = { createTranscriptWindows, WINDOW };
