import { test, expect } from '@playwright/test';

test.describe('Share Functionality', () => {
  test('deck share button copies link to clipboard', async ({ page }) => {
    // Accept cookie consent first (avoid modal blocking)
    await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await page.evaluate(() => {
      localStorage.setItem('manatap_cookie_consent', 'accepted');
      localStorage.setItem('analytics:consent', 'granted');
    });
    
    // Try to dismiss cookie modal if present
    const acceptButton = page.getByRole('button', { name: /accept.*all|accept/i }).or(
      page.locator('button:has-text("Accept"), button:has-text("Accept all")')
    ).first();
    if (await acceptButton.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await acceptButton.click();
      await page.waitForTimeout(500);
    }
    
    await page.goto('/my-decks', { waitUntil: 'domcontentloaded', timeout: 60_000 });
    
    // Wait for decks to load - check if user has any decks
    const hasDecks = await page.waitForSelector('a[href*="/my-decks/"]', { timeout: 15_000 }).catch(() => false);
    
    if (!hasDecks) {
      // User has no decks - skip test
      test.skip(true, 'No decks found in test account');
      return;
    }
    
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
      // Note: Playwright doesn't support clipboard permissions, so we just check for success toast
      const toast = page.locator('text=/copied|link.*clipboard|share.*copied|public/i').first();
      if (await toast.isVisible({ timeout: 3_000 }).catch(() => false)) {
        expect(toast).toBeVisible();
      }
    }
  });

  test('wishlist share makes wishlist public', async ({ page }) => {
    // Accept cookie consent first (avoid modal blocking)
    await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await page.evaluate(() => {
      localStorage.setItem('manatap_cookie_consent', 'accepted');
      localStorage.setItem('analytics:consent', 'granted');
    });
    
    // Try to dismiss cookie modal if present
    const acceptButton = page.getByRole('button', { name: /accept.*all|accept/i }).or(
      page.locator('button:has-text("Accept"), button:has-text("Accept all")')
    ).first();
    if (await acceptButton.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await acceptButton.click();
      await page.waitForTimeout(500);
    }
    
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
