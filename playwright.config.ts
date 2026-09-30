import { defineConfig, devices } from '@playwright/test';

const PORT = 4173;
// Server saves (M12.5) go to a fresh folder per run (workers inherit the id, so they agree with the server).
process.env.E2E_RUN ??= String(Date.now());
const DATA_DIR = `artifacts/e2e-data/run-${process.env.E2E_RUN}`;

export default defineConfig({
  testDir: 'tests/e2e',
  outputDir: 'artifacts/playwright',
  fullyParallel: true,
  workers: 4,
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
        launchOptions: { args: ['--use-angle=metal', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] },
      },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'], viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2 },
    },
  ],
  webServer: {
    command: `node server/serve.mjs --dir dist --port ${PORT} --host 127.0.0.1 --data ${DATA_DIR}`,
    url: `http://127.0.0.1:${PORT}/healthz`,
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
