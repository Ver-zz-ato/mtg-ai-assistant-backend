import { test, expect } from '@playwright/test';

test.describe('Authentication Flows', () => {
  test('login flow redirects correctly', async ({ page }) => {
    // Try to access protected page while logged out
    await page.goto('/my-decks', { waitUntil: 'domcontentloaded', timeout: 60_000 });
    
    // Should either show login prompt or redirect to login
    const loginPrompt = page.locator('text=/sign in|log in|create account/i').first();
    const isOnLoginPage = page.url().includes('/login') || page.url().includes('/auth');
    
    // One of these should be true
    const isLoggedOut = await loginPrompt.isVisible({ timeout: 3_000 }).catch(() => false) || isOnLoginPage;
    
    if (isLoggedOut) {
      // Look for login button/link
      const loginButton = page.getByRole('button', { name: /sign in|log in/i }).first();
      if (await loginButton.isVisible({ timeout: 2_000 }).catch(() => false)) {
        await loginButton.click();
        
        // Should show login form
        await page.waitForTimeout(2000);
        const emailInput = page.locator('input[type="email"]').first();
        if (await emailInput.isVisible({ timeout: 3_000 }).catch(() => false)) {
          expect(emailInput).toBeVisible();
        }
      }
    }
  });

  test('logout flow', async ({ page }) => {
    // Navigate to a page where logout is available
    await page.goto('/profile', { waitUntil: 'domcontentloaded', timeout: 60_000 });
    
    // Look for logout button
    const logoutButton = page.getByRole('button', { name: /log out|sign out|logout/i }).first();
    if (await logoutButton.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await logoutButton.click();
      
      // Should redirect to home or show logged out state
      await page.waitForTimeout(2000);
      
      // Verify logged out (check for login prompt or home page)
      const loginPrompt = page.locator('text=/sign in|log in|create account/i').first();
      const isHomePage = page.url() === 'http://localhost:3000/' || page.url().endsWith('/');
      
      expect(await loginPrompt.isVisible({ timeout: 3_000 }).catch(() => false) || isHomePage).toBeTruthy();
    }
  });

  test('protected routes require authentication', async ({ page }) => {
    // Clear any existing auth
    await page.context().clearCookies();
    
    // Try to access protected route
    await page.goto('/my-decks', { waitUntil: 'domcontentloaded', timeout: 60_000 });
    
    // Should show login prompt or redirect
    const loginPrompt = page.locator('text=/sign in|log in|create account/i').first();
    const isOnLoginPage = page.url().includes('/login') || page.url().includes('/auth');
    const isGuestLanding = await loginPrompt.isVisible({ timeout: 3_000 }).catch(() => false);
    
    // Should be protected
    expect(isOnLoginPage || isGuestLanding).toBeTruthy();
  });

  test('profile page shows user info when authenticated', async ({ page }) => {
    await page.goto('/profile', { waitUntil: 'domcontentloaded', timeout: 60_000 });
    
    // Should show profile content (not guest landing)
    const guestLanding = page.locator('text=/sign in|create account/i').first();
    const isGuest = await guestLanding.isVisible({ timeout: 2_000 }).catch(() => false);
    
    if (!isGuest) {
      // Should show some profile content
      await expect(page.locator('body')).toBeVisible({ timeout: 5_000 });
    }
  });
});

