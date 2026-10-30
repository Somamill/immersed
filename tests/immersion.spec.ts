import { preserveCaptionTokens } from '../src/subtitle-tokens';
import { test, expect } from '@playwright/test';
import { refineCaptionTrack } from '../src/caption-reflow';
import { accentHeights, accentMorae } from '../src/pitch';
import { restorePreferences } from '../src/preferences';
import { estimateVocabulary, sampleCaptionVocabulary } from '../src/coverage';
import type { AnalyzedToken } from '../src/language';
import { CAPTION_BRIDGE, YOUTUBE_BOOTSTRAP, isYouTubeSignInUrl, youtubeUrl } from '../src/youtube';
import { embeddedPlayerSource, swipeAction } from '../src/player';
import { familiarity, showFurigana } from '../src/learning';
import { combineCaptionTracks, readingTimeline, japaneseCaptionUrl, parseCaptionTrack, readingCue, normalizeJapaneseCaption, captionSourceRank, sentenceTarget } from '../src/captions';
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

test('only trusted HTTPS YouTube account links are classified as sign-in requests', () => {
  expect(isYouTubeSignInUrl('https://m.youtube.com/signin?next=%2F')).toBe(true);
  expect(isYouTubeSignInUrl('https://accounts.google.com/ServiceLogin?service=youtube')).toBe(true);
  expect(isYouTubeSignInUrl('https://accounts.youtube.com/accounts/ServiceLogin')).toBe(true);
  expect(isYouTubeSignInUrl('https://accounts.google.com.evil.example/ServiceLogin')).toBe(false);
  expect(isYouTubeSignInUrl('https://m.youtube.com/watch?v=M7lc1UVf-VE')).toBe(false);
  expect(isYouTubeSignInUrl('http://accounts.google.com/ServiceLogin')).toBe(false);
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
    Object.defineProperty(document.querySelector('video')!, 'paused', { get: () => false });
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
  await expect(page.locator('.ytp-subtitles-button')).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('.ytp-caption-segment').first()).toHaveCSS('visibility', 'hidden');
  await expect(page.locator('[data-immersed-player]')).toHaveCount(0);
  await page.evaluate(() => (window as unknown as { __immersedCommand: (command: string) => void }).__immersedCommand('pause'));
  expect(await page.evaluate(() => (window as unknown as { pausedByApp: boolean }).pausedByApp)).toBe(true);
  await expect(page.locator('.comment')).toBeVisible();
  await page.evaluate(() => { history.pushState({}, '', '/watch?v=OTHER_VIDEO'); document.querySelector('.ytp-caption-segment')!.remove(); });
  await expect.poll(() => page.evaluate(() => (window as unknown as { messages: { type: string }[] }).messages.some(m => m.type === 'reset'))).toBe(true);
});

test('learning has no off switches, sign-in button or exposed dictionary setup', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(page.getByRole('switch', { name: /Smart word groups|AMOLED/ })).toHaveCount(0);
  await expect(page.getByRole('switch', { name: 'Furigana', exact: true })).toBeChecked();
  await expect(page.getByRole('button', { name: /Google|sign.in/i })).toHaveCount(0);
  await expect(page.getByText('Dictionary & credits', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('switch', { name: 'Dark mode', exact: true })).toBeChecked();
  await page.getByRole('switch', { name: 'Dark mode', exact: true }).click();
  await page.reload();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(page.getByRole('switch', { name: 'Dark mode', exact: true })).not.toBeChecked();
  await page.getByRole('button', { name: 'About', exact: true }).click();
  await expect(page.getByText('Dictionary & credits', { exact: true })).toBeVisible();
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

test('old disabled grouping and readings still produce grouped tappable grammar', async ({ page }) => {
  await page.route('**/api/immersion/transcribe?**', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ status: 'ready', cues: [{ start: 0, end: 3, text: '食べていました。' }] }) }));
  await page.goto('/');
  await page.evaluate(() => localStorage.setItem('immersed.preferences.v1', JSON.stringify({ schema: 2, grouped: false, readings: false })));
  await page.reload();
  await page.getByRole('textbox', { name: 'Search Japanese topics or paste a YouTube link' }).fill('https://youtu.be/M7lc1UVf-VE');
  await page.getByRole('button', { name: 'Go', exact: true }).click();
  const word = page.getByRole('button', { name: 'Look up 食べていました', exact: true });
  await expect(word).toBeVisible({ timeout: 10000 });
  await expect(word).not.toContainText('たべていました');
  await word.click();
  await expect(page.getByText(/て-form construction.*polite.*past/)).toBeVisible();
});

test('timed captions join fragments, normalize line breaks and resolve overlap', () => {
  const cues = parseCaptionTrack({ events: [
    { tStartMs: 0, dDurationMs: 4000, segs: [{ utf8: '日' }, { utf8: '本語\nです。' }] },
    { tStartMs: 2000, dDurationMs: 1000, segs: [{ utf8: '食べました。' }] },
    { tStartMs: 3000, segs: [{ utf8: '\n' }] },
  ] });
  expect(cues).toEqual([{ start: 0, end: 2, text: '日本語です。' }, { start: 2, end: 3, text: '食べました。', hardEnd: true }]);
  expect(readingCue(cues, 1)?.text).toBe('日本語です。');
  expect(readingCue(cues, 8)).toBeUndefined();
  expect(readingCue(cues, 2)?.text).toBe('食べました。');
  expect(readingCue(cues, 3)).toBeUndefined();
  expect(readingCue(cues, 1)?.text).toBe('日本語です。');
  expect(readingCue(cues, -1)).toBeUndefined();
});

test('JLPT highlighting uses level estimates and explicit personal knowledge', () => {
  expect(familiarity('食べる', 'たべる', 5, {})).toBe('known');
  expect(familiarity('食べる', 'たべる', 5, { '食べる': false })).toBe('unknown');
  expect(familiarity('食べる', 'たべる', 5, { '食べる': true })).toBe('known');
  expect(familiarity('抽象', 'ちゅうしょう', 5, {})).toBe('unknown');
  expect(familiarity('抽象', 'ちゅうしょう', 1, {})).toBe('known');
  expect(familiarity('NOT_IN_ANY_JLPT_LIST', '', 1, {})).toBe('unlisted');
  expect(showFurigana('愛想', 'あいそ', 2, {}, true)).toBe(true);
  expect(showFurigana('抽象', 'ちゅうしょう', 2, {}, true)).toBe(false);
  expect(showFurigana('食べる', 'たべる', 2, {}, true)).toBe(false);
  expect(showFurigana('愛想', 'あいそ', 2, {}, false)).toBe(false);
  expect(showFurigana('愛想', 'あいそ', 2, { '愛想': true }, true)).toBe(false);
  expect(showFurigana('NOT_IN_ANY_JLPT_LIST', '', 2, {}, true)).toBe(false);
});

