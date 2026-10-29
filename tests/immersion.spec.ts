import { test, expect } from '@playwright/test';
import { CAPTION_BRIDGE, YOUTUBE_BOOTSTRAP, youtubeUrl } from '../src/youtube';
import { embeddedPlayerSource, swipeAction } from '../src/player';
import { familiarity } from '../src/learning';
import { japaneseCaptionUrl, parseCaptionTrack, readingCue } from '../src/captions';
import { automaticRetryDelay } from '../src/subtitle-policy';

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
  await page.route('https://m.youtube.com/**', route => route.fulfill({ contentType: 'text/html; charset=utf-8', body: '<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>日本の日常</title><div id="movie_player" class="html5-video-player"><video></video><button class="ytp-subtitles-button" aria-pressed="false" onclick="this.setAttribute(&quot;aria-pressed&quot;,&quot;true&quot;)">CC</button><div class="caption-window" lang="ja"><div class="ytp-caption-segment">今日</div><div class="ytp-caption-segment">は公園に行きます。</div></div></div><div class="comment">NOT A CAPTION</div><ytm-reel-shelf-renderer>Shorts</ytm-reel-shelf-renderer>' }));
  await page.goto('https://m.youtube.com/watch?v=M7lc1UVf-VE');
  await page.evaluate(() => {
    const w = window as unknown as { messages: unknown[]; ReactNativeWebView: { postMessage: (message: string) => void }; pausedByApp: boolean; ytInitialPlayerResponse?: unknown };
    w.messages = [];
    w.ytInitialPlayerResponse = { videoDetails: { videoId: 'M7lc1UVf-VE' }, captions: { playerCaptionsTracklistRenderer: { captionTracks: [
      { languageCode: 'ja', kind: 'asr', baseUrl: 'https://m.youtube.com/api/timedtext?v=M7lc1UVf-VE&lang=ja&name=auto' },
      { languageCode: 'ja', baseUrl: 'https://m.youtube.com/api/timedtext?v=M7lc1UVf-VE&lang=ja&name=manual' },
    ] } } };
    w.ReactNativeWebView = { postMessage: message => w.messages.push(JSON.parse(message)) };
    (document.getElementById('movie_player') as HTMLElement & { getOption: () => unknown }).getOption = () => ({ languageCode: 'ja' });
    document.querySelector('video')!.pause = () => { w.pausedByApp = true; };
  });
  await page.addScriptTag({ content: CAPTION_BRIDGE });
  const caption = await page.evaluate(() => (window as unknown as { messages: { type: string; text: string; tokens: { text: string }[] }[] }).messages.find(m => m.type === 'caption'));
  expect(caption?.text).toBe('今日は公園に行きます。');
  await expect.poll(() => page.evaluate(() => (window as unknown as { messages: { type: string }[] }).messages.filter(m => m.type === 'captionTrack').length)).toBe(1);
  const tracks = await page.evaluate(() => (window as unknown as { messages: { type: string; url?: string }[] }).messages.filter(m => m.type === 'captionTrack'));
  expect(tracks).toHaveLength(1);
  expect(tracks[0].url).toContain('name=manual');
  await expect(page.locator('.comment')).toBeVisible();
  await expect(page.locator('ytm-reel-shelf-renderer')).toBeHidden();
  await expect(page.locator('.ytp-subtitles-button')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.ytp-caption-segment').first()).toHaveCSS('visibility', 'hidden');
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
  expect(readingCue(cues, 1)?.text).toBe('日本語 です。');
  expect(readingCue(cues, 8)?.text).toBe('食べました。');
  expect(readingCue(cues, 1)?.text).toBe('日本語 です。');
  expect(readingCue(cues, -1)).toBeUndefined();
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
  const browserBounds = await page.getByTestId('video-surface').boundingBox();
  expect(browserBounds!.y + browserBounds!.height).toBe(844);
  await settingsButton.click();
  await expect(page.getByRole('switch', { name: 'AMOLED dark mode' })).toBeChecked();
  await expect(page.getByRole('switch', { name: 'Hide Shorts' })).toBeChecked();
  await page.getByRole('radio', { name: 'Completed N3', exact: true }).click();
  await expect(page.getByRole('radio', { name: 'Completed N3', exact: true })).toBeChecked();
  await expect(page.getByRole('switch', { name: 'Fit entire video' })).toHaveCount(0);
  await page.getByRole('switch', { name: 'Hide Shorts' }).click();
  await page.reload();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(page.getByRole('radio', { name: 'Completed N3', exact: true })).toBeChecked();
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
  expect(swipeAction(5, -90)).toBeNull();
  expect(swipeAction(5, 90)).toBeNull();
});

