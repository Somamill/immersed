// Capture real app UI with explicitly labelled documentation-only media/captions.
// This does not exercise live YouTube, iOS playback or speech recognition.
const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
async function main() {
  const root = path.join(__dirname, '..');
  const folder = path.join(root, 'docs/images'); fs.mkdirSync(folder, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    const page = await context.newPage();
    await page.route('**/api/immersion/transcribe?**', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ status: 'ready', cues: ['この街の雰囲気が好きです。', '今日は友達と東京の公園を散歩しました。', '近くのお店で温かいお茶を飲みます。', '電車で海まで行って、美しい景色を見たいです。', '初めての料理を食べながら、旅行の話をしました。', 'この場所には古い建物や面白い歴史があります。', '明日は天気がよければ、山の近くで写真を撮ります。', '新しい言葉を少しずつ覚えると、毎日が楽しくなります。'].map((text, i) => ({ start: i * 20, end: (i + 1) * 20, text })) }) }));
    const origin = process.env.IMMERSED_DOCS_ORIGIN || 'http://127.0.0.1:8081';
    await page.goto(origin);
    await page.evaluate(() => localStorage.setItem('immersed.preferences.v1', JSON.stringify({ schema: 2, level: 4, readings: true, dark: true })));
    await page.reload();
    await page.getByRole('textbox', { name: 'Search Japanese topics or paste a YouTube link' }).fill('https://youtu.be/M7lc1UVf-VE');
    await page.getByRole('button', { name: 'Go', exact: true }).click();
    await page.getByRole('button', { name: 'Look up 雰囲気', exact: true }).waitFor({ timeout: 20000 });
    const poster = 'data:image/png;base64,' + fs.readFileSync(path.join(folder, 'immersion-illustration.png')).toString('base64');
    await page.getByTestId('video-surface').evaluate((element, src) => {
      // Replace only the browser's "open in Expo Go" placeholder in this capture.
      const image = document.createElement('img'); image.src = src;
      Object.assign(image.style, { width: '100%', height: '100%', objectFit: 'contain', position: 'absolute', inset: '0' });
      const label = document.createElement('div'); label.textContent = 'Illustrative media · sample captions';
      Object.assign(label.style, { position: 'absolute', bottom: '16px', left: '16px', right: '16px', color: '#eee', font: '11px system-ui', textAlign: 'center', background: '#000b', borderRadius: '12px', padding: '8px' });
      element.style.position = 'relative'; element.replaceChildren(image, label);
    }, poster);
    await page.getByTestId('video-coverage').waitFor({ timeout: 15000 });
    await page.getByRole('button', { name: 'Play video', exact: true }).click();
    await page.screenshot({ path: path.join(folder, 'study.png') });
    await page.getByRole('button', { name: 'Look up 雰囲気', exact: true }).click();
    await page.getByRole('switch', { name: 'Known word', exact: true }).waitFor();
    await page.screenshot({ path: path.join(folder, 'lookup.png') });
    await page.getByRole('button', { name: 'Words · 0', exact: true }).click();
    await page.getByRole('textbox', { name: 'Search English or Japanese words' }).fill('eat');
    await page.getByText('食べる', { exact: true }).first().waitFor({ timeout: 15000 });
    await page.getByRole('textbox', { name: 'Search English or Japanese words' }).blur();
    await page.screenshot({ path: path.join(folder, 'watch-dictionary.png') });
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await page.screenshot({ path: path.join(folder, 'watch-settings.png') });
    await page.goto(origin);
    await page.getByRole('button', { name: 'Words · 0', exact: true }).click();
    await page.getByRole('textbox', { name: 'Search English or Japanese words' }).fill('eat');
    await page.getByText('食べる', { exact: true }).first().waitFor({ timeout: 15000 });
    await page.getByRole('textbox', { name: 'Search English or Japanese words' }).blur();
    await page.screenshot({ path: path.join(folder, 'dictionary.png') });
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await page.screenshot({ path: path.join(folder, 'settings.png') });
    console.log('Saved study, inline lookup/dictionary/settings and full-screen panel previews. Study uses labelled illustrative media/sample captions.');
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
