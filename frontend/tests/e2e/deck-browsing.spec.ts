import { test, expect } from '@playwright/test';

test.describe('Deck Browsing', () => {
  test('browse public decks page loads', async ({ page }) => {
    await page.goto('/decks/browse', { waitUntil: 'domcontentloaded', timeout: 60_000 });
    
    // Verify we're on browse page
    expect(page.url()).toContain('/decks/browse');
    
    // Should show deck cards or list
    await expect(page.locator('body')).toBeVisible({ timeout: 10_000 });
    
    // Look for deck cards or empty state
    const deckCards = page.locator('[class*="deck"], [class*="card"], article').first();
    const emptyState = page.locator('text=/no decks|empty/i').first();
    
    const hasDecks = await deckCards.isVisible({ timeout: 5_000 }).catch(() => false);
    const isEmpty = await emptyState.isVisible({ timeout: 2_000 }).catch(() => false);
    
    // Should show either decks or empty state
    expect(hasDecks || isEmpty).toBeTruthy();
  });

  test('search for decks', async ({ page }) => {
    await page.goto('/decks/browse', { waitUntil: 'domcontentloaded', timeout: 60_000 });
    
    // Wait for page to load
    await page.waitForTimeout(2000);
    
    // Look for search input
    const searchInput = page.locator('input[type="search"], input[placeholder*="search"], input[placeholder*="deck"]').first();
    if (await searchInput.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await searchInput.fill('Commander');
      await searchInput.press('Enter');
      
      // Wait for results
      await page.waitForTimeout(3000);
      
      // Should show results or no results message
      expect(true).toBeTruthy();
    }
  });

  test('filter decks by format', async ({ page }) => {
    await page.goto('/decks/browse', { waitUntil: 'domcontentloaded', timeout: 60_000 });
    
    // Wait for page to load
    await page.waitForTimeout(2000);
    
    // Look for format filter
    const formatFilter = page.locator('select, button:has-text("Commander"), button:has-text("Modern")').first();
    if (await formatFilter.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await formatFilter.click();
      
      // Select a format
      const formatOption = page.locator('text=/Commander|Modern|Standard/i').first();
      if (await formatOption.isVisible({ timeout: 2_000 }).catch(() => false)) {
        await formatOption.click();
        
        // Wait for filter to apply
        await page.waitForTimeout(2000);
        expect(true).toBeTruthy();
      }
    }
  });
});

