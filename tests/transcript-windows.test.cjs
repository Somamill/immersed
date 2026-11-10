const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs"),
  os = require("node:os"),
  path = require("node:path");
const {
  createTranscriptWindows,
} = require("../desktop/transcript-windows.cjs");
const wait = async (fn) => {
  for (let i = 0; i < 100 && !fn(); i++)
    await new Promise((r) => setTimeout(r, 5));
  assert.ok(fn());
};
function setup(t, recognize) {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), "immersed-windows-"));
  t.after(() => fs.rmSync(folder, { force: true, recursive: true }));
  const get = () => ({ duration: 15 * 3600, file: "book.m4b" });
  return { folder, get, recognize };
}
test("15-hour book recognizes only the requested minute and restores cached global timestamps", async (t) => {
  const ranges = [];
  const options = setup(t, async (file, progress, quality, range) => {
    ranges.push(range);
    assert.ok(range.duration <= 26);
    assert.ok(range.start >= 30000 && range.start + range.duration <= 30060);
    return [
      { start: range.start + 0.1, end: range.start + 0.5, text: "日本語" },
    ];
  });
  const windows = createTranscriptWindows(options);
  windows.start("book", "balanced", 30015);
  await wait(
    () => windows.result("book", "balanced", 30015).status === "ready",
  );
  const restored = createTranscriptWindows(options).result(
    "book",
    "balanced",
    30015,
  );
  assert.equal(restored.rangeStart, 30000);
  assert.equal(restored.cues[0].start, 30000.1);
  assert.equal(ranges[0].start, 30013);
  assert.equal(ranges[0].duration, 12);
  assert.equal(ranges[0].priority, 20);
  assert.equal(
    ranges.reduce((sum, r) => sum + r.duration, 0),
    60,
  );
  assert.equal(restored.preparedMinutes, 1);
});
test("interrupted minute resumes its checkpoint and silent sections finish successfully", async (t) => {
  let calls = 0;
  const options = setup(t, async (file, progress, quality, range) => {
    if (++calls === 1) {
      progress({
        processedSeconds: 8,
        cues: [{ start: 121, end: 125, text: "日本語" }],
      });
      throw Error("interrupted");
    }
    if (calls === 2) assert.equal(range.start, 128);
    return [];
  });
  let windows = createTranscriptWindows(options);
  windows.start("book", "balanced", 120);
  await wait(
    () => windows.result("book", "balanced", 120).status === "unavailable",
  );
  windows = createTranscriptWindows(options);
  windows.start("book", "balanced", 120);
  await wait(() => windows.result("book", "balanced", 120).status === "ready");
  assert.equal(windows.result("book", "balanced", 120).cues.length, 1);
  const silent = createTranscriptWindows(setup(t, async () => []));
  silent.start("silent", "balanced", 3600);
  await wait(
    () => silent.result("silent", "balanced", 3600).status === "ready",
  );
  assert.deepEqual(silent.result("silent", "balanced", 3600).cues, []);
});
test("existing full-book partial work migrates without retranscribing completed minutes", (t) => {
  const windows = createTranscriptWindows(
    setup(t, async () => {
      throw Error("cached");
    }),
  );
  windows.seedProgress("book", "balanced", {
    processedSeconds: 2430,
    cues: [{ start: 2401, end: 2405, text: "日本語" }],
  });
  assert.equal(windows.result("book", "balanced", 2300).status, "ready");
  assert.equal(windows.result("book", "balanced", 2410).processedSeconds, 30);
  assert.equal(windows.result("book", "balanced", 2410).preparedMinutes, 40);
});

test("retry during an active minute keeps its saved checkpoint", async (t) => {
  let finish,
    first = true;
  const options = setup(t, async (_file, progress) => {
    if (!first) return [];
    first = false;
    progress({
      processedSeconds: 8,
      cues: [{ start: 1, end: 2, text: "日本語" }],
    });
    await new Promise((r) => (finish = r));
    return [{ start: 1, end: 2, text: "日本語" }];
  });
  const windows = createTranscriptWindows(options);
  windows.start("book", "balanced", 0);
  assert.equal(windows.result("book", "balanced", 0).processedSeconds, 8);
  windows.start("book", "balanced", 0, true);
  assert.equal(windows.result("book", "balanced", 0).processedSeconds, 8);
  assert.ok(
    fs.existsSync(
      path.join(options.folder, "windows/book/balanced/0.partial.json"),
    ),
  );
  finish();
  await wait(() => windows.result("book", "balanced", 0).status === "ready");
});

test("retry of a legacy full-book cache exposes current-window progress", async (t) => {
  const options = setup(t, async () => []);
  const root = options.folder;
  const folder = path.join(root, ".data/mac-library");
  fs.mkdirSync(folder, { recursive: true });
  fs.writeFileSync(
    path.join(folder, "library.json"),
    JSON.stringify([{ id: "book", duration: 54000, file: "book.m4b" }]),
  );
  fs.writeFileSync(
    path.join(folder, "book-balanced.json"),
    JSON.stringify({ cues: [{ start: 0, end: 1, text: "old" }] }),
  );
  let finish,
    first = true;
  const { createMedia } = require("../desktop/media.cjs");
  const media = createMedia({
    root,
    run: async () => ({}),
    recognize: async () => {
      if (!first) return [];
      first = false;
      await new Promise((r) => (finish = r));
      return [{ start: 30001, end: 30002, text: "new" }];
    },
  });
  assert.equal(media.transcript("book").status, "ready");
  media.start("book", true, "balanced", 30000);
  assert.equal(
    media.transcript("book", "balanced", 30000).status,
    "processing",
  );
  assert.equal(media.transcript("book", "balanced", 30000).phase, "loading");
  finish();
  await wait(
    () => media.transcript("book", "balanced", 30000).status === "ready",
  );
  assert.equal(media.transcript("book", "balanced", 30000).cues[0].text, "new");
});

test("the playhead preview is readable before the rest of the minute completes", async (t) => {
  let calls = 0,
    finish;
  const windows = createTranscriptWindows(
    setup(t, async (file, progress, quality, range) => {
      if (++calls === 1) {
        assert.equal(range.start, 48);
        assert.equal(range.duration, 12);
        return [{ start: 49, end: 52, text: "今の字幕" }];
      }
      if (calls === 2) await new Promise((r) => (finish = r));
      return [];
    }),
  );
  windows.start("book", "balanced", 50);
  await wait(() => !!finish);
  const partial = windows.result("book", "balanced", 50);
  assert.notEqual(partial.status, "ready");
  assert.equal(partial.processedSeconds, 12);
  assert.equal(partial.cues[0].text, "今の字幕");
  finish();
  await wait(() => windows.result("book", "balanced", 50).status === "ready");
});

test("seeking far ahead yields after the current preview and retains the old checkpoint", async (t) => {
  let release;
  const starts = [];
  const windows = createTranscriptWindows(
    setup(t, async (file, progress, quality, range) => {
      starts.push(range.start);
      if (starts.length === 1) await new Promise((r) => (release = r));
      return [];
    }),
  );
  windows.start("book", "balanced", 0);
  windows.start("book", "balanced", 1250);
  release();
  await wait(() => windows.result("book", "balanced", 1250).status === "ready");
  assert.equal(starts[0], 0);
  assert.equal(starts[1], 1248);
  assert.equal(starts.filter((s) => s < 60).length, 1);
  assert.equal(windows.result("book", "balanced", 0).processedSeconds, 12);
});
