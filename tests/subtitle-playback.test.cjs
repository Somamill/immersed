const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createBoundary } = require('../desktop/subtitle-playback.js');
const cues = [{ start: 1, end: 2, text: '日本語です。' }, { start: 2, end: 4, text: '次の文です。' }];
test('pauses once per cue, retains adjacent boundaries, and rearms after explicit replay', () => {
  const boundary = createBoundary();
  const sample = (time, playing = true) => boundary.update({ time, playing, enabled: true, cues });
  assert.equal(sample(1.9), null);
  assert.equal(sample(2.05), cues[0]);
  assert.equal(sample(2.05, false), null);
  assert.equal(sample(2.1), null);
  assert.equal(sample(3.9), null); // A large time jump is a seek, not a subtitle completion.
  assert.equal(sample(4.05), cues[1]);
  boundary.reset();
  assert.equal(sample(1.95), null);
  assert.equal(sample(2.05), cues[0]);
});
test('disabled, paused, seek, background stalls, and hover resume never cause phantom pauses', () => {
  const boundary = createBoundary();
  const sample = (time, playing = true, enabled = true) => boundary.update({ time, playing, enabled, cues });
  sample(1.8); assert.equal(sample(1.85, false), null);
  assert.equal(sample(2.1), null);
  sample(1.8); assert.equal(sample(20), null);
  sample(1.8); assert.equal(sample(2.1, true, false), null);
  sample(1.8); assert.equal(sample(.5), null);
  assert.equal(sample(NaN), null);
});
test('crosses short subtitle gaps at double speed without requiring a visible next cue', () => {
  const boundary = createBoundary();
  boundary.update({time:1.9,playing:true,enabled:true,cues,rate:2});
  assert.equal(boundary.update({time:2.2,playing:true,enabled:true,cues,rate:2}),cues[0]);
});
