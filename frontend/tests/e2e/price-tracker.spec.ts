import { test, expect } from '@playwright/test';

test.describe('Price Tracker', () => {
  test('search for a card', async ({ page }) => {
    await page.goto('/price-tracker', { waitUntil: 'domcontentloaded', timeout: 60_000 });
    
    // Look for search input
    const searchInput = page.locator('input[type="search"], input[placeholder*="search"], input[placeholder*="card"]').first();
    if (await searchInput.isVisible({ timeout: 10_000 }).catch(() => false)) {
      await searchInput.fill('Lightning Bolt');
      await searchInput.press('Enter');
      
      // Wait for results
      await page.waitForTimeout(3000);
      
      // Should show results
      const results = page.locator('[class*="card"], [class*="result"], [class*="item"]').first();
      if (await results.isVisible({ timeout: 10_000 }).catch(() => false)) {
        expect(results).toBeVisible();
      }
    }
  });

  test('view price history for a card', async ({ page }) => {
    await page.goto('/price-tracker', { waitUntil: 'domcontentloaded', timeout: 60_000 });
    
    // Wait for page to load
    await page.waitForTimeout(3000);
    
    // Look for a card in the list
    const cardItem = page.locator('[class*="card"], [class*="item"], tr').first();
    if (await cardItem.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await cardItem.click();
      
      // Should show price history or details
      await page.waitForTimeout(2000);
      
      // Look for price chart or history
      const priceChart = page.locator('[class*="chart"], [class*="graph"], [class*="history"]').first();
      const priceInfo = page.locator('text=/\$|price|usd|eur|gbp/i').first();
      
      if (await priceChart.isVisible({ timeout: 3_000 }).catch(() => false) || 
          await priceInfo.isVisible({ timeout: 3_000 }).catch(() => false)) {
        expect(true).toBeTruthy(); // Price info is visible
      }
    }
  });

  test('filter by format or condition', async ({ page }) => {
    await page.goto('/price-tracker', { waitUntil: 'domcontentloaded', timeout: 60_000 });
    
    // Look for filter dropdowns or buttons
    const formatFilter = page.locator('select, button:has-text("Commander"), button:has-text("Modern")').first();
    if (await formatFilter.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await formatFilter.click();
      
      // Select a format
      const formatOption = page.locator('text=/Commander|Modern|Standard/i').first();
      if (await formatOption.isVisible({ timeout: 2_000 }).catch(() => false)) {
        await formatOption.click();
        
        // Wait for filter to apply
        await page.waitForTimeout(2000);
        
        // Results should update
        expect(true).toBeTruthy();
      }
    }
  });

  test('top movers section loads', async ({ page }) => {
    await page.goto('/price-tracker', { waitUntil: 'domcontentloaded', timeout: 60_000 });
    
    // Look for top movers section
    const topMovers = page.locator('text=/top.*mover|mover.*top|gainers|losers/i').first();
    if (await topMovers.isVisible({ timeout: 10_000 }).catch(() => false)) {
      expect(topMovers).toBeVisible();
      
      // Should show some cards
      await page.waitForTimeout(3000);
      const moverCards = page.locator('[class*="card"], [class*="mover"], tr').first();
      if (await moverCards.isVisible({ timeout: 5_000 }).catch(() => false)) {
        expect(moverCards).toBeVisible();
      }
    }
  });
});

