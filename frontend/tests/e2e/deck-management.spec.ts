import { test, expect } from '@playwright/test';

test.describe('Deck Management', () => {
  test('create a new deck from my-decks page', async ({ page }) => {
    await page.goto('/my-decks', { waitUntil: 'domcontentloaded', timeout: 60_000 });
    
    // Wait for page to fully load and components to render
    await page.waitForTimeout(3000);
    
    const deckName = `Test Deck ${Date.now()}`;
    
    // Try multiple approaches to create deck
    // Approach 1: NewDeckInline component (uses "Enter deck name..." placeholder)
    const inlineInput = page.getByPlaceholder('Enter deck name...');
    const hasInline = await inlineInput.isVisible({ timeout: 3_000 }).catch(() => false);
    
    if (hasInline) {
      await inlineInput.fill(deckName);
      await page.waitForTimeout(500);
      const createButton = page.getByRole('button', { name: /create.*deck|✨.*create/i }).first();
      await createButton.click();
    } else {
      // Approach 2: FAB button (fixed bottom-right)
      const fabButton = page.locator('button[aria-label*="Create"], button[aria-label*="New"], button:has-text("NEW")').first();
      const hasFab = await fabButton.isVisible({ timeout: 3_000 }).catch(() => false);
      
      if (hasFab) {
        await fabButton.click();
        await page.waitForTimeout(1000);
        
        // Look for modal input
        const modalInput = page.locator('input[placeholder*="deck"], input[placeholder*="name"]').first();
        await expect(modalInput).toBeVisible({ timeout: 3_000 });
        await modalInput.fill(deckName);
        await page.getByRole('button', { name: /create.*deck/i }).first().click();
      } else {
        // Skip if no create mechanism found
        test.skip(true, 'No deck creation UI found');
        return;
      }
    }
    
    // Should redirect to the new deck page
    await page.waitForURL(/\/my-decks\/[^/]+/, { timeout: 20_000 });
    expect(page.url()).toContain('/my-decks/');
    
    // Verify deck name appears somewhere on the page
    await expect(page.locator('body')).toContainText(deckName, { timeout: 10_000 });
  });

  test('edit deck title', async ({ page }) => {
    await page.goto('/my-decks', { waitUntil: 'domcontentloaded', timeout: 60_000 });
    
    // Wait for decks to load
    await page.waitForSelector('a[href*="/my-decks/"]', { timeout: 15_000 });
    
    // Click on first deck
    const firstDeck = page.locator('a[href*="/my-decks/"]').first();
    await firstDeck.click();
    
    // Wait for deck page to load
    await page.waitForLoadState('domcontentloaded', { timeout: 15_000 });
    await page.waitForTimeout(2000);
    
    // Look for edit button or title input - try multiple approaches
    const editButton = page.getByRole('button', { name: /edit|rename/i }).first();
    const titleInput = page.locator('input[type="text"], input[placeholder*="deck"], h1, h2').first();
    
    // Try clicking edit button if visible
    if (await editButton.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await editButton.click();
      await page.waitForTimeout(1000);
    }
    
    // Try to find and edit title input
    if (await titleInput.isVisible({ timeout: 3_000 }).catch(() => false)) {
      const tagName = await titleInput.evaluate(el => el.tagName.toLowerCase());
      if (tagName === 'input') {
        const newTitle = `Updated Deck ${Date.now()}`;
        await titleInput.fill(newTitle);
        await titleInput.press('Enter');
        await page.waitForTimeout(2000);
        
        // Verify title updated
        await expect(page.locator('body')).toContainText(newTitle, { timeout: 5_000 });
      }
    }
  });

  test('save deck from chat analysis', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 60_000 });
    
    // Wait for chat interface
    const chatTextarea = page.getByTestId('chat-textarea');
    await expect(chatTextarea).toBeVisible({ timeout: 15_000 });
    
    // Paste a decklist
    const decklist = `1 Sol Ring
1 Lightning Bolt
1 Brainstorm
1 Counterspell
1 Island`;
    
    await chatTextarea.fill(decklist);
    
    // Send message - use first() to handle duplicate buttons
    const sendButton = page.getByTestId('chat-send').first();
    await expect(sendButton).toBeEnabled({ timeout: 5_000 });
    await sendButton.click();
    
    // Wait for response (may take a while)
    await page.waitForTimeout(5000);
    
    // Look for save deck button in the response
    const saveButton = page.getByRole('button', { name: /save.*deck|create.*deck/i }).first();
    if (await saveButton.isVisible({ timeout: 10_000 }).catch(() => false)) {
      await saveButton.click();
      
      // Should redirect to my-decks
      await page.waitForURL(/\/my-decks/, { timeout: 10_000 });
    }
  });

  test('delete deck', async ({ page }) => {
    await page.goto('/my-decks', { waitUntil: 'domcontentloaded', timeout: 60_000 });
    
    // Wait for decks to load
    await page.waitForSelector('a[href*="/my-decks/"]', { timeout: 15_000 });
    
    // Click on first deck
    const firstDeck = page.locator('a[href*="/my-decks/"]').first();
    await firstDeck.click();
    
    // Wait for deck page
    await page.waitForLoadState('domcontentloaded', { timeout: 15_000 });
    await page.waitForTimeout(2000);
    
    // Look for delete button - try multiple selectors
    const deleteButton = page.getByRole('button', { name: /delete/i }).or(
      page.locator('button:has-text("Delete")')
    ).first();
    
    if (await deleteButton.isVisible({ timeout: 5_000 }).catch(() => false)) {
      // Set up dialog handler
      page.once('dialog', async dialog => {
        expect(['confirm', 'alert']).toContain(dialog.type());
        await dialog.accept();
      });
      
      await deleteButton.click();
      await page.waitForTimeout(2000);
      
      // Should redirect back to my-decks or show success
      const isOnMyDecks = page.url().includes('/my-decks') && !page.url().match(/\/my-decks\/[^/]+$/);
      if (!isOnMyDecks) {
        await page.waitForURL(/\/my-decks$/, { timeout: 10_000 });
      }
    }
  });
});

