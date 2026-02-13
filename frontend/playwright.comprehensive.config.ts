/**
 * Playwright config for comprehensive site tests.
 * Generates: HTML report, JUnit XML, JSON, list output.
 *
 * Run: npm run test:comprehensive
 * View report: npm run test:comprehensive:report
 */

import { defineConfig, devices } from '@playwright/test';
import * as path from 'path';

export default defineConfig({
  testDir: 'tests',
  testMatch: /comprehensive-site\.spec\.ts/,
  testIgnore: ['tests/unit/**'],
  timeout: 120_000,
  expect: { timeout: 10_000 },
  workers: process.env.CI ? 2 : 3,
  retries: process.env.CI ? 2 : 1,
  reporter: [
    ['list', { printSteps: true }],
    ['html', { outputFolder: 'test-results/comprehensive-html-report', open: 'never' }],
    ['junit', { outputFile: 'test-results/comprehensive-results.xml' }],
    ['json', { outputFile: 'test-results/comprehensive-results.json' }],
  ],
  outputDir: 'test-results/comprehensive-artifacts',
  use: {
    headless: true,
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000',
    navigationTimeout: 60_000,
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 15_000,
  },
  webServer: process.env.PLAYWRIGHT_BASE_URL ? undefined : {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: true,
    timeout: 120_000,
  },
  projects: [
    { name: 'setup', testMatch: /.*\.setup\.ts/ },
    { name: 'smoke', testMatch: /comprehensive-site\.spec\.ts/, dependencies: ['setup'], use: { storageState: path.join(__dirname, 'tests/.auth/user.json') } },
    { name: 'smoke-iphone', testMatch: /comprehensive-site\.spec\.ts/, dependencies: ['setup'], use: { ...devices['iPhone 14 Pro'], storageState: path.join(__dirname, 'tests/.auth/user.json') } },
    { name: 'smoke-android', testMatch: /comprehensive-site\.spec\.ts/, dependencies: ['setup'], use: { ...devices['Pixel 5'], storageState: path.join(__dirname, 'tests/.auth/user.json') } },
    { name: 'smoke-ipad', testMatch: /comprehensive-site\.spec\.ts/, dependencies: ['setup'], use: { ...devices['iPad Pro'], storageState: path.join(__dirname, 'tests/.auth/user.json') } },
  ],
});
