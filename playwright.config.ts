import { defineConfig, devices } from '@playwright/test';

const PORT = 4173;
// Software drawing at double resolution left the simulation at a few ticks a second (M16.27).
// Linux shots are the normal size. This Mac stays sharp. A blank frame is still rejected.
const SCALE = process.platform === 'linux' ? 1 : 2;
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
  // One browser there still plays at about six ticks a second, and a test can spend a minute
  // before its last click (M16.26). Three minutes there. This Mac still allows one.
  timeout: process.platform === 'linux' ? 180_000 : 60_000,
  use: {
    baseURL: `http://127.0.0.1:${PORT}/`,
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: SCALE,
    headless: true,
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1280, height: 800 },
        deviceScaleFactor: SCALE,
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
      use: { ...devices['Desktop Safari'], viewport: { width: 1280, height: 800 }, deviceScaleFactor: SCALE },
    },
  ],
  webServer: {
    // A dropped seat is held 3 s here. Closing a page on the runner can take longer than that, so the
    // waiting line was already gone (M16.26). The runner holds it 30 s, as StartOS does.
    command: `node server/serve.mjs --dir dist --port ${PORT} --host 127.0.0.1 --data ${DATA_DIR} --away-ms ${process.platform === 'linux' ? 30_000 : 3_000}`,
    url: `http://127.0.0.1:${PORT}/healthz`,
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
