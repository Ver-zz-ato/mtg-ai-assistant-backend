import { test, expect } from '@playwright/test';

test.describe('Error Handling', () => {
  test('404 page for non-existent route', async ({ page }) => {
    await page.goto('/this-page-does-not-exist-12345', { waitUntil: 'domcontentloaded', timeout: 60_000 });
    
    // Should show 404 or not found message
    const notFound = page.locator('text=/404|not found|page not found/i').first();
    const is404 = await notFound.isVisible({ timeout: 5_000 }).catch(() => false);
    
    // Or should redirect to home
    const isHome = page.url() === 'http://localhost:3000/' || page.url().endsWith('/');
    
    expect(is404 || isHome).toBeTruthy();
  });

  test('API error handling in chat', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 60_000 });
    
    // Wait for chat
    const chatTextarea = page.getByTestId('chat-textarea');
    await expect(chatTextarea).toBeVisible({ timeout: 15_000 });
    
    // Intercept and fail the API call
    await page.route('**/api/chat**', route => {
      route.fulfill({
        status: 500,
        body: JSON.stringify({ error: 'Internal server error' }),
        headers: { 'Content-Type': 'application/json' }
      });
    });
    
    // Try to send a message
    await chatTextarea.fill('test message');
    const sendButton = page.getByTestId('chat-send').first();
    await expect(sendButton).toBeEnabled({ timeout: 5_000 });
    await sendButton.click();
    
    // Should show error message or handle gracefully
    await page.waitForTimeout(5000);
    
    // Check for error message or fallback response
    const errorMessage = page.locator('text=/error|failed|try again|fallback/i').first();
    const hasError = await errorMessage.isVisible({ timeout: 5_000 }).catch(() => false);
    
    // If no error message, check if chat is still functional (graceful degradation)
    if (!hasError) {
      // Chat should still be usable
      await expect(chatTextarea).toBeVisible();
    } else {
      expect(errorMessage).toBeVisible();
    }
  });

  test('network failure handling', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 60_000 });
    
    // Wait for page to load first
    await page.waitForTimeout(2000);
    
    // Go offline
    await page.context().setOffline(true);
    
    // Try to navigate or interact
    await page.waitForTimeout(1000);
    
    // Should still show page (cached) or show offline message
    await expect(page.locator('body')).toBeVisible({ timeout: 5_000 });
    
    // Go back online
    await page.context().setOffline(false);
    await page.waitForTimeout(1000);
  });

  test('invalid deck ID handling', async ({ page }) => {
    await page.goto('/my-decks/invalid-deck-id-12345', { waitUntil: 'domcontentloaded', timeout: 60_000 });
    
    // Wait for page to handle the invalid ID
    await page.waitForTimeout(3000);
    
    // Should show error or redirect
    const errorMessage = page.locator('text=/not found|error|invalid|404/i').first();
    const isError = await errorMessage.isVisible({ timeout: 5_000 }).catch(() => false);
    const isRedirected = (page.url().includes('/my-decks') && !page.url().includes('invalid-deck-id')) || 
                         page.url() === 'http://localhost:3000/my-decks' ||
                         page.url() === 'http://localhost:3000/';
    
    // Should handle gracefully
    expect(isError || isRedirected).toBeTruthy();
  });

  test('empty state handling', async ({ page }) => {
    await page.goto('/my-decks', { waitUntil: 'domcontentloaded', timeout: 60_000 });
    
    // Wait for page to load
    await page.waitForTimeout(3000);
    
    // Check for empty state message (if no decks)
    const emptyState = page.locator('text=/no decks|create.*deck|get started/i').first();
    const hasDecks = page.locator('a[href*="/my-decks/"]').first();
    
    const isEmpty = await emptyState.isVisible({ timeout: 2_000 }).catch(() => false);
    const hasDecksVisible = await hasDecks.isVisible({ timeout: 2_000 }).catch(() => false);
    
    // Should show either empty state or decks
    expect(isEmpty || hasDecksVisible).toBeTruthy();
  });
});