test('Japanese caption normalization preserves Latin word spaces and rolling append timing', () => {
  expect(normalizeJapaneseCaption('日本 語\nです。')).toBe('日本語です。');
  expect(normalizeJapaneseCaption('YouTube Premium を見る')).toBe('YouTube Premium を見る');
  const cues = parseCaptionTrack({ events: [
    { tStartMs: 0, dDurationMs: 3000, wWinId: 1, segs: [{ utf8: '日' }] },
    { tStartMs: 500, dDurationMs: 2000, wWinId: 1, aAppend: 1, segs: [{ utf8: '本語です。' }] },
    { tStartMs: 1200, wWinId: 1, segs: [{ utf8: '' }] },
  ] });
  expect(readingCue(cues, 0.1)?.text).toBe('日');
  expect(readingCue(cues, 0.6)?.text).toBe('日本語です。');
  expect(readingCue(cues, 1.3)).toBeUndefined();
  expect(captionSourceRank('human')).toBeGreaterThan(captionSourceRank('youtube-asr'));
  expect(captionSourceRank('youtube-asr')).toBeGreaterThan(captionSourceRank('unknown'));
});

test('viewing preferences persist and navigation stays near the bottom', async ({ page }) => {
  await page.goto('/');
  const settingsButton = page.getByRole('button', { name: 'Settings', exact: true });
  const dockBounds = await settingsButton.boundingBox();
  expect(dockBounds!.y).toBeGreaterThan(650);
  const browserBounds = await page.getByTestId('video-surface').boundingBox();
  expect(browserBounds!.y + browserBounds!.height).toBe(844);
  await settingsButton.click();
  await expect(page.getByRole('switch', { name: 'Dark mode' })).toBeChecked();
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
    Object.defineProperty(v, 'paused', { get: () => false });
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
  expect(url.searchParams.get('controls')).toBe('0');
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
  expect(video.height).toBeGreaterThanOrEqual(video.width * 9 / 16);
  expect(reading.y).toBe(video.y + video.height);
  expect(reading.x).toBe(0); expect(reading.width).toBe(390);
  expect(reading.y + reading.height).toBe(844);
  await expect(page.getByTestId('subtitle-panel')).toHaveCSS('border-radius', '0px');
  await expect(page.getByTestId('subtitle-panel')).toBeVisible();
  await expect(page.getByText('JAPANESE SUBTITLES', { exact: true })).toHaveCount(0);
  expect((await page.getByTestId('subtitle-panel').boundingBox())!.height).toBeGreaterThanOrEqual(148);
  await expect(page.getByRole('button', { name: 'Reading', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Full screen', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(page.getByRole('switch', { name: 'Automatic subtitles' })).toHaveCount(0);
  await expect.poll(() => attempts.length, { timeout: 7000 }).toBeGreaterThan(0);
  await expect(page.getByRole('switch', { name: 'Fit entire video' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /retry|refresh|original YouTube player/i })).toHaveCount(0);
});

test('the glass dock supports back/forward swipes while watching', async ({ page }) => {
  await page.route('**/api/immersion/transcribe?**', route => route.fulfill({ contentType: 'application/json', body: '{"status":"processing"}' }));
  await page.goto('/');
  await page.getByRole('textbox', { name: 'Search Japanese topics or paste a YouTube link' }).fill('https://youtu.be/M7lc1UVf-VE');
  await page.getByRole('button', { name: 'Go', exact: true }).click();
  const dock = (await page.getByTestId('navigation-dock').boundingBox())!;
  await page.mouse.move(dock.x + dock.width - 20, dock.y + 25); await page.mouse.down();
  await page.mouse.move(dock.x + 20, dock.y + 25, { steps: 12 }); await page.mouse.up();
  await expect(page.getByText('Words.', { exact: true })).toBeVisible();
  await page.mouse.move(dock.x + 20, dock.y + 25); await page.mouse.down();
  await page.mouse.move(dock.x + dock.width - 20, dock.y + 25, { steps: 12 }); await page.mouse.up();
  await expect(page.getByText('Words.', { exact: true })).toHaveCount(0);
  await expect(page.getByTestId('subtitle-panel')).toBeVisible();
});

test('About is separated from the settings controls', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  const shorts = (await page.getByRole('switch', { name: 'Hide Shorts', exact: true }).boundingBox())!;
  const about = (await page.getByRole('button', { name: 'About', exact: true }).boundingBox())!;
  expect(about.y - shorts.y - shorts.height).toBeGreaterThan(16);
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
  await page.getByText(/^to eat\b/).click();
  await expect(page.getByTestId('dictionary-sheet')).toHaveCount(0);
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
  await expect.poll(() => page.evaluate(() => (window as unknown as { messages: { type: string }[] }).messages.some(m => m.type === 'captionData' && (m as { source?: string }).source === 'youtube-asr'))).toBe(true);
  const data = await page.evaluate(() => (window as unknown as { messages: { type: string; data: unknown }[] }).messages.find(m => m.type === 'captionData')!.data);
  expect(parseCaptionTrack(data)[0].text).toBe('自然な日本語です。');
});

test('portrait fill changes the video itself and YouTube discovery is forced dark', async ({ page }) => {
  await page.route('https://m.youtube.com/**', route => route.fulfill({ contentType: 'text/html', body: '<meta name="viewport" content="width=device-width, initial-scale=1"><style>html,body{margin:0;height:100%;background:white}.html5-video-container{position:relative}video{width:320px;height:180px}</style><div class="html5-video-container"><video class="html5-main-video"></video></div>' }));
  await page.goto('https://m.youtube.com/embed/M7lc1UVf-VE');
  await page.addScriptTag({ content: YOUTUBE_BOOTSTRAP });
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(0, 0, 0)');
  await expect(page.locator('video')).toHaveCSS('object-fit', 'contain');
  await page.evaluate(() => { const w = window as unknown as { __immersedOptions: { fillPortrait: boolean }; __immersedApplyOptions: () => void }; w.__immersedOptions.fillPortrait = true; w.__immersedApplyOptions(); });
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

test('the dock hugs its icons instead of spanning the screen', async ({ page }) => {
  await page.goto('/');
  const dock = (await page.getByTestId('navigation-dock').boundingBox())!;
  const first = (await page.getByRole('button', { name: 'Browse', exact: true }).boundingBox())!;
  const last = (await page.getByRole('button', { name: 'Settings', exact: true }).boundingBox())!;
  expect(dock.width).toBeLessThan(220);
  expect(first.width).toBeGreaterThanOrEqual(44);
  expect(last.width).toBeGreaterThanOrEqual(44);
  expect(Math.abs(dock.x + dock.width / 2 - 195)).toBeLessThan(1);
  expect(first.x - dock.x).toBeLessThanOrEqual(8);
  expect(dock.x + dock.width - last.x - last.width).toBeLessThanOrEqual(8);
});

test('N2 furigana shows N1 readings only and can be turned off without disabling lookup', async ({ page }) => {
  await page.route('**/api/immersion/transcribe?**', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ status: 'ready', cues: [{ start: 0, end: 10, text: '愛想、抽象。食べる。' }] }) }));
  await page.goto('/');
  await page.evaluate(() => localStorage.setItem('immersed.preferences.v1', JSON.stringify({ schema: 2, level: 2, readings: true })));
  await page.reload();
  await page.getByRole('textbox', { name: 'Search Japanese topics or paste a YouTube link' }).fill('https://youtu.be/M7lc1UVf-VE');
  await page.getByRole('button', { name: 'Go', exact: true }).click();
  await expect(page.getByTestId('furigana-愛想')).toBeVisible({ timeout: 10000 });
  await expect(page.getByTestId('furigana-抽象')).toHaveCount(0);
  await expect(page.getByTestId('furigana-食べる')).toHaveCount(0);
  await expect(page.getByTestId('subtitle-words')).toHaveCSS('justify-content', 'center');
  await expect(page.getByText('愛想', { exact: true })).toHaveCSS('color', 'rgb(243, 243, 243)');
  await expect(page.getByTestId('unknown-愛想')).toBeVisible();
  await expect(page.getByTestId('unknown-抽象')).toHaveCount(0);
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('switch', { name: 'Furigana', exact: true }).click();
  await page.getByRole('button', { name: 'Watch & read', exact: true }).click();
  await expect(page.getByTestId('furigana-愛想')).toHaveCount(0);
  await page.getByRole('button', { name: 'Look up 愛想', exact: true }).click();
  await expect(page.getByTestId('dictionary-sheet')).toBeVisible();
  await page.getByRole('switch', { name: 'Known word', exact: true }).check();
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(page.getByTestId('unknown-愛想')).toHaveCount(0);
  await expect(page.getByText('愛想', { exact: true })).toHaveCSS('color', 'rgb(243, 243, 243)');
});

