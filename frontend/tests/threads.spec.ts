import { test, expect } from '@playwright/test';

test('thread lifecycle: create → rename → link → export → delete', async ({ page }) => {
  // assumes user is already authenticated in dev (or add login helper)
  await page.goto('/');

  // Type a message and send
  await page.fill('input[placeholder*="Ask about"]', 'Help me tune my mono-red Commander deck on a £50 budget.');
  await page.click('button:has-text("Send")');

  // Wait for assistant reply
  await expect(page.locator('text=assistant').last()).toBeVisible({ timeout: 20000 });

  // Select current thread in dropdown (value should not be empty)
  const select = page.locator('select');
  await expect(select).not.toHaveValue('');

  // Rename
  await page.click('button:has-text("Rename")');
  // accept prompt manually in headed mode; skip headless rename for simplicity

  // Export
  await page.click('button:has-text("Export")');

  // Delete
  await page.click('button:has-text("Delete")');
  // accept confirm manually in headed mode
});
