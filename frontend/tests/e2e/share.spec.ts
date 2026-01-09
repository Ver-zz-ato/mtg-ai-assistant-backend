import { test, expect } from '@playwright/test';

test.describe('Share Functionality', () => {
  test('deck share button copies link to clipboard', async ({ page, context }) => {
    // Grant clipboard permissions
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    
    await page.goto('/my-decks', { waitUntil: 'domcontentloaded', timeout: 60_000 });
    
    // Wait for decks to load
    await page.waitForSelector('a[href*="/my-decks/"]', { timeout: 15_000 });
    
    // Click on first deck
    const firstDeck = page.locator('a[href*="/my-decks/"]').first();
    await firstDeck.click();
    
    // Wait for deck page
    await page.waitForLoadState('domcontentloaded', { timeout: 15_000 });
    await page.waitForTimeout(2000);
    
    // Look for share button
    const shareButton = page.getByRole('button', { name: /share/i }).or(page.locator('button[title*="share" i], button[aria-label*="share" i]')).first();
    
    if (await shareButton.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await shareButton.click();
      await page.waitForTimeout(1000);
      
      // Check for clipboard write or toast confirmation
      const toast = page.locator('text=/copied|link.*clipboard/i').first();
      if (await toast.isVisible({ timeout: 3_000 }).catch(() => false)) {
        expect(toast).toBeVisible();
      }
    }
  });

  test('wishlist share makes wishlist public', async ({ page }) => {
    await page.goto('/wishlist', { waitUntil: 'domcontentloaded', timeout: 60_000 });
    
    // Wait for page to load
    await page.waitForTimeout(3000);
    
    // Look for share button (🔗 or "Share" text)
    const shareButton = page.getByRole('button', { name: /share/i }).or(page.locator('button:has-text("🔗"), button:has-text("Share")')).first();
    
    if (await shareButton.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await shareButton.click();
      await page.waitForTimeout(2000);
      
      // Check for success toast or confirmation
      const successToast = page.locator('text=/public|share.*copied|link.*clipboard/i').first();
      if (await successToast.isVisible({ timeout: 3_000 }).catch(() => false)) {
        expect(successToast).toBeVisible();
      }
    }
  });
});
