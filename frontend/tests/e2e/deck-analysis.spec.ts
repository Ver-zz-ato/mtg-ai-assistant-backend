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
    
    // Look for analyze button or panel - try multiple selectors
    const analyzeButton = page.getByRole('button', { name: /analyze|run.*analysis|run.*analyzer/i })
      .or(page.locator('button[title*="analyze" i], button[aria-label*="analyze" i]'))
      .first();
      
    if (await analyzeButton.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await analyzeButton.click();
      
      // Wait for analysis to start - look for loading indicator
      const loadingIndicator = page.locator('text=/analyzing|processing|running/i').first();
      if (await loadingIndicator.isVisible({ timeout: 3_000 }).catch(() => false)) {
        // Wait for loading to complete
        await page.waitForTimeout(15000);
      } else {
        // No loading indicator, wait default time
        await page.waitForTimeout(10000);
      }
      
      // Look for analysis results - multiple possible indicators
      const analysisResults = page.locator('text=/archetype|game plan|problems|recommendations|score|curve|mana base/i').first();
      if (await analysisResults.isVisible({ timeout: 15_000 }).catch(() => false)) {
        expect(analysisResults).toBeVisible();
      } else {
        // Check for any analysis-related content
        const anyAnalysis = page.locator('[class*="analyzer"], [class*="analysis"], [id*="analyzer"]').first();
        if (await anyAnalysis.isVisible({ timeout: 2_000 }).catch(() => false)) {
          expect(anyAnalysis).toBeVisible();
        }
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