test('JavaScript-only YouTube watch navigation is reported even before a video exists', async ({ page }) => {
  await page.route('https://m.youtube.com/**', route => route.fulfill({ contentType: 'text/html', body: '<div>Search results</div>' }));
  await page.goto('https://m.youtube.com/results?search_query=test');
  await page.evaluate(() => { const w = window as unknown as { messages: unknown[]; ReactNativeWebView: { postMessage: (raw: string) => void } }; w.messages = []; w.ReactNativeWebView = { postMessage: raw => w.messages.push(JSON.parse(raw)) }; });
  await page.addScriptTag({ content: CAPTION_BRIDGE });
  await page.evaluate(() => history.pushState({}, '', '/watch?v=M7lc1UVf-VE'));
  await expect.poll(() => page.evaluate(() => (window as unknown as { messages: { type: string; url?: string }[] }).messages.some(m => m.type === 'page' && m.url === 'https://m.youtube.com/watch?v=M7lc1UVf-VE'))).toBe(true);
});

test('Words searches English and Japanese without showing dictionary setup', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Words · 0', exact: true }).click();
  const input = page.getByRole('textbox', { name: 'Search English or Japanese words' });
  await input.fill('eat');
  await expect(page.getByText('English → Japanese', { exact: true })).toBeVisible();
  await expect(page.getByText('食べる', { exact: true }).first()).toBeVisible({ timeout: 15000 });
  await input.fill('食べる');
  await expect(page.getByText('Japanese → English', { exact: true })).toBeVisible();
  await expect(page.getByText(/^to eat\b/).first()).toBeVisible();
  await expect(page.getByText(/JMdict|EDRDG/)).toHaveCount(0);
});

test('video frame timestamps drive captions and seek/pause events refresh immediately', async ({ page }) => {
  await page.route('https://m.youtube.com/**', route => route.fulfill({ contentType: 'text/html', body: '<video></video>' }));
  await page.goto('https://m.youtube.com/embed/M7lc1UVf-VE');
  await page.clock.install();
  await page.evaluate(() => {
    const w = window as unknown as { messages: unknown[]; nextFrame: (now: number, metadata: { mediaTime: number }) => void; ReactNativeWebView: { postMessage: (raw: string) => void } };
    w.messages = []; w.ReactNativeWebView = { postMessage: raw => w.messages.push(JSON.parse(raw)) };
    const video = document.querySelector('video')!;
    Object.defineProperty(video, 'currentTime', { configurable: true, get: () => Number(video.dataset.time || '0') });
    video.requestVideoFrameCallback = callback => { w.nextFrame = callback as unknown as typeof w.nextFrame; return 1; };
    video.cancelVideoFrameCallback = () => {};
  });
  await page.addScriptTag({ content: CAPTION_BRIDGE });
  await page.clock.fastForward(45);
  await page.evaluate(() => (window as unknown as { nextFrame: (now: number, metadata: { mediaTime: number }) => void }).nextFrame(performance.now(), { mediaTime: 2.04 }));
  const lastClock = () => page.evaluate(() => (window as unknown as { messages: { type: string; time?: number; paused?: boolean }[] }).messages.filter(m => m.type === 'clock').at(-1));
  expect((await lastClock())?.time).toBe(2.04);
  await page.evaluate(() => { const video = document.querySelector('video')!; video.dataset.time = '25'; video.dispatchEvent(new Event('seeked')); });
  expect((await lastClock())?.time).toBe(25);
  await page.evaluate(() => document.querySelector('video')!.dispatchEvent(new Event('pause')));
  expect((await lastClock())?.paused).toBe(true);
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
  await expect(page.getByText('Settings.', { exact: true })).toBeVisible();
  await page.mouse.move(60, 430); await page.mouse.down();
  await page.mouse.move(310, 435, { steps: 12 }); await page.mouse.up();
  await expect(page.getByText('Words.', { exact: true })).toBeVisible();
  await expect(page).toHaveURL(/panel=words/);
  await page.mouse.move(310, 430); await page.mouse.down();
  await page.mouse.move(60, 435, { steps: 12 }); await page.mouse.up();
  await expect(page.getByText('Settings.', { exact: true })).toBeVisible();
  await expect(page).toHaveURL(/panel=settings/);
});

test('sentence navigation follows cue boundaries, gaps and video ends', () => {
  const cues = [{ start: 0, end: 2, text: '一' }, { start: 4, end: 6, text: '二' }, { start: 8, end: 10, text: '三' }];
  expect(sentenceTarget(cues, 4.8, -1)).toBe(0);
  expect(sentenceTarget(cues, 4.8, 1)).toBe(8);
  expect(sentenceTarget(cues, 3, -1)).toBe(0);
  expect(sentenceTarget(cues, 3, 1)).toBe(4);
  expect(sentenceTarget(cues, 0, -1)).toBe(0);
  expect(sentenceTarget(cues, 8, 1)).toBeUndefined();
  expect(sentenceTarget([], 0, -1)).toBeUndefined();
});

test('lookup actions stay open, any text dismisses, and sentence controls seek the reading view', async ({ page }) => {
  await page.route('**/api/immersion/transcribe?**', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ status: 'ready', cues: [{ start: 0, end: 2, text: '食べる。' }, { start: 4, end: 6, text: '明日は旅行です。' }] }) }));
  await page.goto('/');
  await page.getByRole('textbox').fill('https://youtu.be/M7lc1UVf-VE');
  await page.getByRole('button', { name: 'Go', exact: true }).click();
  await page.getByRole('button', { name: 'Look up 食べる', exact: true }).click({ timeout: 12000 });
  const sheet = page.getByTestId('dictionary-sheet');
  await sheet.getByRole('switch', { name: 'Known word', exact: true }).uncheck();
  await expect(sheet).toBeVisible();
  await sheet.getByRole('button', { name: 'Next sentence', exact: true }).click();
  await expect(sheet).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Look up 旅行', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Previous sentence', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Look up 食べる', exact: true })).toBeVisible();
});

