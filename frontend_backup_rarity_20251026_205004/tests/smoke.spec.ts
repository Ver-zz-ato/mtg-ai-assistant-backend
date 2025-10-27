
import { test, expect } from '@playwright/test';

test('home renders chat textarea', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByPlaceholder('Ask anything or paste a decklist…')).toBeVisible();
});

test('health endpoint responds with supabase check payload', async ({ request }) => {
  const res = await request.get('/api/health');
  expect(res.status()).toBeGreaterThanOrEqual(200);
  expect(res.status()).toBeLessThan(600);
  const json = await res.json();
  expect(json).toHaveProperty('supabase');
});

test('cost-to-finish page loads controls', async ({ page }) => {
  await page.goto('/collections/cost-to-finish');
  await expect(page.getByText(/Currency/i)).toBeVisible();
});