test('portrait playback controls appear for a selected video and automatic subtitles cannot be disabled', async ({ page }) => {
  const attempts: string[] = [];
  await page.route('**/api/immersion/transcribe?**', route => { attempts.push(route.request().url()); return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ status: 'processing' }) }); });
  await page.goto('/');
  await page.evaluate(() => localStorage.setItem('immersed.preferences.v1', JSON.stringify({ schema: 2, grouped: true, automatic: false })));
  await page.reload();
  await page.getByRole('textbox', { name: 'Search Japanese topics or paste a YouTube link' }).fill('https://www.youtube.com/watch?v=M7lc1UVf-VE');
  await page.getByRole('button', { name: 'Go', exact: true }).click();
  const full = (await page.getByTestId('content-surface').boundingBox())!;
  const video = (await page.getByTestId('video-surface').boundingBox())!;
  const reading = (await page.getByTestId('subtitle-panel').boundingBox())!;
  expect(full.height).toBe(844);
  expect(video.height).toBeGreaterThan(450);
  expect(reading.y).toBe(video.y + video.height);
  expect(reading.x).toBe(0); expect(reading.width).toBe(390);
  expect(reading.y + reading.height).toBe(844);
  await expect(page.getByTestId('subtitle-panel')).toHaveCSS('border-radius', '0px');
  await expect(page.getByTestId('subtitle-panel')).toBeVisible();
  expect((await page.getByTestId('subtitle-panel').boundingBox())!.height).toBeGreaterThanOrEqual(148);
  await expect(page.getByRole('button', { name: 'Reading', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Full screen', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(page.getByRole('switch', { name: 'Automatic subtitles' })).toHaveCount(0);
  await expect.poll(() => attempts.length, { timeout: 7000 }).toBeGreaterThan(0);
  await expect(page.getByRole('switch', { name: 'Fit entire video' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /retry|refresh|original YouTube player/i })).toHaveCount(0);
});

test('a blocked subtitle source shows a passive failure without recovery buttons', async ({ page }) => {
  await page.route('**/api/immersion/transcribe?**', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ status: 'unavailable', reason: 'NETWORK_BLOCKED', canRetry: true, message: 'Audio access blocked.' }) }));
  await page.goto('/');
  await page.getByRole('textbox').fill('https://youtu.be/M7lc1UVf-VE');
  await page.getByRole('button', { name: 'Go', exact: true }).click();
  await expect(page.getByTestId('subtitle-panel')).toBeVisible();
  await expect(page.getByText('Japanese subtitles unavailable', { exact: true })).toBeVisible({ timeout: 7000 });
  await expect(page.getByRole('button', { name: /retry|details|refresh/i })).toHaveCount(0);
});

test('temporary subtitle failures recover automatically without asking the learner', async ({ page }) => {
  const attempts: string[] = [];
  await page.route('**/api/immersion/transcribe?**', route => {
    attempts.push(route.request().url());
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify(attempts.length === 1 ? { status: 'unavailable', reason: 'TRANSCRIPTION_FAILED', canRetry: true } : { status: 'ready', cues: [{ start: 0, end: 2, text: '公園に行きます。' }] }) });
  });
  await page.goto('/');
  await page.getByRole('textbox').fill('https://youtu.be/M7lc1UVf-VE');
  await page.getByRole('button', { name: 'Go', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Look up 公園', exact: true })).toBeVisible({ timeout: 12000 });
  expect(attempts).toHaveLength(2); expect(attempts[1]).toContain('retry=true');
  await expect(page.getByRole('button', { name: /retry|details|refresh/i })).toHaveCount(0);
});

test('automatic recovery is bounded and excludes explicit audio-access denials', () => {
  expect(automaticRetryDelay('TRANSCRIPTION_FAILED', 0)).toBe(1500);
  expect(automaticRetryDelay(undefined, 2)).toBe(15000);
  expect(automaticRetryDelay(undefined, 3)).toBeUndefined();
  for (const reason of ['NETWORK_BLOCKED', 'SOURCE_ACCESS_DENIED', 'SOURCE_RESTRICTED', 'NOT_CONFIGURED']) expect(automaticRetryDelay(reason, 0)).toBeUndefined();
});

