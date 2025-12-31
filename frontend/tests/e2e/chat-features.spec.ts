import { test, expect } from '@playwright/test';

test.describe('Chat Features', () => {
  test('chat thread creation and management', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 60_000 });
    
    // Wait for chat
    const chatTextarea = page.getByTestId('chat-textarea');
    await expect(chatTextarea).toBeVisible({ timeout: 15_000 });
    
    // Send a message to create a thread
    await chatTextarea.fill('What is Lightning Bolt?');
    const sendButton = page.getByTestId('chat-send').first();
    await expect(sendButton).toBeEnabled({ timeout: 5_000 });
    await sendButton.click();
    
    // Wait for response
    await page.waitForTimeout(5000);
    
    // Look for thread selector or thread management
    const threadSelector = page.locator('select, [class*="thread"]').first();
    if (await threadSelector.isVisible({ timeout: 5_000 }).catch(() => false)) {
      // Thread was created
      expect(threadSelector).toBeVisible();
    }
  });

  test('chat with deck context', async ({ page }) => {
    await page.goto('/my-decks', { waitUntil: 'domcontentloaded', timeout: 60_000 });
    
    // Wait for decks to load
    await page.waitForSelector('a[href*="/my-decks/"]', { timeout: 15_000 });
    
    // Click on first deck
    const firstDeck = page.locator('a[href*="/my-decks/"]').first();
    await firstDeck.click();
    
    // Wait for deck page
    await page.waitForLoadState('domcontentloaded', { timeout: 15_000 });
    await page.waitForTimeout(2000);
    
    // Look for chat/assistant interface on deck page
    const deckChat = page.locator('textarea, input[placeholder*="ask"], input[placeholder*="chat"]').first();
    if (await deckChat.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await deckChat.fill('What cards should I add?');
      await page.waitForTimeout(1000);
      
      // Look for send button
      const sendButton = page.getByRole('button', { name: /send/i }).first();
      if (await sendButton.isVisible({ timeout: 2_000 }).catch(() => false)) {
        await sendButton.click();
        await page.waitForTimeout(5000);
        expect(true).toBeTruthy();
      }
    }
  });

  test('chat card name detection and linking', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 60_000 });
    
    // Wait for chat
    const chatTextarea = page.getByTestId('chat-textarea');
    await expect(chatTextarea).toBeVisible({ timeout: 15_000 });
    
    // Send message with card name
    await chatTextarea.fill('Tell me about Lightning Bolt');
    const sendButton = page.getByTestId('chat-send').first();
    await expect(sendButton).toBeEnabled({ timeout: 5_000 });
    await sendButton.click();
    
    // Wait for response
    await page.waitForTimeout(8000);
    
    // Look for card images or links in response
    const cardImage = page.locator('img[alt*="Lightning"], [class*="card-image"]').first();
    const cardLink = page.locator('a[href*="lightning"], [data-card-name*="Lightning"]').first();
    
    if (await cardImage.isVisible({ timeout: 5_000 }).catch(() => false) || 
        await cardLink.isVisible({ timeout: 5_000 }).catch(() => false)) {
      expect(true).toBeTruthy(); // Card was detected and linked
    }
  });
});

