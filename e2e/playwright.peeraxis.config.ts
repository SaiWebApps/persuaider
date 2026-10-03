import path from 'path';
import { defineConfig } from '@playwright/test';

// Peeraxis Demonstration: one spec, one worker, no retries, everything recorded.
// Run only through scripts/peeraxis/demo.sh, which provides the local server, the
// throwaway database and the Clerk development keys. No dotenv here on purpose.
const output = process.env.PEERAXIS_DEMO_OUTPUT;
const spec = process.env.PEERAXIS_DEMO_SPEC;
const port = process.env.PEERAXIS_DEMO_PORT;
if (!output || !spec || !port) {
  throw new Error('Run through scripts/peeraxis/demo.sh (PEERAXIS_DEMO_OUTPUT, PEERAXIS_DEMO_SPEC, PEERAXIS_DEMO_PORT).');
}
const specPath = path.resolve(__dirname, '..', spec);

export default defineConfig({
  testDir: path.dirname(specPath),
  testMatch: path.basename(specPath),
  globalSetup: './playwright/peeraxis-setup.ts',
  outputDir: path.join(output, 'test-results'),
  retries: 0,
  workers: 1,
  timeout: Number(process.env.PEERAXIS_DEMO_TIMEOUT ?? 120000), // live negotiations run longer
  reporter: [['list'], ['json', { outputFile: path.join(output, 'report.json') }]],
  use: {
    baseURL: `http://localhost:${port}`, // must match the Host Clerk middleware rewrites to
    viewport: { width: 1440, height: 1000 },
    headless: true,
    video: 'on',
    trace: 'off',
    screenshot: 'on',
  },
});