test('native track fetching accepts only Japanese source URLs for the selected video', () => {
  const base = 'https://www.youtube.com/api/timedtext?v=M7lc1UVf-VE';
  expect(japaneseCaptionUrl(base + '&lang=ja', 'M7lc1UVf-VE')).not.toBeNull();
  expect(japaneseCaptionUrl(base + '&lang=en', 'M7lc1UVf-VE')).toBeNull();
  expect(japaneseCaptionUrl(base + '&lang=ja&tlang=en', 'M7lc1UVf-VE')).toBeNull();
  expect(japaneseCaptionUrl(base + '&lang=en&tlang=ja', 'M7lc1UVf-VE')).toBeNull();
  expect(japaneseCaptionUrl(base + '&lang=ja', 'dQw4w9WgXcQ')).toBeNull();
});

test('generated captions appear with tappable dictionary words in the combined portrait view', async ({ page }) => {
  await page.route('**/api/immersion/transcribe?**', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ status: 'ready', cues: [{ start: 0, end: 2, text: '食べていました。' }] }) }));
  await page.goto('/');
  await page.getByRole('textbox').fill('https://youtu.be/M7lc1UVf-VE');
  await page.getByRole('button', { name: 'Go', exact: true }).click();
  await page.getByRole('button', { name: 'Look up 食べていました', exact: true }).click({ timeout: 12000 });
  await expect(page.getByText(/^to eat\b/)).toBeVisible();
  await page.getByRole('button', { name: 'Done →', exact: true }).click();
  await expect(page.getByTestId('subtitle-panel')).toBeVisible();
});

test('page-session Japanese tracks load before a video element and are selected explicitly', async ({ page }) => {
  await page.route('https://m.youtube.com/**', route => route.fulfill({ contentType: 'text/html', body: '<div id="movie_player"></div>' }));
  await page.route('https://m.youtube.com/api/timedtext?**', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ events: [{ tStartMs: 1000, dDurationMs: 2000, segs: [{ utf8: '自然な日本語です。' }] }] }) }));
  await page.goto('https://m.youtube.com/watch?v=M7lc1UVf-VE');
  await page.evaluate(() => {
    const w = window as unknown as { messages: unknown[]; ReactNativeWebView: { postMessage: (raw: string) => void }; ytInitialPlayerResponse: unknown };
    w.messages = []; w.ReactNativeWebView = { postMessage: raw => w.messages.push(JSON.parse(raw)) };
    const tracks = [{ languageCode: 'en' }, { languageCode: 'ja', kind: 'asr', baseUrl: 'https://m.youtube.com/api/timedtext?v=M7lc1UVf-VE&lang=ja&kind=asr' }];
    w.ytInitialPlayerResponse = { videoDetails: { videoId: 'M7lc1UVf-VE' }, captions: { playerCaptionsTracklistRenderer: { captionTracks: tracks } } };
    const player = document.getElementById('movie_player') as HTMLElement & { getOption: (module: string, key: string) => unknown; setOption: (module: string, key: string, track: { languageCode: string }) => void };
    player.getOption = (_module, key) => key === 'tracklist' ? tracks : { languageCode: player.dataset.selected || 'en' };
    player.setOption = (_module, _key, track) => { player.dataset.selected = track.languageCode; };
  });
  await page.addScriptTag({ content: CAPTION_BRIDGE });
  await expect(page.locator('#movie_player')).toHaveAttribute('data-selected', 'ja');
  await expect.poll(() => page.evaluate(() => (window as unknown as { messages: { type: string }[] }).messages.filter(m => m.type === 'captionData').length)).toBe(1);
  const data = await page.evaluate(() => (window as unknown as { messages: { type: string; data: unknown }[] }).messages.find(m => m.type === 'captionData')!.data);
  expect(parseCaptionTrack(data)[0].text).toBe('自然な日本語です。');
});

