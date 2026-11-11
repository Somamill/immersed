const test = require('node:test');
const assert = require('node:assert/strict');
const { matchScreenCaption } = require('../server/screen-captions.cjs');
test('visible caption can match a homophone mistake while excluding unrelated video labels', async () => {
  const result = await matchScreenCaption('市場の境界という概念があるんですよ', ['受験競争のメディア史', '「紙の教会」という概念がある']);
  assert.equal(result?.text, '「紙の教会」という概念がある');
  assert.ok(result.score >= 0.68);
  assert.equal(await matchScreenCaption('市場の境界という概念があるんですよ', ['チャンネル登録お願いします']), null);
  assert.equal(await matchScreenCaption('そうです', ['そうです']), null);
});
test('matching tolerates caption line breaks but rejects missing or oversized text', async () => {
  assert.equal((await matchScreenCaption('日本語の文章をゆっくり読んでいます', ['日本語の文章を', 'ゆっくり読んでいます']))?.text, '日本語の文章をゆっくり読んでいます');
  assert.equal(await matchScreenCaption('文章', ['長'.repeat(301)]), null);
  assert.equal(await matchScreenCaption('文章', null), null);
});
test('quoted dictionary compounds recover severe spelling errors only with shared acoustic evidence',async()=>{
 const raw='スループを国為発用っていう本とかで';
 const result=await matchScreenCaption(raw,['それこそ『ルポ 国威発揚』という本で']);
 assert.equal(result?.text,'それこそ『ルポ 国威発揚』という本で');
 assert.equal(result.method,'quoted-dictionary-match');
 assert.equal(await matchScreenCaption(raw,['それこそ『ルポ 国成発揚』という本で']),null);
 assert.equal(await matchScreenCaption(raw,['それこそ『日本経済入門』という本で']),null);
 assert.equal(await matchScreenCaption('近現代史を結構研究されていて',['まったく関係ない商品の広告です']),null);
});
