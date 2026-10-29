import { test, expect } from '@playwright/test';
import { CAPTION_BRIDGE, youtubeUrl } from '../src/youtube';
import { embeddedPlayerSource, swipeAction } from '../src/player';
import { familiarity } from '../src/learning';
import { parseCaptionTrack } from '../src/captions';

test('home offers real YouTube discovery and retains the saved-word library', async ({ page }) => {
  await page.goto('/');
  for (const name of ['Daily life', 'Food', 'Travel', 'Conversation']) await expect(page.getByRole('button', { name, exact: true })).toBeVisible();
  await expect(page.getByText('Device-generated Japanese speech', { exact: false })).toHaveCount(0);
  await expect(page.getByText('Choose something you want to watch.', { exact: true })).toHaveCount(0);
  await expect(page.getByText('JAPANESE SUBTITLES', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Words · 0', exact: true }).click();
  await expect(page.getByText('Your saved words and their original video context will appear here.')).toBeVisible();
});

test('video links normalize safely', () => {
  expect(youtubeUrl('https://youtu.be/M7lc1UVf-VE?si=abc')).toBe('https://m.youtube.com/watch?v=M7lc1UVf-VE&hl=ja');
  expect(youtubeUrl('https://youtube.com/shorts/M7lc1UVf-VE')).toBe('https://m.youtube.com/watch?v=M7lc1UVf-VE&hl=ja');
  expect(youtubeUrl('https://youtube.com.evil.example/watch?v=M7lc1UVf-VE')).toBeNull();
  expect(youtubeUrl('javascript:alert(1)')).toBeNull();
});

test('caption adapter reads player text, pauses, ignores comments, and clears on navigation', async ({ page }) => {
  // Entirely local fixture: no request is sent to YouTube. This exercises the
  // adapter contract, not a claim that live YouTube markup has been verified.
  await page.route('https://m.youtube.com/**', route => route.fulfill({ contentType: 'text/html; charset=utf-8', body: '<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>日本の日常</title><div class="html5-video-player"><video></video><button class="ytp-subtitles-button" aria-pressed="false" onclick="this.setAttribute(&quot;aria-pressed&quot;,&quot;true&quot;)">CC</button><div class="ytp-caption-segment">今日</div><div class="ytp-caption-segment">は公園に行きます。</div></div><div class="comment">NOT A CAPTION</div><ytm-reel-shelf-renderer>Shorts</ytm-reel-shelf-renderer>' }));
  await page.goto('https://m.youtube.com/watch?v=M7lc1UVf-VE');
  await page.evaluate(() => {
    const w = window as unknown as { messages: unknown[]; ReactNativeWebView: { postMessage: (message: string) => void }; pausedByApp: boolean; ytInitialPlayerResponse?: unknown };
    w.messages = [];
    w.ytInitialPlayerResponse = { videoDetails: { videoId: 'M7lc1UVf-VE' }, captions: { playerCaptionsTracklistRenderer: { captionTracks: [
      { languageCode: 'ja', kind: 'asr', baseUrl: 'https://www.youtube.com/api/timedtext?v=M7lc1UVf-VE&name=auto' },
      { languageCode: 'ja', baseUrl: 'https://www.youtube.com/api/timedtext?v=M7lc1UVf-VE&name=manual' },
    ] } } };
    w.ReactNativeWebView = { postMessage: message => w.messages.push(JSON.parse(message)) };
    document.querySelector('video')!.pause = () => { w.pausedByApp = true; };
  });
  await page.addScriptTag({ content: CAPTION_BRIDGE });
  const caption = await page.evaluate(() => (window as unknown as { messages: { type: string; text: string; tokens: { text: string }[] }[] }).messages.find(m => m.type === 'caption'));
  expect(caption?.text).toBe('今日は公園に行きます。');
  const tracks = await page.evaluate(() => (window as unknown as { messages: { type: string; url?: string }[] }).messages.filter(m => m.type === 'captionTrack'));
  expect(tracks).toHaveLength(1);
  expect(tracks[0].url).toContain('name=manual');
  await expect(page.locator('.comment')).toBeVisible();
  await expect(page.locator('ytm-reel-shelf-renderer')).toBeHidden();
  await expect(page.locator('.ytp-subtitles-button')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('[data-immersed-player]')).toHaveCount(0);
  await page.evaluate(() => (window as unknown as { __immersedCommand: (command: string) => void }).__immersedCommand('pause'));
  expect(await page.evaluate(() => (window as unknown as { pausedByApp: boolean }).pausedByApp)).toBe(true);
  await expect(page.locator('.comment')).toBeVisible();
  await page.evaluate(() => { history.pushState({}, '', '/watch?v=OTHER_VIDEO'); document.querySelector('.ytp-caption-segment')!.remove(); });
  await expect.poll(() => page.evaluate(() => (window as unknown as { messages: { type: string }[] }).messages.some(m => m.type === 'reset'))).toBe(true);
});

 test('dictionary settings persist without requiring dictionary imports', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(page.getByText('JMdict · Japanese → English', { exact: true })).toBeVisible();
  await expect(page.getByRole('switch', { name: 'Smart word groups' })).toBeChecked();
  await page.getByRole('switch', { name: 'Smart word groups' }).click();
  await page.reload();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(page.getByRole('switch', { name: 'Smart word groups' })).not.toBeChecked();
});

test('language API uses actual morphology and dictionary data', async ({ request }) => {
  const parsed = await request.get('/api/immersion/analyze?text=' + encodeURIComponent('食べていました。') + '&dictionary=true');
  expect(parsed.ok()).toBeTruthy();
  const { tokens, dictionary } = await parsed.json();
  expect(dictionary['食べる'][0].senses[0].english_definitions).toContain('to eat');
  expect(tokens[0].text).toBe('食べていました');
  expect(tokens[0].lemma).toBe('食べる');
  const dict = await request.get('/api/immersion/dictionary?word=' + encodeURIComponent(tokens[0].lemma));
  expect((await dict.json()).data[0].senses[0].english_definitions).toContain('to eat');
  const invalid = await request.get('/api/immersion/transcribe?videoId=invalid!');
  expect(invalid.status()).toBe(400);
});

test('older saved morpheme settings migrate to smart groups once', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.setItem('immersed.preferences.v1', JSON.stringify({ grouped: false, readings: true, automatic: true })));
  await page.reload();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(page.getByRole('switch', { name: 'Smart word groups' })).toBeChecked();
});

