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
  function coverage(data, start, end) {
    const spans = (
      data?.covered || [[start, start + (data?.processedSeconds || 0)]]
    )
      .map(([a, b]) => [Math.max(start, a), Math.min(end, b)])
      .filter(([a, b]) => Number.isFinite(a) && Number.isFinite(b) && b > a)
      .sort((a, b) => a[0] - b[0]);
    const merged = [];
    for (const span of spans) {
      const last = merged.at(-1);
      if (last && span[0] <= last[1] + 0.001)
        last[1] = Math.max(last[1], span[1]);
      else merged.push(span);
    }
    return merged;
  }
  function missing(covered, start, end) {
    const gaps = [];
    let cursor = start;
    for (const [a, b] of covered) {
      if (a > cursor + 0.001) gaps.push([cursor, a]);
      cursor = Math.max(cursor, b);
    }
    if (cursor < end - 0.001) gaps.push([cursor, end]);
    return gaps;
  }
  function checkpoint(state, start, previous, covered, cues) {
    const data = {
      cues: previous.cues.concat(cues),
      covered,
      processedSeconds: covered.reduce((sum, [a, b]) => sum + b - a, 0),
      pipeline: "mac-whisper-context-v3",
    };
    state.partial.set(start, data);
    write(state, start, data, true);
    return data;
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
        const covered = coverage(previous, start, end),
          gaps = missing(covered, start, end);
        if (!gaps.length) {
          state.complete.set(start, previous);
          write(state, start, previous);
          state.partial.delete(start);
          state.jobs.delete(start);
          fs.rmSync(path.join(state.dir, start + ".partial.json"), {
            force: true,
          });
          continue;
        }
        const focus = Math.max(
          start,
          Math.min(end - 0.001, task.focus ?? start),
        );
        const gap =
          gaps.find(([a, b]) => a <= focus && focus < b) ||
          gaps.find(([a]) => a > focus) ||
          gaps[0];
        const size = task.first ? 12 : 26;
        const left = task.first
          ? Math.max(
              gap[0],
              Math.min(focus - 2, gap[1] - Math.min(size, gap[1] - gap[0])),
            )
          : gap[0];
        const right = Math.min(gap[1], left + size);
        state.jobs.set(start, {
          status: "processing",
          stage: "Preparing subtitles at your position",
          phase: "loading",
        });
        try {
          const cues = await recognize(
            path.join(folder, item.file),
            (progress) => {
              const prepared = Math.max(
                0,
                Math.min(right - left, progress.processedSeconds || 0),
              );
              if (prepared > 0)
                checkpoint(
                  state,
                  start,
                  previous,
                  coverage(
                    { covered: [...covered, [left, left + prepared]] },
                    start,
                    end,
                  ),
                  progress.cues || [],
                );
              state.jobs.set(start, {
                status: "processing",
                stage: progress.stage || "Preparing subtitles ahead",
                phase: progress.phase,
              });
            },
            quality,
            {
              start: left,
              duration: right - left,
              priority: task.first ? 20 : 5,
            },
          );
          const data = checkpoint(
            state,
            start,
            previous,
            coverage({ covered: [...covered, [left, right]] }, start, end),
            cues,
          );
          if (!missing(data.covered, start, end).length) {
            state.complete.set(start, data);
            write(state, start, data);
            state.partial.delete(start);
            state.jobs.delete(start);
            fs.rmSync(path.join(state.dir, start + ".partial.json"), {
              force: true,
            });
          } else {
            if (Math.abs((state.focusStart ?? start) - start) > WINDOW * 2) {
              state.jobs.delete(start);
              continue;
            }
            task.first = false;
            state.jobs.set(start, {
              status: "queued",
              stage: "Preparing subtitles ahead",
            });
            queue.push(task);
          }
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
    state.focusStart = range.start;
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
      queue.unshift({
        id,
        quality,
        start: range.start,
        focus: Number(at) || 0,
        first: true,
      });
      void drain();
    } else if (job.status === "queued") {
      const index = queue.findIndex(
        (t) => t.id === id && t.quality === quality && t.start === range.start,
      );
      if (index >= 0) {
        queue[index].focus = Number(at) || 0;
        queue[index].first = true;
        if (index > 0) queue.unshift(...queue.splice(index, 1));
      }
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
