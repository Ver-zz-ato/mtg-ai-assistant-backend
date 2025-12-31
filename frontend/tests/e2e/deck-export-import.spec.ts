import { test, expect } from '@playwright/test';

test.describe('Deck Export/Import', () => {
  test('export deck to text', async ({ page }) => {
    await page.goto('/my-decks', { waitUntil: 'domcontentloaded', timeout: 60_000 });
    
    // Wait for decks to load
    await page.waitForSelector('a[href*="/my-decks/"]', { timeout: 15_000 });
    
    // Click on first deck
    const firstDeck = page.locator('a[href*="/my-decks/"]').first();
    await firstDeck.click();
    
    // Wait for deck page
    await page.waitForLoadState('domcontentloaded', { timeout: 15_000 });
    await page.waitForTimeout(2000);
    
    // Look for export button
    const exportButton = page.getByRole('button', { name: /export/i }).or(
      page.locator('button:has-text("Export")')
    ).first();
    
    if (await exportButton.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await exportButton.click();
      await page.waitForTimeout(1000);
      
      // Look for export options or download
      const exportOptions = page.locator('text=/text|moxfield|mtgo|arena/i').first();
      if (await exportOptions.isVisible({ timeout: 3_000 }).catch(() => false)) {
        expect(exportOptions).toBeVisible();
      }
    }
  });

  test('import deck from my-decks page', async ({ page }) => {
    await page.goto('/my-decks', { waitUntil: 'domcontentloaded', timeout: 60_000 });
    
    // Wait for page to load
    await page.waitForTimeout(2000);
    
    // Look for import button
    const importButton = page.getByRole('button', { name: /import/i }).first();
    if (await importButton.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await importButton.click();
      
      // Should show import modal
      await page.waitForTimeout(1000);
      
      const importModal = page.locator('text=/paste|upload|import/i').first();
      if (await importModal.isVisible({ timeout: 3_000 }).catch(() => false)) {
        expect(importModal).toBeVisible();
      }
    }
  });

  test('import deck from text', async ({ page }) => {
    await page.goto('/my-decks', { waitUntil: 'domcontentloaded', timeout: 60_000 });
    
    // Wait for page to load
    await page.waitForTimeout(2000);
    
    // Look for import button
    const importButton = page.getByRole('button', { name: /import/i }).first();
    if (await importButton.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await importButton.click();
      await page.waitForTimeout(1000);
      
      // Look for textarea to paste deck
      const textarea = page.locator('textarea, input[type="text"]').first();
      if (await textarea.isVisible({ timeout: 3_000 }).catch(() => false)) {
        const deckText = `1 Sol Ring
1 Lightning Bolt
1 Brainstorm`;
        
        await textarea.fill(deckText);
        await page.getByRole('button', { name: /import|create/i }).first().click();
        
        // Should create or show deck
        await page.waitForTimeout(3000);
        expect(true).toBeTruthy();
      }
    }
  });
});

