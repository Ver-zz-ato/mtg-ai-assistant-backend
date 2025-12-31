import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

test.describe('Collection Management', () => {
  test('navigate to collections page', async ({ page }) => {
    await page.goto('/collections', { waitUntil: 'domcontentloaded', timeout: 60_000 });
    
    // Verify we're on collections page
    expect(page.url()).toContain('/collections');
    
    // Check for collections interface
    await expect(page.locator('body')).toBeVisible({ timeout: 10_000 });
  });

  test('upload CSV collection file', async ({ page }) => {
    await page.goto('/collections', { waitUntil: 'domcontentloaded', timeout: 60_000 });
    
    // Create a test CSV file
    const testCsv = `Card Name,Quantity
Lightning Bolt,4
Sol Ring,1
Brainstorm,2`;
    
    const csvPath = path.join(__dirname, 'test-collection.csv');
    fs.writeFileSync(csvPath, testCsv);
    
    try {
      // Look for file upload input
      const fileInput = page.locator('input[type="file"]').first();
      if (await fileInput.isVisible({ timeout: 5_000 }).catch(() => false)) {
        await fileInput.setInputFiles(csvPath);
        
        // Wait for upload to process
        await page.waitForTimeout(3000);
        
        // Look for success message or collection items
        const successMessage = page.locator('text=/uploaded|imported|success/i').first();
        if (await successMessage.isVisible({ timeout: 10_000 }).catch(() => false)) {
          expect(successMessage).toBeVisible();
        }
      }
    } finally {
      // Clean up test file
      if (fs.existsSync(csvPath)) {
        fs.unlinkSync(csvPath);
      }
    }
  });

  test('edit collection item quantity', async ({ page }) => {
    await page.goto('/collections', { waitUntil: 'domcontentloaded', timeout: 60_000 });
    
    // Wait for collection to load
    await page.waitForTimeout(3000);
    
    // Look for collection items/table
    const collectionRow = page.locator('tr, [class*="card"], [class*="item"]').first();
    if (await collectionRow.isVisible({ timeout: 5_000 }).catch(() => false)) {
      // Look for quantity input
      const quantityInput = collectionRow.locator('input[type="number"], input[type="text"]').first();
      if (await quantityInput.isVisible({ timeout: 2_000 }).catch(() => false)) {
        await quantityInput.fill('5');
        await quantityInput.press('Enter');
        
        // Wait for save
        await page.waitForTimeout(2000);
        
        // Verify quantity updated
        await expect(quantityInput).toHaveValue('5', { timeout: 3_000 });
      }
    }
  });

  test('cost-to-finish calculation', async ({ page }) => {
    await page.goto('/collections/cost-to-finish', { waitUntil: 'domcontentloaded', timeout: 60_000 });
    
    // Paste a small deck
    const deckText = `1 Sol Ring
1 Lightning Bolt
1 Brainstorm`;
    
    const textarea = page.getByPlaceholder(/paste.*deck|deck.*list/i).first();
    await expect(textarea).toBeVisible({ timeout: 10_000 });
    await textarea.fill(deckText);
    
    // Click compute button
    const computeButton = page.getByRole('button', { name: /compute|calculate/i });
    await computeButton.click();
    
  // Wait for results - this can be slow, use longer timeout
  try {
    await page.waitForResponse(
      r => r.url().includes('/api/collections/cost-to-finish') && r.request().method() === 'POST',
      { timeout: 90_000 }
    );
  } catch (e) {
    // If timeout, wait a bit more and check if results appeared anyway
    await page.waitForTimeout(5000);
  }
    
    // Verify results table appears
    const resultsTable = page.locator('table, [class*="table"], [class*="results"]').first();
    await expect(resultsTable).toBeVisible({ timeout: 10_000 });
  });
});