test('timed captions join fragments, normalize line breaks and resolve overlap', () => {
  const cues = parseCaptionTrack({ events: [
    { tStartMs: 0, dDurationMs: 4000, segs: [{ utf8: '日' }, { utf8: '本語\nです。' }] },
    { tStartMs: 2000, dDurationMs: 1000, segs: [{ utf8: '食べました。' }] },
    { tStartMs: 3000, segs: [{ utf8: '\n' }] },
  ] });
  expect(cues).toEqual([{ start: 0, end: 2, text: '日本語 です。' }, { start: 2, end: 3, text: '食べました。' }]);
});

test('JLPT highlighting uses level estimates and explicit personal knowledge', () => {
  expect(familiarity('食べる', 'たべる', 5, {})).toBe('known');
  expect(familiarity('食べる', 'たべる', 5, { '食べる': false })).toBe('unknown');
  expect(familiarity('食べる', 'たべる', 5, { '食べる': true })).toBe('known');
  expect(familiarity('抽象', 'ちゅうしょう', 5, {})).toBe('unknown');
  expect(familiarity('抽象', 'ちゅうしょう', 1, {})).toBe('known');
  expect(familiarity('NOT_IN_ANY_JLPT_LIST', '', 1, {})).toBe('unlisted');
});

test('viewing preferences persist and navigation stays near the bottom', async ({ page }) => {
  await page.goto('/');
  const settingsButton = page.getByRole('button', { name: 'Settings', exact: true });
  const dockBounds = await settingsButton.boundingBox();
  expect(dockBounds!.y).toBeGreaterThan(650);
  await settingsButton.click();
  await expect(page.getByRole('switch', { name: 'AMOLED dark mode' })).toBeChecked();
  await expect(page.getByRole('switch', { name: 'Hide Shorts' })).toBeChecked();
  await page.getByRole('radio', { name: 'Completed N3', exact: true }).click();
  await expect(page.getByRole('radio', { name: 'Completed N3', exact: true })).toBeChecked();
  await page.getByRole('switch', { name: 'Full-screen portrait' }).click();
  await page.getByRole('switch', { name: 'Hide Shorts' }).click();
  await page.reload();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(page.getByRole('radio', { name: 'Completed N3', exact: true })).toBeChecked();
  await expect(page.getByRole('switch', { name: 'Full-screen portrait' })).not.toBeChecked();
  await expect(page.getByRole('switch', { name: 'Hide Shorts' })).not.toBeChecked();
});

