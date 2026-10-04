import { defineConfig, devices } from '@playwright/test';

const PORT = 4173;
// Server saves (M12.5) go to a fresh folder per run (workers inherit the id, so they agree with the server).
process.env.E2E_RUN ??= String(Date.now());
const DATA_DIR = `artifacts/e2e-data/run-${process.env.E2E_RUN}`;

export default defineConfig({
  testDir: 'tests/e2e',
  outputDir: 'artifacts/playwright',
  fullyParallel: true,
  // Four browsers on the GitHub runner left the simulation at a fraction of speed and 45 tests
  // hit their time limit (M16.24). One browser there. This Mac still runs four.
  workers: process.platform === 'linux' ? 1 : 4,
  reporter: [['list'], ['json', { outputFile: 'artifacts/playwright/results.json' }]],
  timeout: 60_000,
  use: {
    baseURL: `http://127.0.0.1:${PORT}/`,
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 2,
    headless: true,
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1280, height: 800 },
        deviceScaleFactor: 2,
        // Metal on a Mac. SwiftShader on Linux, which is where the GitHub test runner draws.
        launchOptions: {
          args: [
            '--enable-unsafe-swiftshader',
            '--ignore-gpu-blocklist',
            ...(process.platform === 'darwin' ? ['--use-angle=metal'] : ['--use-angle=swiftshader']),
          ],
        },
      },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'], viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2 },
    },
  ],
  webServer: {
    command: `node server/serve.mjs --dir dist --port ${PORT} --host 127.0.0.1 --data ${DATA_DIR} --away-ms 3000`,
    url: `http://127.0.0.1:${PORT}/healthz`,
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
