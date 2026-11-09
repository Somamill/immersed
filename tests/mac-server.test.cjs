const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
test("local API rejects cross-origin mutation and invalid media identifiers", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "immersed-api-"));
  process.env.IMMERSED_DATA_ROOT = root;
  const { server, originalLanguage } = require("../desktop/server.cjs");
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  t.after(() => {
    server.close();
    fs.rmSync(root, { recursive: true, force: true });
  });
  const base = "http://127.0.0.1:" + server.address().port;
  assert.equal(
    (
      await fetch(base + "/api/desktop/import?name=x.mp4", {
        method: "POST",
        body: "x",
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await fetch(base + "/api/desktop/import?name=x.mp4", {
        method: "POST",
        headers: {
          "X-Immersed-Request": "1",
          Origin: "https://untrusted.example",
        },
        body: "x",
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await fetch(base + "/api/desktop/download?videoId=../../etc/passwd", {
        method: "POST",
        headers: { "X-Immersed-Request": "1" },
      })
    ).status,
    400,
  );
  assert.equal(
    (await fetch(base + "/api/desktop/local-transcript?id=missing")).status,
    404,
  );
  assert.equal(
    (await (await fetch(base + "/api/desktop/levels")).json())["食べる"],
    5,
  );
  assert.equal(
    originalLanguage({
      original_language: "en",
      automatic_captions: { "ja-orig": [] },
    }),
    "en",
  );
  assert.equal(
    originalLanguage({ automatic_captions: { "ja-orig": [] } }),
    "ja",
  );
  assert.equal(originalLanguage({ language: "ja" }), null);
});
test("supplied Japanese caption parser preserves wording and timing", () => {
  const { parseYouTubeCaptions } = require("../desktop/captions.cjs");
  const cues = parseYouTubeCaptions({
    events: [
      { tStartMs: 1000, dDurationMs: 1500, segs: [{ utf8: "日本語です。" }] },
      { tStartMs: 2500, dDurationMs: 1000, segs: [{ utf8: "次の文。" }] },
      { tStartMs: 5000, segs: [{ utf8: "invalid end" }] },
    ],
  });
  assert.deepEqual(cues, [
    { start: 1, end: 2.5, text: "日本語です。" },
    { start: 2.5, end: 3.5, text: "次の文。" },
  ]);
});
