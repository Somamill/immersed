const { test } = require("node:test"),
  assert = require("node:assert/strict");
const { compare } = require("../desktop/compare.js");
const cue = (start, end, text) => ({ start, end, text });
test("comparison ignores segmentation and punctuation differences", () => {
  assert.deepEqual(
    compare(
      [cue(0, 2, "今日は"), cue(2, 4, "日本語です。")],
      [cue(0, 4, "今日は日本語です?")],
    ),
    [],
  );
});
test("comparison includes speech missing on either side and preserves replay timing", () => {
  const result = compare(
    [cue(0, 2, "日本語"), cue(6, 8, "私")],
    [cue(0, 2, "英語"), cue(3, 4, "追加")],
  );
  assert.equal(result.length, 3);
  assert.equal(result[0].current, "日本語");
  assert.equal(result[0].other, "英語");
  assert.equal(result[1].start, 3);
  assert.equal(result[1].current, "");
  assert.equal(result[2].other, "");
});
test("minute comparison excludes cached neighboring sections", () => {
  assert.deepEqual(
    compare([cue(0, 2, "neighbor"), cue(60, 62, "今")], [cue(60, 62, "今")], {
      start: 60,
      end: 120,
    }),
    [],
  );
});
