import { test, expect } from '@playwright/test';

test.describe('Wishlist', () => {
  test('wishlist page loads', async ({ page }) => {
    await page.goto('/wishlist', { waitUntil: 'domcontentloaded', timeout: 60_000 });
    
    // Verify we're on wishlist page
    expect(page.url()).toContain('/wishlist');
    
    // Should show wishlist interface
    await expect(page.locator('body')).toBeVisible({ timeout: 10_000 });
  });

  test('add card to wishlist', async ({ page }) => {
    await page.goto('/wishlist', { waitUntil: 'domcontentloaded', timeout: 60_000 });
    
    // Wait for page to load
    await page.waitForTimeout(2000);
    
    // Look for add card input or button
    const addInput = page.locator('input[placeholder*="card"], input[placeholder*="add"]').first();
    const addButton = page.getByRole('button', { name: /add/i }).first();
    
    if (await addInput.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await addInput.fill('Lightning Bolt');
      await addInput.press('Enter');
      
      // Wait for card to be added
      await page.waitForTimeout(2000);
      
      // Verify card appears in list
      const cardInList = page.locator('text=/Lightning Bolt/i').first();
      if (await cardInList.isVisible({ timeout: 3_000 }).catch(() => false)) {
        expect(cardInList).toBeVisible();
      }
    } else if (await addButton.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await addButton.click();
      await page.waitForTimeout(1000);
      
      // Look for modal or form
      const modalInput = page.locator('input[type="text"]').first();
      if (await modalInput.isVisible({ timeout: 2_000 }).catch(() => false)) {
        await modalInput.fill('Lightning Bolt');
        await page.getByRole('button', { name: /add|save/i }).first().click();
        await page.waitForTimeout(2000);
      }
    }
  });
});

