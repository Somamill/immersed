const { test } = require("node:test"),
  assert = require("node:assert/strict");
const { createSearch } = require("../desktop/search.cjs");
test('fast discovery avoids a subprocess and still validates original-language metadata',async()=>{
 let runs=0,finish;const manager=createSearch({run:async()=>{runs++;throw Error('unneeded');},fastSearch:async()=>[{id:'aaaaaaaaaaa',title:'対談',duration:1800}],videoInfo:()=>new Promise(resolve=>{finish=resolve;}),concurrency:4});
 const first=await manager.search('文化');assert.equal(first.items.length,1);assert.equal(first.items[0].language,null);assert.equal(first.hasMore,true);
 finish({language:'ja'});await new Promise(r=>setImmediate(r));assert.equal((await manager.search('文化')).items[0].language,'ja');assert.equal(runs,0);
});
test('page metadata failures retain the yt-dlp fallback',async()=>{
 let runs=0;const manager=createSearch({fastSearch:async()=>{throw Error('changed page');},run:async()=>{runs++;return{stdout:JSON.stringify({entries:[{id:'aaaaaaaaaaa',title:'対談',duration:1800}]})};},videoInfo:async()=>({language:'ja'})});
 assert.equal((await manager.search('文化')).items.length,1);assert.equal(runs,1);
});
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
test("discovery biases retrieval and filters short music/gameplay before checking metadata", async () => {
  let query, inspected = [];
  const manager = createSearch({
    run: async (_, args) => {
      query = args.at(-1);
      return { stdout: JSON.stringify({ entries: [
        { id: "aaaaaaaaaaa", title: "作業用BGM", duration: 7200 },
        { id: "bbbbbbbbbbb", title: "哲学 インタビュー", duration: 2400 },
        { id: "ccccccccccc", title: "日常 会話", duration: 600 },
        { id: "ddddddddddd", title: "音楽について対談", duration: 3600 },
        { id: "eeeeeeeeeee", title: "ゲーム実況", duration: 3600 },
        { id: "fffffffffff", title: "対談 Short", duration: 1800, url: "https://youtube.com/shorts/fffffffffff" },
      ] }) };
    },
    videoInfo: async id => { inspected.push(id); return { language: "ja" }; },
  });
  const result = await manager.search("哲学", { conversation: true, minimumMinutes: 30 });
  assert.match(query, /哲学.*対談/);
  assert.deepEqual(result.items.map(x => x.id), ["bbbbbbbbbbb", "ddddddddddd"]);
  await tick();
  assert.deepEqual(inspected.sort(), ["bbbbbbbbbbb", "ddddddddddd"]);
});
test("different discovery filters have independent caches; broader searches retain music", async () => {
  let calls = 0;
  const manager = createSearch({
    run: async () => { calls++; return { stdout: JSON.stringify({ entries: [
      { id: "aaaaaaaaaaa", title: "作業用BGM", duration: 2000 },
    ] }) }; },
    peek: () => ({ language: "ja" }), videoInfo: async () => ({}),
  });
  assert.equal((await manager.search("音楽", { conversation: true })).items.length, 0);
  assert.equal((await manager.search("音楽", { conversation: false })).items.length, 1);
  await manager.search("音楽", { conversation: true });
  assert.equal(calls, 2);
});
test("discovery requests later result pages without reusing the first page cache", async () => {
  const calls = [];
  const manager = createSearch({run: async (_, args) => {
    calls.push(args);
    return {stdout: JSON.stringify({entries: Array.from({length:18}, (_,i) => ({id:String(i).padStart(11,'a'),duration:1800,title:'対談'}))})};
  }, peek: () => ({language:'ja'}), videoInfo: async()=>({})});
  assert.equal((await manager.search('文化',{page:1})).hasMore,true);
  await manager.search('文化',{page:2});
  assert.equal(calls[1][calls[1].indexOf('--playlist-start')+1],'19');
  assert.match(calls[1].at(-1),/^ytsearch36:/);
  await manager.search('文化',{page:2});
  assert.equal(calls.length,2);
});
test('native discovery retains domestic discussion and hides recognizable learner lessons',()=>{
 const d=require('../desktop/discovery.js');
 const native={title:'【対談】作家と考える社会',channel:'TBS',duration:3600};
 const lesson={title:'Japanese Listening Practice for N3',channel:'日本語ポッドキャスト',duration:3600};
 assert.equal(d.eligible(native,{nativeAudience:true}),true);
 assert.equal(d.eligible(lesson,{nativeAudience:true}),false);
 assert.equal(d.eligible(lesson,{nativeAudience:false}),true);
 assert.match(d.queryFor('社会',{nativeAudience:true,conversation:true}),/-日本語学習/);
 assert.doesNotMatch(d.queryFor('社会',{nativeAudience:true,conversation:true}),/^日本語/);
});