test('caption controls ignore hidden video elements without modifying player layout', async ({ page }) => {
  await page.route('https://m.youtube.com/**', route => route.fulfill({ contentType: 'text/html; charset=utf-8', body: '<meta name="viewport" content="width=device-width, initial-scale=1"><video id="hidden" style="display:none"></video><div class="html5-video-player"><video id="visible"></video><div class="ytp-caption-segment">日本語</div></div>' }));
  await page.goto('https://m.youtube.com/watch?v=M7lc1UVf-VE');
  await page.evaluate(() => {
    (window as unknown as { ReactNativeWebView: { postMessage: () => void } }).ReactNativeWebView = { postMessage: () => {} };
    const v = document.querySelector('#visible') as HTMLVideoElement;
    v.pause = () => v.setAttribute('data-paused-by-app', 'yes');
  });
  await page.addScriptTag({ content: CAPTION_BRIDGE });
  await page.evaluate(() => (window as unknown as { __immersedCommand: (command: string) => void }).__immersedCommand('pause'));
  await expect(page.locator('#visible')).toHaveAttribute('data-paused-by-app', 'yes');
  await expect(page.locator('#visible')).toBeVisible();
  await expect(page.locator('[data-immersed-player]')).toHaveCount(0);
  await expect(page.locator('#hidden')).not.toHaveAttribute('data-paused-by-app', 'yes');
});

test('dedicated embedded player requests Japanese captions and identifies the actual host app', () => {
  const source = embeddedPlayerSource('M7lc1UVf-VE', 'host.exp.Exponent');
  const url = new URL(source.uri);
  expect(url.pathname).toBe('/embed/M7lc1UVf-VE');
  expect(url.searchParams.get('cc_load_policy')).toBe('1');
  expect(url.searchParams.get('cc_lang_pref')).toBe('ja');
  expect(source.headers.Referer).toBe('https://host.exp.exponent');
});

test('swipes reject taps/diagonals and select unambiguous player actions', () => {
  expect(swipeAction(5, 3)).toBeNull();
  expect(swipeAction(90, 90)).toBeNull();
  expect(swipeAction(-90, 8)).toBe('forward');
  expect(swipeAction(90, 8)).toBe('backward');
  expect(swipeAction(5, -90)).toBe('portrait');
  expect(swipeAction(5, 90)).toBe('compact');
});

test('portrait playback controls appear for a selected video and automatic subtitles cannot be disabled', async ({ page }) => {
  const attempts: string[] = [];
  await page.route('**/api/immersion/transcribe?**', route => { attempts.push(route.request().url()); return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ status: 'processing' }) }); });
  await page.goto('/');
  await page.evaluate(() => localStorage.setItem('immersed.preferences.v1', JSON.stringify({ schema: 2, grouped: true, automatic: false })));
  await page.reload();
  await page.getByRole('textbox', { name: 'Search Japanese topics or paste a YouTube link' }).fill('https://www.youtube.com/watch?v=M7lc1UVf-VE');
  await page.getByRole('button', { name: 'Go', exact: true }).click();
  const full = await page.getByTestId('video-surface').boundingBox();
  expect(full!.height).toBeGreaterThan(800);
  await page.getByRole('button', { name: 'Reading', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Full screen', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Full screen', exact: true }).click();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(page.getByRole('switch', { name: 'Automatic subtitles' })).toHaveCount(0);
  await expect.poll(() => attempts.length, { timeout: 7000 }).toBeGreaterThan(0);
  await expect(page.getByRole('switch', { name: 'Full-screen portrait' })).toBeChecked();
});

test('horizontal gestures navigate settings and words using the floating dock routes', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.mouse.move(60, 430); await page.mouse.down();
  await page.mouse.move(310, 435, { steps: 12 }); await page.mouse.up();
  await expect(page.getByText('Your words.', { exact: true })).toBeVisible();
  await expect(page).toHaveURL(/panel=words/);
  await page.mouse.move(310, 430); await page.mouse.down();
  await page.mouse.move(60, 435, { steps: 12 }); await page.mouse.up();
  await expect(page.getByText('Settings.', { exact: true })).toBeVisible();
  await expect(page).toHaveURL(/panel=settings/);
});
