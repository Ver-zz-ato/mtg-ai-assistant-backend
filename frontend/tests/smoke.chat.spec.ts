import { test, expect } from '@playwright/test';

test('chat send roundtrip starts', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 60_000 });
  const box = page.getByTestId('chat-textarea');
  await expect(box).toBeVisible();
  await box.fill('what is ward?');
  const send = page.getByTestId('chat-send').first();
  await expect(send).toBeEnabled({ timeout: 5_000 });
  const response = page.waitForResponse(r => r.url().includes('/api/chat/stream'));
  await send.click();
  await response;
});
