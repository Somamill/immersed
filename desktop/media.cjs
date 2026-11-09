const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { pipeline } = require("node:stream/promises");
const { Transform } = require("node:stream");
const { createTranscriptWindows } = require("./transcript-windows.cjs");
const ALLOWED = new Set([
  ".mp4",
  ".m4v",
  ".mov",
  ".m4b",
  ".m4a",
  ".mp3",
  ".wav",
  ".aac",
  ".flac",
  ".ogg",
  ".webm",
]);
const TYPES = {
  ".mp4": "video/mp4",
  ".m4v": "video/mp4",
  ".mov": "video/quicktime",
  ".m4b": "audio/mp4",
  ".m4a": "audio/mp4",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".aac": "audio/aac",
  ".flac": "audio/flac",
  ".ogg": "audio/ogg",
  ".webm": "video/webm",
};
function createMedia({ root, run, recognize }) {
  const folder = path.join(root, ".data/mac-library");
  fs.mkdirSync(folder, { recursive: true });
  const manifest = path.join(folder, "library.json");
  let items = [];
  try {
    items = JSON.parse(fs.readFileSync(manifest, "utf8"));
  } catch {
    /* First launch. */
  }
  const jobs = new Map(),
    queue = [];
  let active = false,
    downloading = false;
  const save = () => {
    fs.writeFileSync(manifest + ".tmp", JSON.stringify(items));
    fs.renameSync(manifest + ".tmp", manifest);
  };
  const get = (id) => items.find((x) => x.id === id);
  async function probe(file) {
    const { stdout } = await run(
      "ffprobe",
      [
        "-v",
        "error",
        "-show_format",
        "-show_streams",
        "-show_chapters",
        "-of",
        "json",
        file,
      ],
      { timeout: 30000, maxBuffer: 4 * 1024 * 1024 },
    );
    const data = JSON.parse(stdout);
    if (!data.streams?.some((s) => s.codec_type === "audio"))
      throw Error("This file has no audio track.");
    const duration = Number(data.format?.duration);
    if (!Number.isFinite(duration) || duration <= 0)
      throw Error("The media duration could not be read.");
    return {
      duration,
      kind: data.streams.some(
        (s) => s.codec_type === "video" && !s.disposition?.attached_pic,
      )
        ? "video"
        : "audio",
      chapters: (data.chapters || []).map((c) => ({
        start: Number(c.start_time),
        end: Number(c.end_time),
        title: c.tags?.title || "Chapter",
      })),
    };
  }
  const windows = createTranscriptWindows({ folder, get, recognize });
  const coverTasks = new Map();
  async function artwork(id) {
    const item = get(id);
    if (!item) throw Error("Media not found");
    const target = path.join(folder, id + ".cover.jpg");
    if (fs.existsSync(target)) return target;
    if (fs.existsSync(target + ".missing")) return null;
    if (!coverTasks.has(id))
      coverTasks.set(
        id,
        (async () => {
          try {
            await run(
              "ffmpeg",
              [
                "-v",
                "error",
                "-i",
                path.join(folder, item.file),
                "-map",
                "0:v:0",
                "-frames:v",
                "1",
                "-vf",
                "scale=1024:1024:force_original_aspect_ratio=decrease",
                "-q:v",
                "2",
                "-y",
                target,
              ],
              { timeout: 30000, maxBuffer: 2000 },
            );
            return target;
          } catch {
            fs.rmSync(target, { force: true });
            fs.writeFileSync(target + ".missing", "");
            return null;
          } finally {
            coverTasks.delete(id);
          }
        })(),
      );
    return coverTasks.get(id);
  }
  function progress(id, data) {
    const item = get(id);
    if (!item) throw Error("Media not found");
    if (data) {
      const position = Number(data.position),
        rate = Number(data.rate);
      if (
        !Number.isFinite(position) ||
        position < 0 ||
        position > item.duration + 1
      )
        throw Error("Invalid playback position");
      const chapterIndex = (item.chapters || []).findLastIndex(
        (c) => c.start <= position,
      );
      item.progress = {
        position: Math.min(position, item.duration),
        chapterIndex,
        rate: [0.5, 0.75, 1, 1.25, 1.5, 2].includes(rate) ? rate : 1,
        updatedAt: Date.now(),
      };
      save();
    }
    return item.progress || { position: 0, chapterIndex: 0, rate: 1 };
  }
  function transcript(id, quality = "balanced", at = 0) {
    const active = jobs.get(id + ":" + quality);
    if (
      active &&
      ["processing", "queued", "unavailable"].includes(active.status)
    )
      return active;
    if (get(id)?.duration > 600) {
      const window = windows.result(id, quality, at);
      if (window.status !== "idle" || window.processedSeconds > 0)
        return window;
    }
    const file = path.join(folder, id + "-" + quality + ".json");
    try {
      return { status: "ready", ...JSON.parse(fs.readFileSync(file, "utf8")) };
    } catch {
      return get(id)?.duration > 600
        ? windows.result(id, quality, at)
        : jobs.get(id + ":" + quality) || { status: "idle" };
    }
  }
  async function drain() {
    if (active) return;
    active = true;
    while (queue.length) {
      const { id, quality } = queue.shift(),
        key = id + ":" + quality,
        item = get(id);
      if (!item) continue;
      jobs.set(key, {
        status: "processing",
        stage: "Recognizing Japanese speech",
        cues: [],
      });
      try {
        const cues = await recognize(
          path.join(folder, item.file),
          (progress) => jobs.set(key, progress),
          quality,
        );
        if (!cues.length)
          throw Error(
            "No Japanese speech was recognized. Try another section or check the audio language.",
          );
        const data = {
          cues,
          source: "generated",
          model:
            quality === "accurate"
              ? "Whisper large-v3 / MLX"
              : "Whisper large-v3-turbo / MLX",
          version: 3,
          pipeline: "mac-whisper-context-v3",
          quality,
        };
        fs.writeFileSync(
          path.join(folder, id + "-" + quality + ".json.tmp"),
          JSON.stringify(data),
        );
        fs.renameSync(
          path.join(folder, id + "-" + quality + ".json.tmp"),
          path.join(folder, id + "-" + quality + ".json"),
        );
        jobs.set(key, { status: "ready", ...data });
      } catch (e) {
        jobs.set(key, {
          status: "unavailable",
          message: String(e.message).slice(0, 240),
          canRetry: true,
        });
      }
    }
    active = false;
  }
  function start(id, retry = false, quality = "balanced", at = 0) {
    if (!get(id)) throw Error("Media was not found.");
    const key = id + ":" + quality,
      current = transcript(id, quality, at);
    if (get(id).duration > 600 && (current.windowed || retry))
      return windows.start(id, quality, at, retry);
    if (current.status === "ready" && !retry) return current;
    if (!["processing", "queued"].includes(jobs.get(key)?.status)) {
      if (queue.length >= 20) throw Error("The speech queue is full.");
      jobs.set(key, {
        status: "queued",
        stage: "Waiting for the speech worker",
      });
      queue.push({ id, quality });
      void drain();
    }
    return transcript(id, quality);
  }
  async function importFile(req, name) {
    const ext = path.extname(name).toLowerCase();
    if (!ALLOWED.has(ext))
      throw Error(
        "Choose MP4, MOV, M4B, M4A, MP3, WAV, AAC, FLAC, OGG or WebM.",
      );
    const id = crypto.randomUUID(),
      file = id + ext,
      partial = path.join(folder, file + ".part");
    let bytes = 0;
    try {
      await pipeline(
        req,
        new Transform({
          transform(chunk, encoding, cb) {
            bytes += chunk.length;
            cb(
              bytes > 8 * 1024 ** 3
                ? Error("The file exceeds the 8 GB import limit.")
                : null,
              chunk,
            );
          },
        }),
        fs.createWriteStream(partial, { flags: "wx" }),
      );
      const info = await probe(partial);
      fs.renameSync(partial, path.join(folder, file));
      const item = {
        id,
        file,
        title: path.basename(name).slice(0, 240),
        ...info,
        addedAt: Date.now(),
        source: "local",
      };
      items.unshift(item);
      save();
      return item;
    } catch (e) {
      fs.rmSync(partial, { force: true });
      throw e;
    }
  }
  async function download(videoId) {
    const existing = items.find((x) => x.videoId === videoId);
    if (existing) return existing;
    if (downloading)
      throw Error("A download is already running. Wait for it to finish.");
    downloading = true;
    const id = crypto.randomUUID(),
      output = path.join(folder, id + ".%(ext)s");
    try {
      await run(
        "yt-dlp",
        [
          "--no-playlist",
          "--no-progress",
          "--write-info-json",
          "--max-filesize",
          "2G",
          "-f",
          "bv*[ext=mp4][vcodec^=avc1][height<=1080]+ba[ext=m4a]/b[ext=mp4]/best",
          "--merge-output-format",
          "mp4",
          "-o",
          output,
          "https://www.youtube.com/watch?v=" + videoId,
        ],
        { timeout: 30 * 60_000, maxBuffer: 2 * 1024 * 1024 },
      );
      const file = fs
        .readdirSync(folder)
        .find((f) => f.startsWith(id + ".") && ALLOWED.has(path.extname(f)));
      if (!file) throw Error("No playable file was downloaded.");
      const info = await probe(path.join(folder, file));
      let metadata = {};
      try {
        metadata = JSON.parse(
          fs.readFileSync(path.join(folder, id + ".info.json"), "utf8"),
        );
      } catch {}
      const item = {
        id,
        file,
        videoId,
        title: metadata.title || videoId,
        ...info,
        addedAt: Date.now(),
        source: "youtube",
      };
      items.unshift(item);
      save();
      return item;
    } finally {
      downloading = false;
      for (const f of fs
        .readdirSync(folder)
        .filter(
          (f) => f.startsWith(id + ".") && !items.some((x) => x.file === f),
        ))
        fs.rmSync(path.join(folder, f), { force: true });
    }
  }
  function remove(id) {
    const item = get(id);
    if (!item) throw Error("Media was not found.");
    if (windows.busy(id))
      throw Error(
        "Wait for the current minute to finish before removing this media.",
      );
    if (
      [...jobs.entries()].some(
        ([key, job]) => key.startsWith(id + ":") && job.status === "processing",
      )
    )
      throw Error(
        "Wait for speech recognition to finish before removing this media.",
      );
    for (let i = queue.length - 1; i >= 0; i--)
      if (queue[i].id === id) queue.splice(i, 1);
    items = items.filter((x) => x.id !== id);
    save();
    fs.rmSync(path.join(folder, item.file), { force: true });
    fs.rmSync(path.join(folder, "windows", id), {
      recursive: true,
      force: true,
    });
    for (const suffix of [".cover.jpg", ".cover.jpg.missing"])
      fs.rmSync(path.join(folder, id + suffix), { force: true });
    for (const quality of ["balanced", "accurate"]) {
      fs.rmSync(path.join(folder, id + "-" + quality + ".json"), {
        force: true,
      });
      jobs.delete(id + ":" + quality);
    }
  }
  function seed(id, data, quality = "balanced") {
    if (!get(id) || !Array.isArray(data.cues) || !data.cues.length) return;
    const file = path.join(folder, id + "-" + quality + ".json");
    fs.writeFileSync(
      file + ".tmp",
      JSON.stringify({
        cues: data.cues,
        source: data.source || "generated",
        model: data.model || "cached transcript",
        version: 2,
      }),
    );
    fs.renameSync(file + ".tmp", file);
  }
  function serve(req, res, id) {
    const item = get(id);
    if (!item) {
      res.writeHead(404);
      return res.end();
    }
    const file = path.join(folder, item.file),
      size = fs.statSync(file).size,
      type = TYPES[path.extname(file)] || "application/octet-stream";
    const range = req.headers.range;
    let start = 0,
      end = size - 1,
      status = 200;
    if (range) {
      const m = /^bytes=(\d*)-(\d*)$/.exec(range);
      if (!m || (!m[1] && !m[2])) {
        res.writeHead(416, { "Content-Range": `bytes */${size}` });
        return res.end();
      }
      if (m[1]) {
        start = Number(m[1]);
        if (m[2]) end = Math.min(Number(m[2]), end);
      } else start = Math.max(0, size - Number(m[2]));
      if (!Number.isSafeInteger(start) || start >= size || end < start) {
        res.writeHead(416, { "Content-Range": `bytes */${size}` });
        return res.end();
      }
      status = 206;
    }
    res.writeHead(status, {
      "Content-Type": type,
      "Accept-Ranges": "bytes",
      "Content-Length": end - start + 1,
      ...(status === 206
        ? { "Content-Range": `bytes ${start}-${end}/${size}` }
        : {}),
    });
    if (req.method === "HEAD") return res.end();
    const stream = fs.createReadStream(file, { start, end });
    res.on("close", () => stream.destroy());
    stream.on("error", () => res.destroy());
    stream.pipe(res);
  }
  return {
    seed,
    artwork,
    progress,
    remove,
    list: () =>
      items.map(({ file, ...item }) => ({
        ...item,
        transcript: transcript(item.id).status,
      })),
    get,
    importFile,
    download,
    serve,
    start,
    transcript,
  };
}
module.exports = { createMedia };
