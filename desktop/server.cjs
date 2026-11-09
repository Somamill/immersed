const http = require("node:http"),
  fs = require("node:fs"),
  path = require("node:path"),
  os = require("node:os");
const { execFile, spawn } = require("node:child_process");
const { promisify } = require("node:util");
const { createMedia } = require("./media.cjs");
const { parseYouTubeCaptions } = require("./captions.cjs");
const api = require("../server/middleware.cjs");
const processAbort = new AbortController();
const execute = promisify(execFile);
const run = (file, args, options = {}) =>
    execute(file, args, { ...options, signal: processAbort.signal }),
  root = path.join(__dirname, ".."),
  cache = path.join(
    process.env.IMMERSED_DATA_ROOT || root,
    ".data/mac-transcripts-v2",
  );
fs.mkdirSync(cache, { recursive: true });
const jobs = new Map(),
  validId = (id) => /^[A-Za-z0-9_-]{11}$/.test(id || "");
const json = (res, status, value) => {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(value));
};
const speechChildren = new Set();
let recognitionTail = Promise.resolve();
function recognize(audio, onProgress = () => {}, quality = "balanced") {
  const task = recognitionTail.then(
    () =>
      new Promise((resolve, reject) => {
        const python =
          process.env.IMMERSED_PYTHON || path.join(root, ".venv/bin/python");
        const child = spawn(
          python,
          [path.join(__dirname, "transcribe.py"), audio],
          {
            stdio: ["ignore", "pipe", "pipe"],
            env: { ...process.env, IMMERSED_SPEECH_QUALITY: quality },
          },
        );
        speechChildren.add(child);
        let buffer = "",
          final,
          stderr = "",
          cues = [];
        const timer = setTimeout(() => child.kill("SIGTERM"), 6 * 60 * 60_000);
        child.stdout.setEncoding("utf8");
        child.stderr.setEncoding("utf8");
        child.stderr.on(
          "data",
          (chunk) => (stderr = (stderr + chunk).slice(-2000)),
        );
        child.stdout.on("data", (chunk) => {
          buffer += chunk;
          if (buffer.length > 20 * 1024 * 1024) {
            child.kill();
            return;
          }
          let n;
          while ((n = buffer.indexOf("\n")) >= 0) {
            const line = buffer.slice(0, n);
            buffer = buffer.slice(n + 1);
            try {
              const m = JSON.parse(line);
              if (m.status === "processing" && Array.isArray(m.cues)) {
                cues = m.append ? cues.concat(m.cues) : m.cues;
                onProgress({
                  status: "processing",
                  stage: "Recognizing Japanese speech on this Mac",
                  cues,
                  processedSeconds: m.processedSeconds,
                  duration: m.duration,
                });
              }
              if (m.status === "ready" || m.status === "unavailable") final = m;
            } catch {}
          }
        });
        child.on("error", (e) => {
          clearTimeout(timer);
          reject(e);
        });
        child.on("close", (code) => {
          speechChildren.delete(child);
          clearTimeout(timer);
          if (code || final?.status !== "ready")
            reject(
              Error(
                final?.error || "Speech worker stopped. " + stderr.slice(-180),
              ),
            );
          else resolve(final.cues || cues);
        });
      }),
  );
  recognitionTail = task.catch(() => {});
  return task;
}
const media = createMedia({
  root: process.env.IMMERSED_DATA_ROOT || root,
  run,
  recognize,
});
function state(id, quality = "balanced") {
  const key = id + ":" + quality;
  try {
    return {
      status: "ready",
      source: "generated",
      ...JSON.parse(
        fs.readFileSync(path.join(cache, id + "-" + quality + ".json"), "utf8"),
      ),
    };
  } catch {
    return jobs.get(key) || { status: "idle" };
  }
}
async function transcribe(id, quality = "balanced") {
  const key = id + ":" + quality;
  let folder;
  try {
    folder = fs.mkdtempSync(path.join(os.tmpdir(), "immersed-asr-"));
    await run(
      "yt-dlp",
      [
        "--no-playlist",
        "--no-progress",
        "--ignore-errors",
        "--max-filesize",
        "1G",
        "--write-subs",
        "--sub-langs",
        "ja,ja-JP",
        "--sub-format",
        "json3",
        "-f",
        "bestaudio/best",
        "-o",
        path.join(folder, "audio.%(ext)s"),
        "https://www.youtube.com/watch?v=" + id,
      ],
      { timeout: 10 * 60_000, maxBuffer: 1024 * 1024 },
    );
    const subtitle = fs
      .readdirSync(folder)
      .find((name) => /^audio\.ja(?:-JP)?\.json3$/.test(name));
    if (subtitle) {
      const cues = parseYouTubeCaptions(
        JSON.parse(fs.readFileSync(path.join(folder, subtitle), "utf8")),
      );
      if (cues.length) {
        const result = { cues, source: "youtube" };
        fs.writeFileSync(
          path.join(cache, id + "-" + quality + ".json"),
          JSON.stringify(result),
        );
        jobs.set(key, { status: "ready", ...result });
        return;
      }
    }
    const file = fs
      .readdirSync(folder)
      .find(
        (f) =>
          f.startsWith("audio.") &&
          !f.endsWith(".part") &&
          !f.endsWith(".json3"),
      );
    if (!file) throw Error("Video audio could not be accessed.");
    jobs.set(key, { status: "queued", stage: "Waiting for the speech worker" });
    const cues = await recognize(
      path.join(folder, file),
      (progress) => jobs.set(key, progress),
      quality,
    );
    if (!cues.length) throw Error("No Japanese speech was recognized.");
    fs.writeFileSync(
      path.join(cache, id + "-" + quality + ".json.tmp"),
      JSON.stringify({ cues }),
    );
    fs.renameSync(
      path.join(cache, id + "-" + quality + ".json.tmp"),
      path.join(cache, id + "-" + quality + ".json"),
    );
    jobs.set(key, { status: "ready", cues });
  } catch (e) {
    jobs.set(key, {
      status: "unavailable",
      message: String(e.message).slice(0, 240),
      canRetry: true,
    });
  } finally {
    if (folder) fs.rmSync(folder, { recursive: true, force: true });
  }
}
const searchCache = new Map();
const videoInfoCache = new Map();
let searching = false;
function originalLanguage(info) {
  if (info.original_language) return info.original_language.split("-")[0];
  const orig = Object.keys(info.automatic_captions || {}).find((k) =>
    k.endsWith("-orig"),
  );
  if (orig) return orig.split("-")[0];
  const format = (info.formats || []).find(
    (f) => /original/i.test(f.format_note || "") && f.language,
  );
  return format?.language?.split("-")[0] || null;
}
function publicInfo(e) {
  return {
    id: e.id,
    title: e.title,
    duration: e.duration || 0,
    channel: e.channel || e.uploader || "",
    thumbnail: e.thumbnail,
    language: originalLanguage(e),
    isShort:
      /\/shorts\//.test(e.original_url || e.webpage_url || "") ||
      (e.aspect_ratio > 0 && e.aspect_ratio < 1 && e.duration <= 180),
  };
}
async function videoInfo(id) {
  if (videoInfoCache.has(id)) return videoInfoCache.get(id);
  const { stdout } = await run(
    "yt-dlp",
    [
      "--skip-download",
      "--no-warnings",
      "--dump-single-json",
      "https://www.youtube.com/watch?v=" + id,
    ],
    { timeout: 90000, maxBuffer: 16 * 1024 * 1024 },
  );
  const result = publicInfo(JSON.parse(stdout));
  videoInfoCache.set(id, result);
  if (videoInfoCache.size > 100)
    videoInfoCache.delete(videoInfoCache.keys().next().value);
  return result;
}
async function search(query) {
  const cached = searchCache.get(query);
  if (cached && Date.now() - cached.time < 300000) return cached.data;
  if (searching) throw Error("A search is already running.");
  searching = true;
  try {
    const { stdout } = await run(
      "yt-dlp",
      [
        "--skip-download",
        "--no-warnings",
        "--ignore-errors",
        "--dump-single-json",
        "ytsearch6:" + query,
      ],
      { timeout: 120000, maxBuffer: 32 * 1024 * 1024 },
    );
    const raw = JSON.parse(stdout);
    const data = (raw.entries || [])
      .filter((e) => e && validId(e.id))
      .map((e) => {
        const info = publicInfo(e);
        videoInfoCache.set(e.id, info);
        return info;
      });
    searchCache.set(query, { time: Date.now(), data });
    if (searchCache.size > 30)
      searchCache.delete(searchCache.keys().next().value);
    return data;
  } finally {
    searching = false;
  }
}
async function fallback(req, res) {
  const url = new URL(req.url, "http://127.0.0.1");
  const quality =
    url.searchParams.get("quality") === "accurate" ? "accurate" : "balanced";
  if (!/^(127\.0\.0\.1|localhost)(:\d+)?$/.test(req.headers.host || ""))
    return json(res, 403, { error: "Local access only" });
  if (
    !["GET", "HEAD"].includes(req.method) &&
    req.headers["x-immersed-request"] !== "1"
  )
    return json(res, 403, { error: "Missing local request header" });
  if (
    req.headers.origin &&
    !/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(req.headers.origin)
  )
    return json(res, 403, { error: "Local origin required" });
  if (url.pathname === "/api/desktop/history" && req.method === "GET")
    return json(res, 200, require("../src/version-history.json"));
  if (url.pathname === "/api/desktop/levels" && req.method === "GET")
    return json(res, 200, require("../src/data/jlpt-levels.json"));
  if (url.pathname === "/api/desktop/library" && req.method === "GET")
    return json(res, 200, { items: media.list() });
  if (url.pathname === "/api/desktop/library" && req.method === "DELETE") {
    media.remove(url.searchParams.get("id"));
    return json(res, 200, { removed: true });
  }
  if (url.pathname === "/api/desktop/import" && req.method === "POST") {
    const item = await media.importFile(
      req,
      url.searchParams.get("name") || "",
    );
    return json(res, 201, item);
  }
  if (url.pathname === "/api/desktop/download" && req.method === "POST") {
    const id = url.searchParams.get("videoId");
    if (!validId(id)) return json(res, 400, { error: "Invalid video ID" });
    const item = await media.download(id);
    const transcript = state(id, quality);
    if (transcript.status === "ready") media.seed(item.id, transcript, quality);
    return json(res, 201, item);
  }
  if (
    url.pathname === "/api/desktop/media" &&
    ["GET", "HEAD"].includes(req.method)
  )
    return media.serve(req, res, url.searchParams.get("id"));
  if (url.pathname === "/api/desktop/video-info" && req.method === "GET") {
    const id = url.searchParams.get("videoId");
    if (!validId(id)) return json(res, 400, { error: "Invalid video ID" });
    return json(res, 200, await videoInfo(id));
  }
  if (
    url.pathname === "/api/desktop/local-transcript" &&
    ["GET", "POST"].includes(req.method)
  ) {
    const id = url.searchParams.get("id");
    if (!media.get(id)) return json(res, 404, { error: "Media not found" });
    return json(
      res,
      200,
      req.method === "POST"
        ? media.start(id, url.searchParams.get("retry") === "true", quality)
        : media.transcript(id, quality),
    );
  }
  if (url.pathname === "/api/desktop/search" && req.method === "GET") {
    const query = (url.searchParams.get("query") || "").trim();
    if (!query || query.length > 120)
      return json(res, 400, { error: "Enter up to 120 characters" });
    return json(res, 200, { items: await search(query) });
  }
  if (
    url.pathname === "/api/desktop/transcribe" &&
    ["GET", "POST"].includes(req.method)
  ) {
    const id = url.searchParams.get("videoId"),
      key = id + ":" + quality;
    if (!validId(id)) return json(res, 400, { error: "Invalid video ID" });
    if (
      req.method === "POST" &&
      !["processing", "queued"].includes(jobs.get(key)?.status) &&
      (state(id, quality).status !== "ready" ||
        url.searchParams.get("retry") === "true")
    ) {
      if (
        [...jobs.values()].filter((job) =>
          ["processing", "queued"].includes(job.status),
        ).length >= 3
      )
        return json(res, 429, {
          error:
            "Three videos are already being prepared. Wait for a speech job to finish.",
        });
      jobs.set(key, { status: "processing", stage: "Preparing video audio" });
      void transcribe(id, quality);
    }
    return json(res, 200, state(id, quality));
  }
  if (req.method !== "GET")
    return json(res, 405, { error: "Method not allowed" });
  if (url.pathname === "/" || url.pathname === "/index.html") {
    res.writeHead(200, {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Security-Policy":
        "default-src 'self'; script-src 'self' 'unsafe-inline' https://www.youtube.com; style-src 'self' 'unsafe-inline'; frame-src https://www.youtube.com https://www.youtube-nocookie.com; connect-src 'self'; media-src 'self' blob:; img-src 'self' data: https://i.ytimg.com",
    });
    return fs.createReadStream(path.join(__dirname, "index.html")).pipe(res);
  }
  if (
    ["/shared/preferences-core.js", "/shared/learning-core.js"].includes(
      url.pathname,
    )
  ) {
    res.writeHead(200, { "Content-Type": "application/javascript" });
    return fs
      .createReadStream(path.join(root, "src", path.basename(url.pathname)))
      .pipe(res);
  }
  if (url.pathname === "/study.js" || url.pathname === "/study.css") {
    res.writeHead(200, {
      "Content-Type": url.pathname.endsWith(".js")
        ? "application/javascript"
        : "text/css",
    });
    return fs
      .createReadStream(path.join(__dirname, url.pathname.slice(1)))
      .pipe(res);
  }
  if (url.pathname === "/icon.png") {
    res.writeHead(200, { "Content-Type": "image/png" });
    return fs.createReadStream(path.join(root, "assets/icon.png")).pipe(res);
  }
  return json(res, 404, { error: "Not found" });
}
const handler = api(fallback);
const server = http.createServer((req, res) =>
  Promise.resolve(handler(req, res, () => fallback(req, res))).catch(
    (error) => {
      if (!res.headersSent)
        json(res, 400, { error: String(error.message).slice(0, 240) });
      else res.destroy();
    },
  ),
);
if (require.main === module)
  server.listen(
    Number(process.env.IMMERSED_MAC_PORT || 4765),
    "127.0.0.1",
    () => console.log("immersed. local service ready"),
  );
process.once("SIGTERM", () => {
  processAbort.abort();
  for (const child of speechChildren) child.kill("SIGTERM");
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 1000).unref();
});
module.exports = { server, validId, originalLanguage };