test('portrait fill changes the video itself and YouTube discovery is forced dark', async ({ page }) => {
  await page.route('https://m.youtube.com/**', route => route.fulfill({ contentType: 'text/html', body: '<meta name="viewport" content="width=device-width, initial-scale=1"><style>html,body{margin:0;height:100%;background:white}.html5-video-container{position:relative}video{width:320px;height:180px}</style><div class="html5-video-container"><video class="html5-main-video"></video></div>' }));
  await page.goto('https://m.youtube.com/embed/M7lc1UVf-VE');
  await page.addScriptTag({ content: YOUTUBE_BOOTSTRAP });
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(0, 0, 0)');
  await expect(page.locator('video')).toHaveCSS('object-fit', 'cover');
  expect((await page.locator('video').boundingBox())!.height).toBe(844);
  await page.evaluate(() => { (window as unknown as { __immersedOptions: { fillPortrait: boolean }; __immersedApplyOptions: () => void }).__immersedOptions.fillPortrait = false; (window as unknown as { __immersedApplyOptions: () => void }).__immersedApplyOptions(); });
  await expect(page.locator('html')).not.toHaveAttribute('data-immersed-fill');
  await page.goto('https://m.youtube.com/results?search_query=test');
  await page.addScriptTag({ content: YOUTUBE_BOOTSTRAP });
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(0, 0, 0)');
  await expect(page.locator('html')).toHaveAttribute('dark', '');
});

test('caption interception reads XML from the player and ignores other languages', async ({ page }) => {
  await page.route('https://m.youtube.com/**', route => route.fulfill({ contentType: 'text/html', body: '<div>Local caption fixture</div>' }));
  await page.goto('https://m.youtube.com/watch?v=M7lc1UVf-VE');
  await page.evaluate(() => { const w = window as unknown as { messages: unknown[]; ReactNativeWebView: { postMessage: (raw: string) => void } }; w.messages = []; w.ReactNativeWebView = { postMessage: raw => w.messages.push(JSON.parse(raw)) }; });
  await page.addScriptTag({ content: YOUTUBE_BOOTSTRAP });
  const results = await page.evaluate(() => {
    const w = window as unknown as { __immersedReadCaptionResponse: (url: string, body: string) => boolean; messages: { data: unknown }[] };
    const japanese = w.__immersedReadCaptionResponse('https://m.youtube.com/api/timedtext?v=M7lc1UVf-VE&lang=ja', '<timedtext><body><p t="1000" d="2000"><s>今日</s><s>は散歩です。</s></p></body></timedtext>');
    const english = w.__immersedReadCaptionResponse('https://m.youtube.com/api/timedtext?v=M7lc1UVf-VE&lang=en', '{"events":[]}');
    return { japanese, english, data: w.messages[0].data };
  });
  expect(results.japanese).toBe(true); expect(results.english).toBe(false);
  expect(parseCaptionTrack(results.data)).toEqual([{ start: 1, end: 3, text: '今日は散歩です。' }]);
});

test('unknown, English and English-translated player captions never reach the study area', async ({ page }) => {
  await page.route('https://m.youtube.com/**', route => route.fulfill({ contentType: 'text/html; charset=utf-8', body: '<meta name="viewport" content="width=device-width, initial-scale=1"><div id="movie_player"><video></video><button class="ytp-subtitles-button" aria-pressed="false" onclick="this.dataset.clicked=\'yes\'">CC</button><div class="caption-window" lang="ja"><div class="ytp-caption-segment">Today we visit 東京.</div></div></div>' }));
  await page.goto('https://m.youtube.com/watch?v=M7lc1UVf-VE');
  await page.evaluate(() => {
    const w = window as unknown as { messages: unknown[]; ReactNativeWebView: { postMessage: (raw: string) => void } };
    w.messages = []; w.ReactNativeWebView = { postMessage: raw => w.messages.push(JSON.parse(raw)) };
    const player = document.getElementById('movie_player') as HTMLElement & { getOption: (_module: string, key: string) => unknown };
    player.dataset.language = 'en';
    player.getOption = (_module, key) => key === 'track' ? { languageCode: player.dataset.language, translationLanguage: player.dataset.translation ? { languageCode: player.dataset.translation } : undefined } : [];
  });
  await page.addScriptTag({ content: CAPTION_BRIDGE });
  await expect(page.locator('.ytp-caption-segment')).toHaveCSS('visibility', 'hidden');
  await expect(page.locator('.ytp-subtitles-button')).not.toHaveAttribute('data-clicked');
  expect(await page.evaluate(() => (window as unknown as { messages: { type: string; text?: string }[] }).messages.some(m => m.type === 'caption' && m.text))).toBe(false);
  await page.evaluate(() => { const player = document.getElementById('movie_player')!; player.dataset.language = 'ja'; player.dataset.translation = 'en'; });
  await expect.poll(() => page.evaluate(() => (window as unknown as { messages: { type: string; text?: string }[] }).messages.filter(m => m.type === 'clock').length)).toBeGreaterThan(1);
  expect(await page.evaluate(() => (window as unknown as { messages: { type: string; text?: string }[] }).messages.some(m => m.type === 'caption' && m.text))).toBe(false);
  await page.evaluate(() => { delete document.getElementById('movie_player')!.dataset.translation; document.querySelector('.ytp-caption-segment')!.textContent = '今日は東京に行きます。'; });
  await expect.poll(() => page.evaluate(() => (window as unknown as { messages: { type: string; text?: string; language?: string }[] }).messages.some(m => m.type === 'caption' && m.language === 'ja' && m.text === '今日は東京に行きます。'))).toBe(true);
});

