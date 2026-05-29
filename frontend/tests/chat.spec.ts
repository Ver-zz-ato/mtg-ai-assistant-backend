import { test, expect } from '@playwright/test';

test('chat box can type, send, and send a follow-up', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 60_000 });
  const box = page.getByTestId('chat-textarea');
  await expect(box).toBeVisible();
  const send = page.getByTestId('chat-send').first();

  await box.fill('what does trample do?');
  await expect(send).toBeEnabled({ timeout: 5_000 });
  const firstResponse = page.waitForResponse(res => res.url().includes('/api/chat/stream'));
  await send.click();
  await firstResponse;

  await box.fill('and how does it work with deathtouch?');
  await expect(send).toBeEnabled({ timeout: 45_000 });
  const secondResponse = page.waitForResponse(res => res.url().includes('/api/chat/stream'));
  await send.click();
  await secondResponse;
});
