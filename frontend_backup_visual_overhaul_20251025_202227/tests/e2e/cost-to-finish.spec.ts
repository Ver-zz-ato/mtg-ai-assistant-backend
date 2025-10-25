import { test, expect } from '@playwright/test';

const smallDeck = `1 Sol Ring
1 Lightning Bolt
1 Thought Vessel
1 Brainstorm
1 Izzet Signet`;

test('Cost-to-Finish shows Source column and exports CSV with Source', async ({ page }) => {
  await page.goto('/collections/cost-to-finish');

  // Paste deck
  const ta = page.getByPlaceholder('Paste a deck list here...');
  await ta.fill(smallDeck);

  // Compute
  await page.getByRole('button', { name: 'Compute cost' }).click();

  // Wait for the API response to finish (proxy endpoint)
  await page.waitForResponse(r => r.url().includes('/api/collections/cost-to-finish') && r.request().method() === 'POST', { timeout: 30000 });

  // Wait for table headers including Source
  await expect(page.getByRole('columnheader', { name: 'Source' })).toBeVisible({ timeout: 30000 });
  await expect(page.getByRole('columnheader', { name: 'Unit' })).toBeVisible({ timeout: 30000 });

  // There should be at least one row with Need > 0
  const needCells = page.locator('tbody tr td:nth-child(2)');
  await expect(needCells.first()).toBeVisible();

  // Export CSV and assert header line contains Source
  const [ download ] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Export CSV' }).click(),
  ]);
  const stream = await download.createReadStream();
  let buf = '';
  for await (const chunk of stream as any) buf += chunk.toString('utf8');
  const header = buf.split(/\r?\n/)[0] || '';
  expect(header.toLowerCase()).toContain('source');
});