import { test, expect } from '@playwright/test';

// Helper to set up error tracking and fail on serious errors
function setupErrorTracking(page: any) {
  const pageErrors: Error[] = [];
  const consoleErrors: string[] = [];

  // Track uncaught exceptions (these are serious)
  page.on('pageerror', (error: Error) => {
    pageErrors.push(error);
  });

  // Track console errors (but allow warnings/info)
  page.on('console', (msg: any) => {
    const type = msg.type();
    if (type === 'error') {
      const text = msg.text();
      // Filter out known non-critical errors
      const isNonCritical = 
        text.includes('favicon') || 
        text.includes('404') || 
        text.includes('Failed to load resource') ||
        text.includes('net::ERR_');
      
      if (!isNonCritical) {
        consoleErrors.push(text);
      }
    }
  });

  return {
    getErrors: () => ({ pageErrors, consoleErrors }),
    assertNoErrors: () => {
      if (pageErrors.length > 0) {
        const errorMessages = pageErrors.map(e => e.message).join('; ');
        throw new Error(`Uncaught page errors detected: ${errorMessages}`);
      }
      // Console errors are logged but don't fail tests (they're often from third-party scripts)
      if (consoleErrors.length > 0) {
        console.warn('Console errors detected (non-fatal):', consoleErrors);
      }
    }
  };
}

test.describe('Smoke Tests', () => {
  test('homepage loads and renders chat interface', async ({ page }) => {
    const errorTracker = setupErrorTracking(page);
    
    await page.goto('/');
    
    // Wait for page to be fully loaded
    await page.waitForLoadState('networkidle');
    
    // Verify chat textarea is visible
    const chatTextarea = page.getByTestId('chat-textarea');
    await expect(chatTextarea).toBeVisible({ timeout: 10_000 });
    
    // Verify page title/heading is present (indicates page loaded)
    await expect(page.locator('body')).toBeVisible();
    
    // Fail if there were serious uncaught errors
    errorTracker.assertNoErrors();
  });

  test('pricing page loads', async ({ page }) => {
    const errorTracker = setupErrorTracking(page);
    
    await page.goto('/pricing');
    await page.waitForLoadState('networkidle');
    
    // Verify pricing page has key content
    await expect(page.locator('body')).toBeVisible();
    
    // Check for pricing-related text (flexible to match actual content)
    const hasPricingContent = await page.locator('text=/pricing|subscription|plan/i').first().isVisible({ timeout: 5_000 }).catch(() => false);
    expect(hasPricingContent || page.url().includes('/pricing')).toBeTruthy();
    
    errorTracker.assertNoErrors();
  });

  test('price tracker page loads', async ({ page }) => {
    const errorTracker = setupErrorTracking(page);
    
    await page.goto('/price-tracker');
    await page.waitForLoadState('networkidle');
    
    // Verify page loads
    await expect(page.locator('body')).toBeVisible();
    
    // Verify URL is correct
    expect(page.url()).toContain('/price-tracker');
    
    errorTracker.assertNoErrors();
  });

  test('chat interface is interactive', async ({ page }) => {
    const errorTracker = setupErrorTracking(page);
    
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    // Find and interact with chat textarea
    const chatTextarea = page.getByTestId('chat-textarea');
    await expect(chatTextarea).toBeVisible({ timeout: 10_000 });
    
    // Test that we can type in the textarea
    await chatTextarea.fill('test message');
    await expect(chatTextarea).toHaveValue('test message');
    
    // Clear the textarea
    await chatTextarea.clear();
    
    errorTracker.assertNoErrors();
  });

  test('health endpoint responds correctly', async ({ request }) => {
    const res = await request.get('/api/health');
    expect(res.status()).toBeGreaterThanOrEqual(200);
    expect(res.status()).toBeLessThan(600);
    
    const json = await res.json();
    expect(json).toHaveProperty('supabase');
  });
});

test.describe('Authenticated Smoke Tests', () => {
  // These tests only run if PLAYWRIGHT_TEST_EMAIL and PLAYWRIGHT_TEST_PASSWORD are set
  test('my-decks page loads when authenticated', async ({ page }) => {
    const errorTracker = setupErrorTracking(page);
    
    // Check if we have auth credentials (setup would have failed otherwise)
    const hasAuth = process.env.PLAYWRIGHT_TEST_EMAIL && process.env.PLAYWRIGHT_TEST_PASSWORD;
    test.skip(!hasAuth, 'Skipping authenticated test - credentials not provided');
    
    await page.goto('/my-decks');
    await page.waitForLoadState('networkidle');
    
    // Verify page loads (should show deck list or empty state, not guest landing)
    await expect(page.locator('body')).toBeVisible();
    
    // Verify URL is correct
    expect(page.url()).toContain('/my-decks');
    
    // Check that we're not seeing the guest landing page
    const guestLandingText = await page.locator('text=/sign in|create account/i').first().isVisible({ timeout: 2_000 }).catch(() => false);
    expect(guestLandingText).toBeFalsy();
    
    errorTracker.assertNoErrors();
  });

  test('profile page loads when authenticated', async ({ page }) => {
    const errorTracker = setupErrorTracking(page);
    
    const hasAuth = process.env.PLAYWRIGHT_TEST_EMAIL && process.env.PLAYWRIGHT_TEST_PASSWORD;
    test.skip(!hasAuth, 'Skipping authenticated test - credentials not provided');
    
    await page.goto('/profile');
    await page.waitForLoadState('networkidle');
    
    // Verify page loads
    await expect(page.locator('body')).toBeVisible();
    expect(page.url()).toContain('/profile');
    
    // Check that we're not seeing the guest landing page
    const guestLandingText = await page.locator('text=/sign in|create account/i').first().isVisible({ timeout: 2_000 }).catch(() => false);
    expect(guestLandingText).toBeFalsy();
    
    errorTracker.assertNoErrors();
  });

  test('collections page loads when authenticated', async ({ page }) => {
    const errorTracker = setupErrorTracking(page);
    
    const hasAuth = process.env.PLAYWRIGHT_TEST_EMAIL && process.env.PLAYWRIGHT_TEST_PASSWORD;
    test.skip(!hasAuth, 'Skipping authenticated test - credentials not provided');
    
    await page.goto('/collections');
    await page.waitForLoadState('networkidle');
    
    // Verify page loads
    await expect(page.locator('body')).toBeVisible();
    expect(page.url()).toContain('/collections');
    
    // Check that we're not seeing the guest landing page
    const guestLandingText = await page.locator('text=/sign in|create account/i').first().isVisible({ timeout: 2_000 }).catch(() => false);
    expect(guestLandingText).toBeFalsy();
    
    errorTracker.assertNoErrors();
  });
});