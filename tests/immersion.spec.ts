import { test, expect } from '@playwright/test';

test('tap, save with context, reload, and remove a Japanese word', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /A slower morning in Tokyo/ }).click();
  await expect(page.getByText('Device-generated Japanese speech', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Look up 今日', exact: true }).click();
  await expect(page.getByText('today', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '＋ Save word & sentence', exact: true }).click();
  await expect(page.getByRole('button', { name: '✓ Saved to your words', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Close word lookup', exact: true }).last().click();
  await page.getByRole('button', { name: /Your immersion space/ }).click();
  await page.getByRole('tab', { name: /Words/ }).click();
  await expect(page.getByText('今日は少し早く起きました。', { exact: true })).toBeVisible();
  await page.reload();
  await page.getByRole('tab', { name: /Words/ }).click();
  await expect(page.getByText('today', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Remove 今日' }).click();
  await expect(page.getByText('0 saved words', { exact: false })).toBeVisible();
});

test('caption preferences apply to the lesson', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('tab', { name: /Settings/ }).click();
  await page.getByRole('switch', { name: 'Show English translations' }).click();
  await page.getByRole('switch', { name: 'Show furigana' }).click();
  await page.getByRole('tab', { name: /Immerse/ }).click();
  await page.getByRole('button', { name: /Finding joy in small things/ }).click();
  await expect(page.getByText('Hello, everyone.', { exact: true })).toHaveCount(0);
  await expect(page.getByText('みなさん', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Look up 皆さん' })).toBeVisible();
});