test('left-edge back leaves a selected video and follows the actual panel history', async ({ page }) => {
  await page.route('**/api/immersion/transcribe?**', route => route.fulfill({ contentType: 'application/json', body: '{"status":"processing"}' }));
  await page.goto('/');
  await page.getByRole('textbox').fill('https://youtu.be/M7lc1UVf-VE');
  await page.getByRole('button', { name: 'Go', exact: true }).click();
  const back = async () => { await page.mouse.move(8, 420); await page.mouse.down(); await page.mouse.move(240, 422, { steps: 15 }); await page.mouse.up(); };
  await back();
  await expect(page.getByTestId('subtitle-panel')).toHaveCount(0);
  await expect(page.getByRole('textbox')).toBeVisible();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(page.getByText('Settings.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Words · 0', exact: true }).click();
  await expect(page.getByText('Words.', { exact: true })).toBeVisible();
  await back();
  await expect(page.getByText('Settings.', { exact: true })).toBeVisible();
  await back();
  await expect(page.getByText('Settings.', { exact: true })).toHaveCount(0);
});

test('playback commands use player APIs and absolute sentence timestamps without clicking controls', async ({ page }) => {
  await page.route('https://m.youtube.com/**', route => route.fulfill({ contentType: 'text/html', body: '<div id="movie_player"><video></video><button class="ytp-subtitles-button" aria-pressed="false" onclick="this.dataset.clicked=\'yes\'">CC</button></div>' }));
  await page.goto('https://m.youtube.com/embed/M7lc1UVf-VE');
  await page.evaluate(() => {
    const video = document.querySelector('video')!;
    let paused = false;
    Object.defineProperty(video, 'paused', { get: () => paused });
    const player = document.getElementById('movie_player') as HTMLElement & { pauseVideo: () => void; playVideo: () => void; seekTo: (time: number) => void; getOption: () => unknown };
    player.pauseVideo = () => { paused = true; video.dataset.paused = 'true'; };
    player.playVideo = () => { paused = false; video.dataset.paused = 'false'; };
    player.seekTo = time => { video.dataset.seek = String(time); };
    player.getOption = () => ({ languageCode: 'ja' });
  });
  await page.addScriptTag({ content: CAPTION_BRIDGE });
  await page.evaluate(() => { const w = window as unknown as { __immersedCommand: (command: string, time?: number) => void }; w.__immersedCommand('pause'); w.__immersedCommand('seekTo', 12.75); w.__immersedCommand('play'); });
  await expect(page.locator('video')).toHaveAttribute('data-seek', '12.75');
  await expect(page.locator('video')).toHaveAttribute('data-paused', 'false');
  await expect(page.locator('.ytp-subtitles-button')).not.toHaveAttribute('data-clicked');
});

test('native Japanese cue clears are forwarded on cuechange without waiting for a poll', async ({ page }) => {
  await page.route('https://m.youtube.com/**', route => route.fulfill({ contentType: 'text/html', body: '<video></video>' }));
  await page.goto('https://m.youtube.com/embed/M7lc1UVf-VE');
  await page.clock.install();
  await page.evaluate(() => {
    const w = window as unknown as { messages: unknown[]; track: EventTarget & { language: string; mode: string; activeCues: { text: string }[] }; ReactNativeWebView: { postMessage: (raw: string) => void } };
    w.messages = []; w.ReactNativeWebView = { postMessage: raw => w.messages.push(JSON.parse(raw)) };
    w.track = Object.assign(new EventTarget(), { language: 'ja', mode: 'hidden', activeCues: [{ text: '日本語です。' }] });
    Object.defineProperty(document.querySelector('video'), 'textTracks', { get: () => [w.track] });
  });
  await page.addScriptTag({ content: CAPTION_BRIDGE });
  const texts = () => page.evaluate(() => (window as unknown as { messages: { type: string; text?: string }[] }).messages.filter(m => m.type === 'caption').map(m => m.text));
  expect(await texts()).toContain('日本語です。');
  await page.evaluate(() => { const track = (window as unknown as { track: EventTarget & { activeCues: unknown[] } }).track; track.activeCues = []; track.dispatchEvent(new Event('cuechange')); });
  expect((await texts()).at(-1)).toBe('');
});

test('duration preference persists independently of Shorts and learner level', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('radio', { name: 'At least 30 minutes', exact: true }).click();
  await page.reload();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(page.getByRole('radio', { name: 'At least 30 minutes', exact: true })).toBeChecked();
  await expect(page.getByRole('switch', { name: 'Hide Shorts', exact: true })).toBeChecked();
  await expect(page.getByRole('radio', { name: 'Completed N5', exact: true })).toBeChecked();
  await page.getByRole('radio', { name: 'Any video length', exact: true }).click();
  await expect(page.getByRole('radio', { name: 'Any video length', exact: true })).toBeChecked();
});

test('length filters handle exact thresholds, hours, Japanese labels, live and late-loaded cards', async ({ page }) => {
  await page.route('https://m.youtube.com/**', route => route.fulfill({ contentType: 'text/html; charset=utf-8', body: '<style>ytm-video-with-context-renderer{display:block;height:50px}</style><main>' + [['short','14:59'],['fifteen','15:00'],['thirty','30:00'],['hour','1:00:00'],['japanese','1 時間 5 分'],['live','LIVE'],['unknown','']].map(([id,time]) => `<ytm-video-with-context-renderer id="${id}"><a href="/watch?v=${id}">Video</a><span class="video-time">${time}</span></ytm-video-with-context-renderer>`).join('') + '</main>' }));
  await page.goto('https://m.youtube.com/results?search_query=test');
  await page.evaluate(() => { (window as unknown as { __immersedOptions: unknown }).__immersedOptions = { dark: true, hideShorts: false, minimumMinutes: 15, fillPortrait: false }; });
  await page.addScriptTag({ content: CAPTION_BRIDGE });
  await expect(page.locator('#short')).toBeHidden();
  await expect(page.locator('#fifteen')).toBeVisible();
  await expect(page.locator('#live')).toBeHidden();
  await expect(page.locator('#unknown')).toBeHidden();
  const minimum = async (value: number) => page.evaluate(value => { const w = window as unknown as { __immersedOptions: { minimumMinutes: number }; __immersedApplyOptions: () => void }; w.__immersedOptions.minimumMinutes = value; w.__immersedApplyOptions(); }, value);
  await minimum(30);
  await expect(page.locator('#fifteen')).toBeHidden();
  await expect(page.locator('#thirty')).toBeVisible();
  await minimum(60);
  await expect(page.locator('#thirty')).toBeHidden();
  await expect(page.locator('#hour')).toBeVisible();
  await expect(page.locator('#japanese')).toBeVisible();
  await page.evaluate(() => { const card = document.createElement('ytm-video-with-context-renderer'); card.id = 'late'; card.innerHTML = '<a href="/watch?v=late">Late result</a><span class="video-time">35:00</span>'; document.querySelector('main')!.appendChild(card); });
  await expect(page.locator('#late')).toBeHidden();
  await minimum(0);
  await expect(page.locator('#late')).toBeVisible();
  await expect(page.locator('#unknown')).toBeVisible();
});

