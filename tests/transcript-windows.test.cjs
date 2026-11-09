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
  let calls = 0;
  const options = setup(t, async (file, progress, quality, range) => {
    calls++;
    assert.equal(range.start, 30000);
    assert.equal(range.duration, 60);
    assert.equal(range.priority, 10);
    const cues = [{ start: 30001, end: 30005, text: "日本語" }];
    progress({ processedSeconds: 30, cues });
    return cues;
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
  assert.equal(restored.cues[0].start, 30001);
  assert.equal(calls, 1);
  assert.equal(restored.preparedMinutes, 1);
});
test("interrupted minute resumes its checkpoint and silent sections finish successfully", async (t) => {
  let calls = 0;
  const options = setup(t, async (file, progress, quality, range) => {
    if (++calls === 1) {
      progress({
        processedSeconds: 30,
        cues: [{ start: 121, end: 125, text: "日本語" }],
      });
      throw Error("interrupted");
    }
    assert.equal(range.start, 150);
    assert.equal(range.duration, 30);
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
