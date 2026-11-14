const { test } = require('node:test');
const assert = require('node:assert/strict');
const load = () => import('../src/lib/subtitles.ts');
test('SRT handles BOM, CRLF, numeric IDs, and text-only markup', async () => {
 const { parseSubtitles } = await load();
 assert.deepEqual(parseSubtitles('\uFEFF1\r\n00:00:01,000 --> 00:00:03,500\r\n<b>日本語</b> &amp; English\r\n'), [{start:1,end:3.5,text:'日本語 & English'}]);
});
test('VTT accepts cue identifiers and positioning without executing markup', async () => {
 const { parseSubtitles } = await load();
 assert.deepEqual(parseSubtitles('WEBVTT\n\nintro\n00:01.200 --> 00:02.000 align:start\n<v Speaker>こんにちは</v>'), [{start:1.2,end:2,text:'こんにちは'}]);
});
test('invalid timestamps, reversed times, and empty files fail clearly', async () => {
 const { parseSubtitles } = await load();
 for (const text of ['', '00:99:00,000 --> 01:00:00,000\ninvalid', '00:00:03,000 --> 00:00:01,000\ninvalid']) assert.throws(() => parseSubtitles(text), /No timed captions/);
 assert.throws(() => parseSubtitles('a'.repeat(10000001)), /smaller than 10 MB/);
});
test('overlapping cues and gaps use the right playback interval', async () => {
 const { activeCue } = await load();
 const cues=[{start:0,end:10,text:'outer'},{start:2,end:3,text:'inner'},{start:12,end:15,text:'later'}];
 assert.equal(activeCue(cues,2.5),1); assert.equal(activeCue(cues,4),0); assert.equal(activeCue(cues,10),-1); assert.equal(activeCue(cues,12),2);
});