test('two-finger spread fills the video and pinch restores the complete frame without navigating', async ({ page }) => {
  await page.route('https://m.youtube.com/**', route => route.fulfill({ contentType: 'text/html', body: '<meta name="viewport" content="width=device-width,initial-scale=1"><video class="html5-main-video"></video>' }));
  await page.goto('https://m.youtube.com/embed/M7lc1UVf-VE');
  await page.addScriptTag({ content: YOUTUBE_BOOTSTRAP });
  const client = await page.context().newCDPSession(page);
  const pinch = async (start: number, end: number) => {
    const points = (distance: number) => [{ x: 195 - distance / 2, y: 300 }, { x: 195 + distance / 2, y: 300 }];
    await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: points(start) });
    await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: points(end) });
    await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  };
  await expect(page.locator('video')).toHaveCSS('object-fit', 'contain');
  await pinch(100, 200);
  await expect(page.locator('video')).toHaveCSS('object-fit', 'cover');
  await pinch(200, 100);
  await expect(page.locator('video')).toHaveCSS('object-fit', 'contain');
  await expect(page).toHaveURL(/embed\/M7lc1UVf-VE/);
});

test('skip reacts on touch-down once and rapid presses advance distinct captions', async ({ page }) => {
  await page.route('**/api/immersion/transcribe?**', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ status: 'ready', cues: [{ start: 0, end: 2, text: '食べる。' }, { start: 4, end: 6, text: '旅行。' }, { start: 8, end: 10, text: '公園。' }] }) }));
  await page.goto('/');
  await page.getByRole('textbox').fill('https://youtu.be/M7lc1UVf-VE');
  await page.getByRole('button', { name: 'Go', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Look up 食べる', exact: true })).toBeVisible({ timeout: 12000 });
  const next = page.getByRole('button', { name: 'Next sentence', exact: true });
  const previous = page.getByRole('button', { name: 'Previous sentence', exact: true });
  const n = (await next.boundingBox())!, p = (await previous.boundingBox())!;
  expect(n.x - (p.x + p.width)).toBeGreaterThanOrEqual(60);
  await page.mouse.move(n.x + n.width / 2, n.y + n.height / 2);
  await page.mouse.down();
  await expect(page.getByRole('button', { name: 'Look up 旅行', exact: true })).toBeVisible();
  await page.mouse.up();
  await expect(page.getByRole('button', { name: 'Look up 旅行', exact: true })).toBeVisible();
  await next.click();
  await expect(page.getByRole('button', { name: 'Look up 公園', exact: true })).toBeVisible();
  await expect(next).toBeDisabled();
});

test('center playback and a reachable knowledge toggle keep lookup quiet and functional', async ({ page }) => {
  await page.route('**/api/immersion/transcribe?**', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ status: 'ready', cues: [{ start: 0, end: 10, text: '食べました。' }] }) }));
  await page.goto('/');
  await page.getByRole('textbox').fill('https://youtu.be/M7lc1UVf-VE');
  await page.getByRole('button', { name: 'Go', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Look up 食べました', exact: true })).toBeVisible({ timeout: 12000 });
  const previous = (await page.getByRole('button', { name: 'Previous sentence', exact: true }).boundingBox())!;
  const play = page.getByRole('button', { name: 'Play video', exact: true });
  const center = (await play.boundingBox())!;
  const next = (await page.getByRole('button', { name: 'Next sentence', exact: true }).boundingBox())!;
  expect(center.x).toBeGreaterThan(previous.x + previous.width);
  expect(center.x + center.width).toBeLessThan(next.x);
  await play.click();
  await page.getByRole('button', { name: 'Pause video', exact: true }).click();
  await page.getByRole('button', { name: 'Look up 食べました', exact: true }).click();
  const sheet = page.getByTestId('dictionary-sheet');
  await expect(sheet.getByText(/^to eat\b/)).toBeVisible();
  await expect(sheet.getByText('WORD & GRAMMAR', { exact: true })).toHaveCount(0);
  const toggle = sheet.getByRole('switch', { name: 'Known word', exact: true });
  await toggle.uncheck();
  await expect(sheet).toBeVisible();
  await expect(toggle).not.toBeChecked();
  const frame = (await sheet.boundingBox())!, knowledge = (await sheet.getByTestId('word-knowledge-control').boundingBox())!;
  expect(knowledge.x + knowledge.width).toBeGreaterThan(frame.x + frame.width - 30);
  expect(knowledge.y).toBeGreaterThan(frame.y + frame.height * 0.65);
  await sheet.getByRole('button', { name: 'Save word', exact: true }).click();
  await expect(sheet.getByRole('button', { name: 'Word saved', exact: true })).toBeDisabled();
  await sheet.getByRole('button', { name: 'Play video', exact: true }).click();
  await expect(sheet).toBeVisible();
  await expect(sheet.getByRole('button', { name: 'Pause video', exact: true })).toBeVisible();
  await sheet.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(sheet).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Pause video', exact: true })).toBeVisible();
  await expect(page.getByTestId('unknown-食べる')).toBeVisible();
});

test('wrapped Japanese rows stay compact without splitting learning tokens', async ({ page }) => {
  await page.route('**/api/immersion/transcribe?**', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ status: 'ready', cues: [{ start: 0, end: 10, text: '日本語を勉強します。日本語を勉強します。' }] }) }));
  await page.goto('/');
  await page.getByRole('textbox').fill('https://youtu.be/M7lc1UVf-VE');
  await page.getByRole('button', { name: 'Go', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Look up 日本語', exact: true }).first()).toBeVisible({ timeout: 12000 });
  const ys = await page.getByTestId('subtitle-words').getByRole('button').evaluateAll(nodes => [...new Set(nodes.map(node => Math.round(node.getBoundingClientRect().y)))].sort((a,b) => a-b));
  expect(ys.length).toBe(2);
  expect(ys[1] - ys[0]).toBeLessThanOrEqual(56);
  expect(ys[1] - ys[0]).toBeGreaterThanOrEqual(44);
});