test('switching to Japanese waits for the previous English line to be replaced', async ({ page }) => {
  await page.route('https://m.youtube.com/**', route => route.fulfill({ contentType: 'text/html', body: '<div id="movie_player"><video></video><div class="caption-window" lang="ja"><div class="ytp-caption-segment">The old English line</div></div></div>' }));
  await page.goto('https://m.youtube.com/watch?v=M7lc1UVf-VE');
  await page.evaluate(() => {
    const w = window as unknown as { messages: unknown[]; ReactNativeWebView: { postMessage: (raw: string) => void } }; w.messages = []; w.ReactNativeWebView = { postMessage: raw => w.messages.push(JSON.parse(raw)) };
    const player = document.getElementById('movie_player') as HTMLElement & { getOption: (_module: string, key: string) => unknown; setOption: (_module: string, key: string, track: { languageCode: string }) => void };
    player.getOption = (_module, key) => key === 'tracklist' ? [{ languageCode: 'ja' }] : { languageCode: player.dataset.language || 'en' };
    player.setOption = (_module, _key, track) => { player.dataset.language = track.languageCode; };
  });
  await page.addScriptTag({ content: CAPTION_BRIDGE });
  await expect(page.locator('#movie_player')).toHaveAttribute('data-language', 'ja');
  expect(await page.evaluate(() => (window as unknown as { messages: { text?: string }[] }).messages.some(m => m.text === 'The old English line'))).toBe(false);
  await page.evaluate(() => { document.querySelector('.ytp-caption-segment')!.textContent = '日本語の字幕です。'; });
  await expect.poll(() => page.evaluate(() => (window as unknown as { messages: { text?: string; language?: string }[] }).messages.some(m => m.text === '日本語の字幕です。' && m.language === 'ja'))).toBe(true);
});

test('YouTube browsing removes the duplicate bottom bar and its reserved space', async ({ page }) => {
  await page.route('https://m.youtube.com/**', route => route.fulfill({ contentType: 'text/html', body: '<meta name="viewport" content="width=device-width, initial-scale=1"><style>body{margin:0;padding-bottom:56px}ytm-app{display:block;padding-bottom:56px}ytm-pivot-bar-renderer{display:block;position:fixed;bottom:0;height:56px;width:100%}</style><ytm-app><main>Browse content</main><ytm-pivot-bar-renderer>Home · You</ytm-pivot-bar-renderer></ytm-app>' }));
  await page.goto('https://m.youtube.com/results?search_query=test');
  await page.addScriptTag({ content: YOUTUBE_BOOTSTRAP });
  await expect(page.locator('ytm-pivot-bar-renderer')).toBeHidden();
  await expect(page.locator('body')).toHaveCSS('padding-bottom', '0px');
  await expect(page.locator('ytm-app')).toHaveCSS('padding-bottom', '0px');
  const bounds = (await page.locator('ytm-app').boundingBox())!;
  expect(bounds.y + bounds.height).toBe(844);
});

