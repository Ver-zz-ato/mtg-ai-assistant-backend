import { defineConfig } from '@playwright/test';
import * as path from 'path';

export default defineConfig({
  testDir: 'tests',           // our tests folder
  testIgnore: ['tests/unit/**'],
  timeout: 30_000,
  expect: {
    timeout: 5_000,
  },
  // Run auth setup before all tests
  globalSetup: undefined, // We'll use a setup project instead
  use: {
    headless: true,
    baseURL: 'http://localhost:3000',
    // Capture screenshots on failure
    screenshot: 'only-on-failure',
    // Capture video on failure
    video: 'retain-on-failure',
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
    // All other tests use the saved storageState for authenticated tests
    {
      name: 'smoke',
      testMatch: /.*\.spec\.ts/,
      dependencies: ['setup'],
      use: {
        // Try to use authenticated state if available
        storageState: path.join(__dirname, 'tests/.auth/user.json'),
      },
    },
  ],
});
