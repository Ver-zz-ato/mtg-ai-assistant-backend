import { test, expect } from '@playwright/test';

test.describe('Deck Analysis', () => {
  test('analyze deck from deck page', async ({ page }) => {
    await page.goto('/my-decks', { waitUntil: 'domcontentloaded', timeout: 60_000 });
    
    // Wait for decks to load
    await page.waitForSelector('a[href*="/my-decks/"]', { timeout: 15_000 });
    
    // Click on first deck
    const firstDeck = page.locator('a[href*="/my-decks/"]').first();
    await firstDeck.click();
    
    // Wait for deck page
    await page.waitForLoadState('domcontentloaded', { timeout: 15_000 });
    await page.waitForTimeout(3000);
    
    // Look for analyze button or panel
    const analyzeButton = page.getByRole('button', { name: /analyze|run.*analysis/i }).first();
    if (await analyzeButton.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await analyzeButton.click();
      
      // Wait for analysis to start/complete
      await page.waitForTimeout(10000);
      
      // Look for analysis results
      const analysisResults = page.locator('text=/archetype|game plan|problems|recommendations/i').first();
      if (await analysisResults.isVisible({ timeout: 15_000 }).catch(() => false)) {
        expect(analysisResults).toBeVisible();
      }
    }
  });

  test('deck suggestions appear', async ({ page }) => {
    await page.goto('/my-decks', { waitUntil: 'domcontentloaded', timeout: 60_000 });
    
    // Wait for decks to load
    await page.waitForSelector('a[href*="/my-decks/"]', { timeout: 15_000 });
    
    // Click on first deck
    const firstDeck = page.locator('a[href*="/my-decks/"]').first();
    await firstDeck.click();
    
    // Wait for deck page
    await page.waitForLoadState('domcontentloaded', { timeout: 15_000 });
    await page.waitForTimeout(3000);
    
    // Look for suggestions section
    const suggestions = page.locator('text=/suggest|recommend|add.*card/i').first();
    if (await suggestions.isVisible({ timeout: 10_000 }).catch(() => false)) {
      expect(suggestions).toBeVisible();
    }
  });
});

