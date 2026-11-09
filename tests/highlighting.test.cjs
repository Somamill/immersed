const { test } = require("node:test");
const assert = require("node:assert/strict");
const { shouldHighlightToken } = require("../src/learning-core");
const levels = require("../src/data/jlpt-levels.json");
test("near-N1 study highlights N1 vocabulary while leaving familiar words and grammar quiet", () => {
  const word = (lemma) => ({ word: true, pos: "noun", lemma, reading: "" });
  assert.equal(shouldHighlightToken(levels, word("政治"), 2, {}), false);
  const n1 = Object.keys(levels).find((key) => levels[key] === 1);
  assert.ok(n1);
  assert.equal(shouldHighlightToken(levels, word(n1), 2, {}), true);
  // Deliberately simulate JLPT homophone collisions from the reported screenshot.
  for (const pos of ["particle", "auxiliary"])
    for (const lemma of ["な", "ん", "よ", "ね", "か"])
      assert.equal(
        shouldHighlightToken({ [lemma]: 1 }, { ...word(lemma), pos }, 2, {}),
        false,
      );
  assert.equal(
    shouldHighlightToken({ 小川: 1 }, { ...word("小川"), proper: true }, 2, {}),
    false,
  );
  assert.equal(shouldHighlightToken(levels, word("未登録test"), 2, {}), false);
  assert.equal(
    shouldHighlightToken(levels, word("体験"), 2, { 体験: false }),
    true,
  );
  assert.equal(
    shouldHighlightToken(levels, word(n1), 2, { [n1]: true }),
    false,
  );
  assert.equal(
    shouldHighlightToken({ な: 1 }, { ...word("な"), pos: "particle" }, 2, {
      な: false,
    }),
    true,
  );
});