test('split source words are joined into a dictionary-backed cue automatically', async ({ page }) => {
  await page.route('**/api/immersion/transcribe?**', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ status: 'ready', cues: [{ start: 0, end: 1, text: '日' }, { start: 1, end: 3, text: '本語を話します。' }] }) }));
  await page.goto('/');
  await page.getByRole('textbox').fill('https://youtu.be/M7lc1UVf-VE');
  await page.getByRole('button', { name: 'Go', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Look up 日本語', exact: true })).toBeVisible({ timeout: 15000 });
  await expect(page.getByRole('button', { name: 'Next sentence', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Look up 日本語', exact: true }).click();
  await expect(page.getByTestId('dictionary-sheet').getByText(/Japanese \(language\)/).first()).toBeVisible();
});

test('long-track boundary processing carries split words between batches and preserves all source text', async () => {
  const raw = Array.from({ length: 47 }, (_, i) => ({ start: i, end: i + 1, text: 'はい。' }));
  raw.push({ start: 47, end: 48, text: '日' }, { start: 48, end: 49, text: '本語' });
  let result = raw;
  let updates = 0;
  await refineCaptionTrack(raw, 'http://127.0.0.1:8082/api/immersion/reflow', new AbortController().signal, cues => { result = cues; updates++; });
  expect(updates).toBeGreaterThan(1);
  expect(result).toHaveLength(48);
  expect(result.at(-1)).toEqual({ start: 47, end: 49, text: '日本語' });
  expect(result.map(c => c.text).join('')).toBe(raw.map(c => c.text).join(''));
});

test('a reflow response that changes Japanese text is rejected before it reaches the reading view', async () => {
  const response: typeof fetch = async () => new Response(JSON.stringify({ cues: [{ start: 0, end: 2, text: '別の言葉' }] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  let displayed = false;
  await expect(refineCaptionTrack([{ start: 0, end: 1, text: '日' }, { start: 1, end: 2, text: '本語' }], 'https://fixture.invalid', new AbortController().signal, () => { displayed = true; }, response)).rejects.toThrow('Invalid caption reflow');
  expect(displayed).toBe(false);
});

test('dictionary and settings occupy the reading area while the selected player stays mounted', async ({ page }) => {
  await page.route('**/api/immersion/transcribe?**', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ status: 'ready', cues: [{ start: 0, end: 10, text: '食べる。' }] }) }));
  await page.goto('/');
  await page.getByRole('textbox').fill('https://youtu.be/M7lc1UVf-VE');
  await page.getByRole('button', { name: 'Go', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Look up 食べる', exact: true })).toBeVisible({ timeout: 12000 });
  await page.getByRole('button', { name: 'Play video', exact: true }).click();
  const player = page.getByTestId('video-surface');
  await player.evaluate(node => { node.firstElementChild!.setAttribute('data-mounted-marker', 'same-player'); });
  const expectBelowPlayer = async (testId: string) => {
    await expect(page.getByTestId(testId)).toBeVisible();
    await expect.poll(async () => {
      const video = (await player.boundingBox())!;
      const bounds = (await page.getByTestId(testId).boundingBox())!;
      return bounds.y >= video.y + video.height - 1 && video.height > 128 && bounds.height > 350;
    }).toBe(true);
    await expect(player.locator('[data-mounted-marker="same-player"]')).toHaveCount(1);
  };
  await page.getByRole('button', { name: 'Look up 食べる', exact: true }).click();
  await expect(page.getByTestId('dictionary-sheet')).toBeVisible();
  await expect(page.getByTestId('dictionary-sheet').getByRole('button', { name: 'Play video', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(page.getByTestId('dictionary-sheet')).toHaveCount(0);
  await expect(page.getByTestId('subtitle-panel').getByRole('button', { name: 'Pause video', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Words · 0', exact: true }).click();
  await expectBelowPlayer('words-panel');
  await expect(page.getByTestId('dictionary-sheet')).toHaveCount(0);
  await page.getByRole('textbox', { name: 'Search English or Japanese words' }).fill('eat');
  await expect(page.getByTestId('words-panel').getByText('食べる', { exact: true }).first()).toBeVisible();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expectBelowPlayer('settings-panel');
  await expect(page.getByRole('switch', { name: 'Dark mode', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Watch & read', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Pause video', exact: true })).toBeVisible();
  // A deliberate pause also survives navigation; opening a panel must not force play.
  await page.getByRole('button', { name: 'Pause video', exact: true }).click();
  await page.getByRole('button', { name: 'Words · 0', exact: true }).click();
  await page.getByRole('button', { name: 'Watch & read', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Play video', exact: true })).toBeVisible();
});

test('dictionary and settings stay full screen without a selected video', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Words · 0', exact: true }).click();
  expect((await page.getByTestId('words-panel').boundingBox())!.height).toBeGreaterThan(650);
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  expect((await page.getByTestId('settings-panel').boundingBox())!.height).toBeGreaterThan(650);
});

test('vocabulary estimates distinguish known, unknown and unrated words and respect personal overrides', () => {
  const token = (lemma: string, reading: string, pos = 'noun'): AnalyzedToken => ({ text: lemma, lemma, reading, pos, word: true, grammar: [], start: 0, end: lemma.length });
  const tokens = [token('食べる', 'たべる'), token('愛想', 'あいそう'), token('未収録XYZ', ''), token('を', 'を', 'particle'), token('ます', 'ます', 'auxiliary')];
  expect(estimateVocabulary(tokens, 2, {})).toEqual({ known: 1, unknown: 1, unrated: 1, total: 3, lower: 33, upper: 67 });
  expect(estimateVocabulary(tokens, 2, { '愛想': true })?.lower).toBe(67);
  expect(estimateVocabulary(tokens, 2, { '未収録XYZ': false })?.upper).toBe(33);
  expect(estimateVocabulary(tokens, 1, {})?.lower).toBe(67);
  expect(estimateVocabulary([], 2, {})).toBeNull();
});

test('caption vocabulary sampling includes beginning and end without cutting or duplicating source cues', () => {
  const cues = Array.from({ length: 100 }, (_, i) => ({ start: i, end: i + 1, text: `単語${i}。` }));
  const sample = sampleCaptionVocabulary(cues);
  expect(sample).toContain('単語0。');
  expect(sample).toContain('単語99。');
  const picked = sample.match(/単語\d+。/g)!;
  expect(new Set(picked).size).toBe(picked.length);
  expect(sample.length).toBeLessThanOrEqual(609);
  cues[0].text = '超'.repeat(100);
  expect(sampleCaptionVocabulary(cues)).not.toContain('超');
});

test('video vocabulary indicator changes with known-word choices without inventing comprehension percentages', async ({ page }) => {
  await page.route('**/api/immersion/transcribe?**', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ status: 'ready', cues: Array.from({ length: 40 }, (_, i) => ({ start: i, end: i + 1, text: '食べる。' })) }) }));
  await page.goto('/');
  await page.getByRole('textbox').fill('https://youtu.be/M7lc1UVf-VE');
  await page.getByRole('button', { name: 'Go', exact: true }).click();
  await expect(page.getByTestId('video-coverage')).toHaveAttribute('aria-label', /^100% familiar words/, { timeout: 15000 });
  await page.getByRole('button', { name: 'Look up 食べる', exact: true }).click();
  await page.getByRole('switch', { name: 'Known word', exact: true }).uncheck();
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(page.getByTestId('video-coverage')).toHaveAttribute('aria-label', /^0% familiar words/);
  await expect(page.getByTestId('video-coverage')).toHaveAttribute('aria-label', /listening comprehension can differ/);
});

test('pitch setting persists and shows verified patterns in popup and separate dictionary', async ({ page }) => {
  await page.route('**/api/immersion/transcribe?**', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ status: 'ready', cues: [{ start: 0, end: 10, text: '食べる。' }] }) }));
  await page.goto('/');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  const toggle = page.getByRole('switch', { name: 'Pitch accent', exact: true });
  await expect(toggle).not.toBeChecked();
  await toggle.check();
  await page.reload();
  await expect(page.getByRole('switch', { name: 'Pitch accent', exact: true })).toBeChecked();
  await page.getByRole('button', { name: 'Browse', exact: true }).click();
  await page.getByRole('textbox').fill('https://youtu.be/M7lc1UVf-VE');
  await page.getByRole('button', { name: 'Go', exact: true }).click();
  await page.getByRole('button', { name: 'Look up 食べる', exact: true }).click({ timeout: 12000 });
  await expect(page.getByTestId('dictionary-sheet').getByTestId('pitch-patterns').first()).toBeVisible();
  await expect(page.getByTestId('dictionary-sheet').getByLabel('たべる, Tokyo pitch accent downstep after mora 2')).toBeVisible();
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await page.getByRole('button', { name: 'Words · 0', exact: true }).click();
  await page.getByRole('textbox', { name: 'Search English or Japanese words' }).fill('eat');
  await expect(page.getByTestId('words-panel').getByTestId('pitch-patterns').first()).toBeVisible();
});

test('pitch charts count morae and distinguish flat, initial and final drops', () => {
  expect(accentMorae('きょう')).toEqual(['きょ', 'う']);
  expect(accentMorae('がっこう')).toEqual(['が', 'っ', 'こ', 'う']);
  expect(accentHeights({ reading: 'はし', downstep: 0 }).map(m => m.high)).toEqual([false, true]);
  expect(accentHeights({ reading: 'はし', downstep: 1 }).map(m => m.high)).toEqual([true, false]);
  expect(accentHeights({ reading: 'はし', downstep: 2 }).map(m => m.high)).toEqual([false, true]);
  expect(accentHeights({ reading: 'はし', downstep: 3 })).toEqual([]);
  expect(restorePreferences({}).pitchAccent).toBe(false);
  expect(restorePreferences({ pitchAccent: true }).pitchAccent).toBe(true);
});

test('partial generated captions update through model comparison instead of stopping after the first result', async ({ page }) => {
  let polls = 0;
  await page.route('**/api/immersion/transcribe?**', route => {
    polls++;
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify({
      status: polls < 3 ? 'processing' : 'ready',
      cues: [{ start: 0, end: 5, text: polls < 3 ? '箸です。' : '橋です。' }],
      comparisons: [{ start: 0, end: 5, selected: polls < 3 ? 'reazon' : 'kotoba', reason: polls < 3 ? 'preferred-unverified' : 'majority-agreement', agreement: polls < 3 ? null : .9, candidates: [] }],
    }) });
  });
  await page.goto('/');
  await page.getByRole('textbox').fill('https://youtu.be/M7lc1UVf-VE');
  await page.getByRole('button', { name: 'Go', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Look up 箸', exact: true })).toBeVisible({ timeout: 12000 });
  await expect(page.getByRole('button', { name: 'Look up 橋', exact: true })).toBeVisible({ timeout: 12000 });
  expect(polls).toBeGreaterThanOrEqual(3);
});

test('a contextual caption suggestion stays visibly unverified in the buried comparison report', async ({ page }) => {
  await page.route('**/api/immersion/transcribe?**', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({
    status: 'ready', cues: [{ start: 0, end: 10, text: '公園を散歩しました。' }],
    comparisons: [{ start: 0, end: 10, selected: 'kotoba', reason: 'context-alternative', agreement: .9, candidates: [] }],
  }) }));
  await page.goto('/');
  await page.getByRole('textbox').fill('https://youtu.be/M7lc1UVf-VE');
  await page.getByRole('button', { name: 'Go', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Look up 公園', exact: true })).toBeVisible({ timeout: 12000 });
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: 'About', exact: true }).click();
  const report = page.getByText(/context suggests alternative/);
  await report.scrollIntoViewIfNeeded();
  await expect(report).toContainText('text similarity 90%');
});

test('caption windows, exact-boundary appends and explicit clears preserve all source words', () => {
  const track = parseCaptionTrack({ events: [
    { tStartMs: 0, dDurationMs: 500, wWinId: 1, segs: [{ utf8: '日本' }] },
    { tStartMs: 500, dDurationMs: 1500, wWinId: 1, aAppend: 1, segs: [{ utf8: '語です' }] },
    { tStartMs: 600, dDurationMs: 1200, wWinId: 2, segs: [{ utf8: '友達と' }] },
    { tStartMs: 700, dDurationMs: 1000, wWinId: 3, segs: [{ utf8: '散歩する' }] },
    { tStartMs: 2000, wWinId: 1, segs: [{ utf8: '' }] },
  ] });
  expect(readingCue(track, .8)?.text).toBe('日本語です 友達と 散歩する');
  expect(readingCue(readingTimeline(track), 2.1)).toBeUndefined();
  expect(readingCue(track, .5)?.text).toBe('日本語です');
  const repeated = parseCaptionTrack({ events: [
    { tStartMs: 0, dDurationMs: 1000, wWinId: 1, segs: [{ utf8: 'はい' }] },
    { tStartMs: 0, dDurationMs: 1000, wWinId: 2, segs: [{ utf8: 'はい' }] },
  ] });
  expect(readingCue(repeated, .5)?.text).toBe('はい はい');
});
test('reading grace fills short gaps without masking the next line, long silence or hard clears', () => {
  const track = readingTimeline([{ start: 0, end: .2, text: '短い字幕' }, { start: .6, end: 1, text: '次です', hardEnd: true }]);
  expect(readingCue(track, .4)?.text).toBe('短い字幕');
  expect(readingCue(track, .6)?.text).toBe('次です');
  expect(readingCue(track, 1.01)).toBeUndefined();
  expect(readingCue(readingTimeline([{ start: 0, end: 3, text: '通常の長さの字幕です' }, { start: 3.12, end: 5, text: '次の文です' }]), 3.08)?.text).toBe('通常の長さの字幕です');
  expect(readingCue(readingTimeline([{ start: 0, end: .1, text: '長い字幕でも長い無音には残さない' }]), 2)).toBeUndefined();
});
test('incomplete or invalid morphology cannot omit subtitle characters', () => {
  const text = '日本語を話す';
  const token: AnalyzedToken = { text: '日本語', start: 0, end: 3, lemma: '日本語', reading: 'にほんご', pos: 'noun', word: true, grammar: [] };
  const complete = preserveCaptionTokens(text, [token, { ...token, text: '話す', start: 4, end: 6 }]);
  expect(complete.map(t => t.text).join('')).toBe(text);
  expect(complete[1].text).toBe('を');
  expect(preserveCaptionTokens(text, [{ ...token, text: '誤った解析' }]).map(t => t.text).join('')).toBe(text);
});
test('three wrapped subtitle rows and furigana fit above playback controls on a small iPhone viewport', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 667 });
  const text = '日本語を勉強しています。友達と公園で話します。今日はとても楽しいです。';
  await page.route('**/api/immersion/transcribe?**', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ status: 'ready', cues: [{ start: 0, end: 10, text }] }) }));
  await page.goto('/');
  await page.getByRole('textbox').fill('https://youtu.be/M7lc1UVf-VE');
  await page.getByRole('button', { name: 'Go', exact: true }).click();
  const words = page.getByTestId('subtitle-words');
  await expect(words.getByRole('button').first()).toBeVisible({ timeout: 12000 });
  await expect.poll(async () => {
    const bounds = (await words.boundingBox())!;
    const scroll = (await page.getByTestId('caption-scroll').boundingBox())!;
    const play = (await page.getByRole('button', { name: 'Play video', exact: true }).boundingBox())!;
    return bounds.y >= scroll.y - 1 && bounds.y + bounds.height <= scroll.y + scroll.height + 1 && bounds.y + bounds.height <= play.y;
  }).toBe(true);
  const glyphs = await words.evaluate(node => {
    const clone = node.cloneNode(true) as HTMLElement;
    clone.querySelectorAll('[data-testid^="furigana-"]').forEach(n => n.remove());
    return clone.textContent || '';
  });
  expect(glyphs.replace(/\s/g, '')).toContain(text);
});

