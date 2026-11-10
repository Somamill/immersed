const { test } = require("node:test"),
  assert = require("node:assert/strict");
const { createSearch } = require("../desktop/search.cjs");
const tick = () => new Promise((r) => setTimeout(r, 5));
test("flat search returns before language checks and publishes results progressively", async () => {
  let finishA,
    finishB,
    calls = 0,
    active = 0,
    peak = 0;
  const manager = createSearch({
    run: async (command, args) => {
      calls++;
      assert.ok(args.includes("--flat-playlist"));
      return {
        stdout: JSON.stringify({
          entries: [
            { id: "aaaaaaaaaaa", title: "First", duration: 100 },
            { id: "bbbbbbbbbbb", title: "Second", duration: 200 },
          ],
        }),
      };
    },
    videoInfo: async (id) => {
      active++;
      peak = Math.max(peak, active);
      await new Promise((r) =>
        id === "aaaaaaaaaaa" ? (finishA = r) : (finishB = r),
      );
      active--;
      return { id, language: id === "aaaaaaaaaaa" ? "ja" : "en" };
    },
  });
  const first = await manager.search("日本語");
  assert.equal(first.status, "checking");
  assert.equal(first.items.length, 2);
  assert.equal(first.checked, 0);
  finishA();
  await tick();
  const partial = await manager.search("日本語");
  assert.equal(partial.checked, 1);
  assert.equal(partial.items[0].language, "ja");
  assert.equal(partial.items[1].language, null);
  finishB();
  await tick();
  assert.equal((await manager.search("日本語")).status, "ready");
  assert.equal(calls, 1);
  assert.ok(peak <= 2);
});
test("search caches confirmed metadata and tolerates individual verification failures", async () => {
  const manager = createSearch({
    run: async () => ({
      stdout: JSON.stringify({
        entries: [
          { id: "aaaaaaaaaaa", title: "Cached" },
          { id: "bbbbbbbbbbb", title: "Denied" },
        ],
      }),
    }),
    peek: (id) => (id === "aaaaaaaaaaa" ? { id, language: "ja" } : null),
    videoInfo: async () => {
      throw Error("metadata unavailable");
    },
  });
  const result = await manager.search("test");
  assert.equal(result.items[0].language, "ja");
  await tick();
  const done = await manager.search("test");
  assert.equal(done.status, "ready");
  assert.equal(done.items[1].language, null);
});
