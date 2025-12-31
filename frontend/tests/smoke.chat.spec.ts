import { test, expect } from '@playwright/test';

test('chat send roundtrip starts', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 60_000 });
  const box = page.getByTestId('chat-textarea');
  await expect(box).toBeVisible();
  await box.fill('test');
  const send = page.getByTestId('chat-send').first();
  await expect(send).toBeEnabled({ timeout: 5_000 });
  await send.click();
  await page.waitForResponse(r => r.url().endsWith('/api/chat'));
});
