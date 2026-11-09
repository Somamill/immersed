const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const http = require("node:http");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");
const { createMedia } = require("../desktop/media.cjs");
const run = promisify(execFile);
test("local M4B import persists chapters, supports byte seeking, and serializes recognition", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "immersed-library-test-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const metadata = path.join(root, "chapters.txt");
  fs.writeFileSync(
    metadata,
    ";FFMETADATA1\n[CHAPTER]\nTIMEBASE=1/1000\nSTART=0\nEND=1000\ntitle=第一章\n",
  );
  const fixture = path.join(root, "book.m4b");
  await run("ffmpeg", [
    "-v",
    "error",
    "-f",
    "lavfi",
    "-i",
    "sine=frequency=440:duration=1",
    "-i",
    metadata,
    "-map_metadata",
    "1",
    "-map_chapters",
    "1",
    "-c:a",
    "aac",
    fixture,
  ]);
  let running = 0,
    peak = 0;
  const media = createMedia({
    root,
    run,
    recognize: async (_file, progress) => {
      running++;
      peak = Math.max(peak, running);
      await new Promise((r) => setTimeout(r, 20));
      const cues = [{ start: 0, end: 1, text: "日本語です。" }];
      progress({ status: "processing", cues });
      running--;
      return cues;
    },
  });
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, "http://localhost");
      if (req.method === "POST") {
        const item = await media.importFile(req, url.searchParams.get("name"));
        res.end(JSON.stringify(item));
      } else media.serve(req, res, url.searchParams.get("id"));
    } catch (e) {
      res.statusCode = 400;
      res.end(e.message);
    }
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  t.after(() => server.close());
  const base = "http://127.0.0.1:" + server.address().port;
  const response = await fetch(base + "/?name=book.m4b", {
    method: "POST",
    body: fs.readFileSync(fixture),
  });
  assert.equal(response.status, 200);
  const item = await response.json();
  assert.equal(item.kind, "audio");
  assert.equal(item.chapters[0].title, "第一章");
  assert.ok(item.duration >= 1);
  const range = await fetch(base + "/?id=" + item.id, {
    headers: { Range: "bytes=0-31" },
  });
  assert.equal(range.status, 206);
  assert.equal((await range.arrayBuffer()).byteLength, 32);
  assert.equal(range.headers.get("content-type"), "audio/mp4");
  const suffix = await fetch(base + "/?id=" + item.id, {
    headers: { Range: "bytes=-12" },
  });
  assert.equal((await suffix.arrayBuffer()).byteLength, 12);
  assert.equal(
    (
      await fetch(base + "/?id=" + item.id, {
        headers: { Range: "bytes=99999999-" },
      })
    ).status,
    416,
  );
  assert.equal((await fetch(base + "/?id=../../etc/passwd")).status, 404);
  const second = await (
    await fetch(base + "/?name=second.m4b", {
      method: "POST",
      body: fs.readFileSync(fixture),
    })
  ).json();
  media.start(item.id);
  media.start(second.id);
  for (
    let i = 0;
    i < 100 && media.transcript(second.id).status !== "ready";
    i++
  )
    await new Promise((r) => setTimeout(r, 10));
  assert.equal(peak, 1);
  assert.equal(media.transcript(item.id).status, "ready");
  assert.equal(media.transcript(second.id).status, "ready");
  const restored = createMedia({
    root,
    run,
    recognize: async () => {
      throw Error("should use cache");
    },
  });
  assert.equal(restored.list().length, 2);
  assert.equal(restored.transcript(item.id).cues[0].text, "日本語です。");
  const bad = await fetch(base + "/?name=bad.mp4", {
    method: "POST",
    body: "not media",
  });
  assert.equal(bad.status, 400);
  assert.equal(media.list().length, 2);
  assert.ok(
    !fs
      .readdirSync(path.join(root, ".data/mac-library"))
      .some((x) => x.endsWith(".part")),
  );
});
test("shared iOS/Mac preference and level policy preserves explicit unknown overrides", () => {
  const { restorePreferences } = require("../src/preferences-core");
  const { familiarity } = require("../src/learning-core");
  const levels = require("../src/data/jlpt-levels.json");
  assert.equal(familiarity(levels, "食べる", "たべる", 5, {}), "known");
  assert.equal(familiarity(levels, "政治", "せいじ", 5, {}), "unknown");
  assert.equal(familiarity(levels, "政治", "せいじ", 1, {}), "known");
  assert.equal(
    familiarity(levels, "食べる", "たべる", 1, { 食べる: false }),
    "unknown",
  );
  assert.equal(familiarity(levels, "未登録test", "", 5, {}), "unlisted");
  const p = restorePreferences({
    level: 99,
    minimumMinutes: 7,
    knowledge: { 食べる: false, bad: "yes" },
    readings: false,
  });
  assert.equal(p.level, 5);
  assert.equal(p.minimumMinutes, 0);
  assert.deepEqual(p.knowledge, { 食べる: false });
  assert.equal(p.readings, false);
});

test("offline download storage reuses existing media, seeds subtitles and removes owned files", async (t) => {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), "immersed-download-test-"),
  );
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const fixture = path.join(root, "fixture.m4a");
  await run("ffmpeg", [
    "-v",
    "error",
    "-f",
    "lavfi",
    "-i",
    "sine=frequency=440:duration=1",
    "-c:a",
    "aac",
    fixture,
  ]);
  let downloads = 0;
  const media = createMedia({
    root,
    recognize: async () => [],
    run: async (command, args, options) => {
      if (command !== "yt-dlp") return run(command, args, options);
      downloads++;
      const output = args[args.indexOf("-o") + 1];
      fs.copyFileSync(fixture, output.replace("%(ext)s", "mp4"));
      fs.writeFileSync(
        output.replace("%(ext)s", "info.json"),
        JSON.stringify({ title: "A downloaded example" }),
      );
      return { stdout: "" };
    },
  });
  const item = await media.download("abcdefghijk");
  assert.equal(item.title, "A downloaded example");
  assert.equal((await media.download("abcdefghijk")).id, item.id);
  assert.equal(downloads, 1);
  media.seed(
    item.id,
    { cues: [{ start: 0, end: 1, text: "日本語です。" }], source: "generated" },
    "accurate",
  );
  assert.equal(media.transcript(item.id, "accurate").status, "ready");
  assert.equal(media.transcript(item.id).status, "idle");
  media.remove(item.id);
  assert.equal(media.list().length, 0);
  assert.equal(
    fs
      .readdirSync(path.join(root, ".data/mac-library"))
      .filter((f) => f !== "library.json").length,
    0,
  );
});
