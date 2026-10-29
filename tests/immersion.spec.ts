import { test, expect } from '@playwright/test';
import { CAPTION_BRIDGE, youtubeUrl } from '../src/youtube';

test('home offers real YouTube discovery and retains the saved-word library', async ({ page }) => {
  await page.goto('/');
  for (const name of ['Daily life', 'Food', 'Travel', 'Conversation']) await expect(page.getByRole('button', { name, exact: true })).toBeVisible();
  await expect(page.getByText('Device-generated Japanese speech', { exact: false })).toHaveCount(0);
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
  await page.route('https://m.youtube.com/**', route => route.fulfill({ contentType: 'text/html; charset=utf-8', body: '<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>日本の日常</title><div class="html5-video-player"><video></video><button class="ytp-subtitles-button" aria-pressed="false" onclick="this.setAttribute(&quot;aria-pressed&quot;,&quot;true&quot;)">CC</button><div class="ytp-caption-segment">今日</div><div class="ytp-caption-segment">は公園に行きます。</div></div><div class="comment">NOT A CAPTION</div>' }));
  await page.goto('https://m.youtube.com/watch?v=M7lc1UVf-VE');
  await page.evaluate(() => {
    const w = window as unknown as { messages: unknown[]; ReactNativeWebView: { postMessage: (message: string) => void }; pausedByApp: boolean };
    w.messages = [];
    w.ReactNativeWebView = { postMessage: message => w.messages.push(JSON.parse(message)) };
    document.querySelector('video')!.pause = () => { w.pausedByApp = true; };
  });
  await page.addScriptTag({ content: CAPTION_BRIDGE });
  const caption = await page.evaluate(() => (window as unknown as { messages: { type: string; text: string; tokens: { text: string }[] }[] }).messages.find(m => m.type === 'caption'));
  expect(caption?.text).toBe('今日は公園に行きます。');
  await expect(page.locator('.comment')).toBeHidden();
  await expect(page.locator('.ytp-subtitles-button')).toHaveAttribute('aria-pressed', 'true');
  const bounds = await page.locator('[data-immersed-player]').boundingBox();
  expect(bounds?.width).toBe(390);
  await page.evaluate(() => (window as unknown as { __immersedCommand: (command: string) => void }).__immersedCommand('pause'));
  expect(await page.evaluate(() => (window as unknown as { pausedByApp: boolean }).pausedByApp)).toBe(true);
  await page.evaluate(() => { history.pushState({}, '', '/watch?v=OTHER_VIDEO'); document.querySelector('.ytp-caption-segment')!.remove(); });
  await expect.poll(() => page.evaluate(() => (window as unknown as { messages: { type: string }[] }).messages.some(m => m.type === 'reset'))).toBe(true);
});

 test('dictionary settings persist without requiring dictionary imports', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(page.getByText('JMdict · Japanese → English', { exact: true })).toBeVisible();
  await page.getByRole('switch', { name: 'Smart word groups' }).click();
  await page.reload();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(page.getByRole('switch', { name: 'Smart word groups' })).not.toBeChecked();
});

test('language API uses actual morphology and dictionary data', async ({ request }) => {
  const parsed = await request.get('/api/immersion/analyze?text=' + encodeURIComponent('食べていました。'));
  expect(parsed.ok()).toBeTruthy();
  const { tokens } = await parsed.json();
  expect(tokens[0].text).toBe('食べていました');
  expect(tokens[0].lemma).toBe('食べる');
  const dict = await request.get('/api/immersion/dictionary?word=' + encodeURIComponent(tokens[0].lemma));
  expect((await dict.json()).data[0].senses[0].english_definitions).toContain('to eat');
  const invalid = await request.get('/api/immersion/transcribe?videoId=invalid!');
  expect(invalid.status()).toBe(400);
});
