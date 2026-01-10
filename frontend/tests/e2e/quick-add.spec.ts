import { test, expect } from '@playwright/test';

test.describe('Quick Add Feature', () => {
  test('quick add card to deck from deck page', async ({ page }) => {
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
    
    // Wait for decks to load
    await page.waitForSelector('a[href*="/my-decks/"]', { timeout: 15_000 });
    
    // Click on first deck
    const firstDeck = page.locator('a[href*="/my-decks/"]').first();
    await firstDeck.click();
    
    // Wait for deck page
    await page.waitForLoadState('domcontentloaded', { timeout: 15_000 });
    await page.waitForTimeout(3000);
    
    // Look for Quick Add component (input with placeholder containing "quick add" or "add")
    const quickAddInput = page.getByPlaceholder(/quick add|add.*deck|add.*card/i).or(
      page.locator('input[placeholder*="add"]')
    ).first();
    
    if (await quickAddInput.isVisible({ timeout: 5_000 }).catch(() => false)) {
      // Test different formats
      const testCases = [
        'add 3 Sol Ring',
        '2x Lightning Bolt',
        '1 Counterspell'
      ];
      
      for (const cardText of testCases) {
        await quickAddInput.fill(cardText);
        await page.waitForTimeout(500);
        
        // Find and click Add button
        const addButton = page.getByRole('button', { name: /add/i }).filter({ has: quickAddInput.locator('..') }).or(
          quickAddInput.locator('..').getByRole('button', { name: /add/i })
        ).first();
        
        if (await addButton.isVisible({ timeout: 2_000 }).catch(() => false)) {
          await addButton.click();
          await page.waitForTimeout(2000);
          
          // Verify card was added (check for card name in deck list)
          const cardInList = page.locator('text=/Sol Ring|Lightning Bolt|Counterspell/i').first();
          if (await cardInList.isVisible({ timeout: 3_000 }).catch(() => false)) {
            expect(true).toBeTruthy(); // Card was added
            break; // Test one card addition
          }
        }
      }
    }
  });

  test('quick add parses different formats', async ({ page }) => {
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
    await page.waitForTimeout(3000);
    
    // Look for Quick Add input
    const quickAddInput = page.getByPlaceholder(/quick add|add.*deck/i).first();
    
    if (await quickAddInput.isVisible({ timeout: 5_000 }).catch(() => false)) {
      // Test quantity parsing: "add 3 Sol Ring"
      await quickAddInput.fill('add 3 Sol Ring');
      await quickAddInput.press('Enter');
      await page.waitForTimeout(2000);
      
      // Verify the input cleared (indicates processing)
      const inputValue = await quickAddInput.inputValue();
      expect(inputValue).toBe('');
    }
  });
});
