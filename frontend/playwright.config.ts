import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'tests',           // our tests folder
  testIgnore: ['tests/unit/**'],
  timeout: 30_000,
  use: {
    headless: true,
    baseURL: 'http://localhost:3000',
  },
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
