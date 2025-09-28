import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'tests',           // our tests folder
  timeout: 30_000,
  use: {
    headless: true,
    baseURL: 'http://localhost:3000',
  },
});