test('an unfinished ASR pass retains a straddling source sentence and does not fill verified silence', () => {
  const primary = [{ start: 0, end: 10, text: '生成した部分' }];
  const source = [{ start: 9, end: 15, text: '途中からも必要な言葉' }, { start: 15, end: 18, text: '次の文' }];
  expect(combineCaptionTracks(primary, source, 12)).toEqual([
    ...primary, { start: 12, end: 15, text: '途中からも必要な言葉' }, source[1],
  ]);
});

test('grammar ending lookup explains conjecture instead of showing animal nouns', async ({ page }) => {
  await page.route('**/api/immersion/transcribe?**', route => route.fulfill({contentType:'application/json',body:JSON.stringify({status:'ready',cues:[{start:0,end:10,text:'だろうなって思いました。'}]})}));
  await page.goto('/');
  await page.getByRole('textbox').fill('https://youtu.be/M7lc1UVf-VE');
  await page.getByRole('button',{name:'Go',exact:true}).click();
  await page.getByRole('button',{name:'Look up だろうなって',exact:true}).click({timeout:12000});
  const sheet = page.getByTestId('dictionary-sheet');
  await expect(sheet.getByText(/probably; I suppose/)).toBeVisible();
  await expect(sheet.getByText(/cormorant|rabbit; hare/)).toHaveCount(0);
});