test('an explicit embedded-player error is reported without navigating to a watch page', async ({ page }) => {
  await page.route('https://m.youtube.com/**', route => route.fulfill({ contentType: 'text/html', body: '<div id="movie_player"><div class="ytp-error-content-wrap">Embedding is disabled</div></div>' }));
  await page.goto('https://m.youtube.com/embed/M7lc1UVf-VE');
  await page.evaluate(() => { const w = window as unknown as { messages: unknown[]; ReactNativeWebView: { postMessage: (raw: string) => void } }; w.messages = []; w.ReactNativeWebView = { postMessage: raw => w.messages.push(JSON.parse(raw)) }; });
  await page.addScriptTag({ content: CAPTION_BRIDGE });
  expect(await page.evaluate(() => (window as unknown as { messages: { type: string; videoId?: string }[] }).messages.filter(m => m.type === 'playerError'))).toEqual([{ type: 'playerError', videoId: 'M7lc1UVf-VE' }]);
  expect(page.url()).toContain('/embed/M7lc1UVf-VE');
});

test('navigation uses large labelled icons with an active state and no visible text tabs', async ({ page }) => {
  await page.goto('/');
  for (const label of ['Browse', 'Words · 0', 'Settings']) {
    const button = page.getByRole('button', { name: label, exact: true });
    await expect(button).toBeVisible();
    await expect(button.locator('svg')).toHaveCount(1);
    expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(48);
    await expect(button).toHaveText('');
  }
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Settings', exact: true })).toHaveAttribute('aria-pressed', 'true');
});

test('a saved Japanese caption track survives reload when transcription is unavailable', async ({ page }) => {
  let calls = 0;
  await page.route('**/api/immersion/transcribe?**', route => {
    calls++;
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify(calls === 1 ? { status: 'ready', cues: [{ start: 0, end: 2, text: '公園に行きます。' }] } : { status: 'unavailable', reason: 'NETWORK_BLOCKED' }) });
  });
  await page.goto('/');
  await page.getByRole('textbox').fill('https://youtu.be/M7lc1UVf-VE');
  await page.getByRole('button', { name: 'Go', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Look up 公園', exact: true })).toBeVisible({ timeout: 10000 });
  await expect.poll(() => page.evaluate(() => localStorage.getItem('immersed.captions.ja.v1.M7lc1UVf-VE'))).not.toBeNull();
  await page.reload();
  await page.getByRole('textbox').fill('https://youtu.be/M7lc1UVf-VE');
  await page.getByRole('button', { name: 'Go', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Look up 公園', exact: true })).toBeVisible();
  await page.clock.install(); await page.clock.fastForward(4000);
  expect(calls).toBe(1);
});

test('the player’s actual timedtext response is captured when a copied caption URL is empty', async ({ page }) => {
  await page.route('https://m.youtube.com/**', route => route.fulfill({ contentType: 'text/html', body: '<div id="movie_player"></div>' }));
  await page.route('https://m.youtube.com/api/timedtext?**', route => route.fulfill({ contentType: 'application/json', body: route.request().url().includes('session=player') ? JSON.stringify({ events: [{ tStartMs: 0, dDurationMs: 3000, segs: [{ utf8: '字幕が届きました。' }] }] }) : '' }));
  await page.goto('https://m.youtube.com/watch?v=M7lc1UVf-VE');
  await page.evaluate(() => { const w = window as unknown as { messages: unknown[]; ReactNativeWebView: { postMessage: (raw: string) => void } }; w.messages = []; w.ReactNativeWebView = { postMessage: raw => w.messages.push(JSON.parse(raw)) }; });
  await page.addScriptTag({ content: YOUTUBE_BOOTSTRAP });
  await page.evaluate(async () => {
    await fetch('/api/timedtext?v=M7lc1UVf-VE&lang=ja');
    await new Promise<void>(resolve => { const xhr = new XMLHttpRequest(); xhr.open('GET', '/api/timedtext?v=M7lc1UVf-VE&lang=ja&session=player'); xhr.onload = () => resolve(); xhr.send(); });
  });
  await expect.poll(() => page.evaluate(() => (window as unknown as { messages: unknown[] }).messages.length)).toBe(1);
  const data = await page.evaluate(() => (window as unknown as { messages: { data: unknown }[] }).messages[0].data);
  expect(parseCaptionTrack(data)[0].text).toBe('字幕が届きました。');
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
