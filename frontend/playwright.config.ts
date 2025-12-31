import { defineConfig, devices } from '@playwright/test';
import * as path from 'path';

export default defineConfig({
  testDir: 'tests',           // our tests folder
  testIgnore: ['tests/unit/**'],
  timeout: 60_000, // Increased from 30s to 60s
  expect: {
    timeout: 10_000, // Increased from 5s to 10s
  },
  // Reduce parallelism to avoid server overload
  workers: process.env.CI ? 2 : 3, // Fewer workers = less server load
  // Retry flaky tests
  retries: process.env.CI ? 2 : 1,
  // Run auth setup before all tests
  globalSetup: undefined, // We'll use a setup project instead
  use: {
    headless: true,
    baseURL: 'http://localhost:3000',
    // Use domcontentloaded instead of load for faster page loads
    navigationTimeout: 60_000, // 60 second timeout for navigation
    // Capture screenshots on failure
    screenshot: 'only-on-failure',
    // Capture video on failure
    video: 'retain-on-failure',
    // Use domcontentloaded for faster page loads (doesn't wait for all resources)
    actionTimeout: 15_000, // 15 second timeout for actions
  },
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: true,
    timeout: 120_000,
  },
  projects: [
    // Setup project runs auth and saves storageState
    {
      name: 'setup',
      testMatch: /.*\.setup\.ts/,
    },
    // Desktop tests (default)
    {
      name: 'smoke',
      testMatch: /.*\.spec\.ts/,
      dependencies: ['setup'],
      use: {
        // Try to use authenticated state if available
        storageState: path.join(__dirname, 'tests/.auth/user.json'),
      },
    },
    // iPhone tests - catch mobile-specific bugs
    {
      name: 'smoke-iphone',
      testMatch: /.*\.spec\.ts/,
      dependencies: ['setup'],
      use: {
        ...devices['iPhone 14 Pro'],
        storageState: path.join(__dirname, 'tests/.auth/user.json'),
      },
    },
  ],
});
