import { test as setup, expect } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';

// Load environment variables from .env.local if available
// Playwright tests run in Node.js, so we need to manually load .env.local
try {
  const envPath = path.join(__dirname, '..', '.env.local');
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    envContent.split('\n').forEach((line: string) => {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        const [key, ...valueParts] = trimmed.split('=');
        if (key && valueParts.length > 0) {
          const value = valueParts.join('=').replace(/^["']|["']$/g, '');
          process.env[key.trim()] = value.trim();
        }
      }
    });
  }
} catch {
  // Ignore if fs is not available or .env.local doesn't exist
}

const authFile = path.join(__dirname, '.auth/user.json');

setup('authenticate', async ({ page }) => {
  const email = process.env.PLAYWRIGHT_TEST_EMAIL;
  const password = process.env.PLAYWRIGHT_TEST_PASSWORD;

  if (!email || !password) {
    console.log('âš ï¸  PLAYWRIGHT_TEST_EMAIL and PLAYWRIGHT_TEST_PASSWORD not set. Skipping authentication setup.');
    console.log('   Authenticated tests will be skipped.');
    await page.context().storageState({ path: authFile });
    return;
  }

  await page.goto('/my-decks', { waitUntil: 'domcontentloaded', timeout: 30_000 });

  await page.evaluate(() => {
    localStorage.setItem('manatap_cookie_consent', 'accepted');
    localStorage.setItem('analytics:consent', 'granted');
    window.dispatchEvent(new Event('analytics:consent-granted'));
  });

  try {
    const acceptButton = page.getByRole('button', { name: /accept.*all|accept/i }).or(
      page.locator('button:has-text("Accept"), button:has-text("Accept all")')
    ).first();
    if (await acceptButton.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await acceptButton.click();
      await page.waitForTimeout(500);
    }
  } catch {
    // Keep going; localStorage consent should be enough on most runs.
  }

  const authLauncher = page.locator('header').getByRole('button', { name: /sign in\s*\/\s*sign up/i }).first();
  if (await authLauncher.isVisible({ timeout: 5_000 }).catch(() => false)) {
    await authLauncher.click();
  } else {
    await page.evaluate(() => {
      window.dispatchEvent(new CustomEvent('open-auth-modal', { detail: { mode: 'signin' } }));
    });
    await page.waitForTimeout(500);
  }

  const modalTitle = page.getByText('Sign in or Create account', { exact: true });
  if (!(await modalTitle.isVisible({ timeout: 3_000 }).catch(() => false))) {
    if (await authLauncher.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await authLauncher.click();
    }
  }
  await expect(modalTitle).toBeVisible({ timeout: 10_000 });

  const switchToSignIn = page.getByRole('button', { name: /already have an account.*sign in/i });
  if (await switchToSignIn.isVisible({ timeout: 2_000 }).catch(() => false)) {
    await switchToSignIn.click();
    await page.waitForTimeout(500);
  }

  const modal = modalTitle.locator('xpath=ancestor::div[contains(@class, "max-w-md")][1]');
  const emailInput = modal.locator('input[type="email"]').first();
  const passwordInput = modal.locator('input[type="password"]').first();
  await expect(emailInput).toBeVisible({ timeout: 10_000 });
  await expect(passwordInput).toBeVisible({ timeout: 10_000 });
  await emailInput.fill(email);
  await passwordInput.fill(password);

  const signInButton = modal.getByRole('button', { name: /^sign in$/i });
  await expect(signInButton).toBeVisible({ timeout: 5_000 });
  await signInButton.click();

  await expect(page.getByRole('button', { name: /sign out/i })).toBeVisible({ timeout: 20_000 });
  await page.waitForTimeout(1_000);

  await page.context().storageState({ path: authFile });
  console.log('âœ… Authentication setup complete. Session saved to', authFile);
});
