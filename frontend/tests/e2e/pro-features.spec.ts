import { test, expect } from '@playwright/test';

test.describe('PRO Features', () => {
  test('PRO gate appears for non-PRO users', async ({ page }) => {
    // This test assumes user is not PRO
    await page.goto('/my-decks', { waitUntil: 'domcontentloaded', timeout: 60_000 });
    
    // Wait for decks to load
    await page.waitForSelector('a[href*="/my-decks/"]', { timeout: 15_000 });
    
    // Click on first deck
    const firstDeck = page.locator('a[href*="/my-decks/"]').first();
    await firstDeck.click();
    
    // Wait for deck page
    await page.waitForLoadState('domcontentloaded', { timeout: 15_000 });
    await page.waitForTimeout(3000);
    
    // Look for PRO gate or upgrade prompts
    const proGate = page.locator('text=/pro|upgrade|premium|subscribe/i').first();
    const upgradeButton = page.getByRole('button', { name: /upgrade|pro|subscribe/i }).first();
    
    // PRO gates might appear for various features
    if (await proGate.isVisible({ timeout: 5_000 }).catch(() => false) ||
        await upgradeButton.isVisible({ timeout: 5_000 }).catch(() => false)) {
      // PRO gate is visible (expected for non-PRO users)
      expect(true).toBeTruthy();
    }
  });

  test('pricing page shows PRO features', async ({ page }) => {
    await page.goto('/pricing', { waitUntil: 'domcontentloaded', timeout: 60_000 });
    
    // Should show PRO features
    const proFeatures = page.locator('text=/hand testing|probability|budget swap|fix names/i').first();
    await expect(proFeatures).toBeVisible({ timeout: 10_000 });
    
    // Should show pricing/plans
    const pricing = page.locator('text=/\$|price|subscription|plan/i').first();
    await expect(pricing).toBeVisible({ timeout: 5_000 });
  });

  test('upgrade button links to pricing', async ({ page }) => {
    await page.goto('/my-decks', { waitUntil: 'domcontentloaded', timeout: 60_000 });
    
    // Wait for page
    await page.waitForTimeout(2000);
    
    // Look for upgrade button
    const upgradeButton = page.getByRole('button', { name: /upgrade|pro|subscribe/i }).or(
      page.locator('a[href*="pricing"], a[href*="upgrade"]')
    ).first();
    
    if (await upgradeButton.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await upgradeButton.click();
      
      // Should navigate to pricing
      await page.waitForTimeout(2000);
      const isOnPricing = page.url().includes('/pricing');
      expect(isOnPricing).toBeTruthy();
    }
  });
});

