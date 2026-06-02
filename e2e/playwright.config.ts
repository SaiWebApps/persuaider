import { defineConfig } from '@playwright/test';
import * as dotenv from 'dotenv';

// .env.local is the source of truth — override any stale shell env vars
dotenv.config({ path: '.env.local', override: true });

export default defineConfig({
  globalSetup: './playwright/global-setup.ts',
  testDir: './playwright',
  timeout: 60000,
  retries: 1,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:3000',
    headless: true,
    screenshot: 'only-on-failure',
    trace: 'on-first-retry',
  },
  webServer: {
    command: 'npm run dev',
    port: 3000,
    reuseExistingServer: true,
    timeout: 30000,
  },
});