test('homophone suggestions do not resize the popup or silently change the video captions', async ({ page }) => {
  const entry = {slug:'example-jisho',source:'JMdict',japanese:[{word:'事象',reading:'じしょう'}],senses:[{english_definitions:['event; phenomenon'],parts_of_speech:['noun']}]};
  let provide: (() => void) | undefined;
  const delay = new Promise<void>(resolve => { provide = resolve; });
  await page.route('**/api/immersion/lookup-context?**', async route => {
    await delay;
    await route.fulfill({contentType:'application/json',body:JSON.stringify({alternatives:[{entry,form:'事象',likely:true}]})});
  });
  await page.route('**/api/immersion/transcribe?**', route => route.fulfill({contentType:'application/json',body:JSON.stringify({status:'ready',cues:[{start:0,end:10,text:'個別具体的な自称に興味がある人と'}]})}));
  await page.goto('/');
  await page.getByRole('textbox').fill('https://youtu.be/M7lc1UVf-VE');
  await page.getByRole('button',{name:'Go',exact:true}).click();
  await page.getByRole('button',{name:'Look up 自称',exact:true}).click({timeout:12000});
  const sheet = page.getByTestId('dictionary-sheet');
  await expect(sheet.getByText(/self-proclaimed/)).toBeVisible();
  const before = (await sheet.boundingBox())!;
  provide!();
  const alternative = sheet.getByRole('button',{name:'Use spelling 事象',exact:true});
  await expect(alternative).toBeVisible();
  expect((await alternative.boundingBox())!.y).toBeLessThan((await sheet.getByText(/self-proclaimed/).boundingBox())!.y);
  expect((await sheet.boundingBox())!.height).toBe(before.height);
  await alternative.click();
  await expect(sheet.getByText('Caption spelling: 自称',{exact:true})).toBeVisible();
  await expect(sheet.getByText('event; phenomenon',{exact:true})).toBeVisible();
  expect((await sheet.boundingBox())!.height).toBe(before.height);
  await sheet.getByRole('button',{name:'Close',exact:true}).click();
  await expect(page.getByRole('button',{name:'Look up 自称',exact:true})).toBeVisible();
});

test('the video does not resize when changing between short and long subtitle lines', async ({ page }) => {
  await page.route('**/api/immersion/transcribe?**', route => route.fulfill({contentType:'application/json',body:JSON.stringify({status:'ready',cues:[
    {start:0,end:2,text:'はい。'}, {start:3,end:7,text:'日本語を勉強しています。友達と公園で話します。今日はとても楽しいです。'},
  ]})}));
  await page.goto('/');
  await page.getByRole('textbox').fill('https://youtu.be/M7lc1UVf-VE');
  await page.getByRole('button',{name:'Go',exact:true}).click();
  await expect(page.getByRole('button',{name:'Look up はい',exact:true})).toBeVisible({timeout:12000});
  const before = await page.getByTestId('video-surface').boundingBox();
  await page.getByRole('button',{name:'Next sentence',exact:true}).click();
  await expect(page.getByRole('button',{name:'Look up 日本語',exact:true})).toBeVisible();
  expect(await page.getByTestId('video-surface').boundingBox()).toEqual(before);
});

test('the discovery icon and video boundary stay fixed across study, dictionary and settings', async ({ page }) => {
  await page.route('**/api/immersion/transcribe?**', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ status: 'ready', cues: [{ start: 0, end: 10, text: '日本語を勉強しています。' }] }) }));
  await page.goto('/');
  const icon = await page.getByRole('button', { name: 'Browse', exact: true }).locator('svg').innerHTML();
  await page.getByRole('textbox').fill('https://youtu.be/M7lc1UVf-VE');
  await page.getByRole('button', { name: 'Go', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Look up 日本語', exact: true })).toBeVisible({ timeout: 12000 });
  const bounds = await page.getByTestId('video-surface').boundingBox();
  for (const label of ['Words · 0', 'Settings', 'Watch & read']) {
    await page.getByRole('button', { name: label, exact: true }).click();
    await expect.poll(() => page.getByTestId('video-surface').boundingBox()).toEqual(bounds);
    const destination = label === 'Watch & read' ? 'Browse' : 'Watch & read';
    expect(await page.getByRole('button', { name: destination, exact: true }).locator('svg').innerHTML()).toBe(icon);
  }
});
