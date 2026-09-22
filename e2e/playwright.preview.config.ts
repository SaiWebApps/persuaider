import { defineConfig } from '@playwright/test';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local', override: true, quiet: true });
const baseURL = process.env.PERSUAIDER_PREVIEW_URL;
if (!baseURL || !baseURL.startsWith('https://')) {
  throw new Error('Set PERSUAIDER_PREVIEW_URL to the authorized HTTPS preview.');
}

export default defineConfig({
  testDir: './playwright/acceptance',
  testMatch: 'slice-13*.spec.ts',
  globalSetup: './playwright/preview-setup.ts',
  retries: 0,
  workers: 1,
  reporter: [['list'], ['json', { outputFile: '../.peeraxis/outcomes/slice-13-editor/browser-proof.json' }]],
  use: {
    baseURL,
    viewport: { width: 1440, height: 1000 },
    headless: true,
    screenshot: 'on',
    trace: 'retain-on-failure',
  },
});
