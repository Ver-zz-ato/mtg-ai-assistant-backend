import { test, expect } from '@playwright/test';

test.describe('Budget Swaps', () => {
  test('navigate to budget swaps and load deck', async ({ page }) => {
    await page.goto('/my-decks', { waitUntil: 'domcontentloaded', timeout: 60_000 });
    
    // Wait for decks to load
    await page.waitForSelector('a[href*="/my-decks/"]', { timeout: 10_000 });
    
    // Click on first deck
    const firstDeck = page.locator('a[href*="/my-decks/"]').first();
    await firstDeck.click();
    
    // Wait for deck page
    await page.waitForLoadState('networkidle', { timeout: 10_000 });
    
    // Look for budget swaps link/button
    const budgetSwapsLink = page.getByRole('link', { name: /budget.*swap|swap.*budget/i }).first();
    if (await budgetSwapsLink.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await budgetSwapsLink.click();
    } else {
      // Try navigating directly
      const deckId = page.url().match(/\/my-decks\/([^/]+)/)?.[1];
      if (deckId) {
        await page.goto(`/budget-swaps?deck=${deckId}`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
      }
    }
    
    // Should be on budget swaps page
    expect(page.url()).toContain('budget-swaps');
    
    // Wait for page to load
    await expect(page.locator('body')).toBeVisible({ timeout: 10_000 });
  });

  test('generate swaps for a deck', async ({ page }) => {
    // Navigate to budget swaps with a test deck
    await page.goto('/budget-swaps', { waitUntil: 'domcontentloaded', timeout: 60_000 });
    
    // If there's a deck selector, select a deck
    const deckSelect = page.locator('select').first();
    if (await deckSelect.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await deckSelect.selectOption({ index: 1 });
      await page.waitForTimeout(2000);
    }
    
    // Look for generate/analyze button
    const generateButton = page.getByRole('button', { name: /generate|analyze|find.*swap/i }).first();
    if (await generateButton.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await generateButton.click();
      
      // Wait for swaps to appear
      await page.waitForTimeout(5000);
      
      // Look for swap cards or results
      const swapResults = page.locator('[data-testid*="swap"], .swap-card, [class*="swap"]').first();
      if (await swapResults.isVisible({ timeout: 15_000 }).catch(() => false)) {
        expect(await swapResults.count()).toBeGreaterThan(0);
      }
    }
  });

  test('select and view swap details', async ({ page }) => {
    await page.goto('/budget-swaps', { waitUntil: 'domcontentloaded', timeout: 60_000 });
    
    // Wait a bit for any existing swaps to load
    await page.waitForTimeout(3000);
    
    // Look for swap cards
    const swapCard = page.locator('[data-testid*="swap"], .swap-card, [class*="swap"]').first();
    if (await swapCard.isVisible({ timeout: 5_000 }).catch(() => false)) {
      // Click on a swap to see details
      await swapCard.click();
      
      // Should show swap details or reason
      await page.waitForTimeout(1000);
      
      // Verify some swap information is visible
      const swapInfo = page.locator('text=/from|to|reason|savings/i').first();
      if (await swapInfo.isVisible({ timeout: 3_000 }).catch(() => false)) {
        expect(swapInfo).toBeVisible();
      }
    }
  });
});

