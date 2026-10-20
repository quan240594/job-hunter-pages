import { defineConfig, devices } from '@playwright/test';

// E2E against the mock build (`npm run build:mock`), served by `vite preview` under /job-hunter-pages/ exactly like
// GitHub Pages serves it. Run via `npm run test:e2e` (builds first). Uses the system Google Chrome (channel 'chrome'):
// Playwright's own browser downloads are not needed, and the GitHub runner image ships Chrome.
const PORT = Number(process.env.E2E_PORT ?? 4180);
const BASE_URL = `http://127.0.0.1:${PORT}/job-hunter-pages/`;

export default defineConfig({
  testDir: './e2e',
  outputDir: 'test-results',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chrome', use: { ...devices['Desktop Chrome'], channel: 'chrome' } }],
  webServer: {
    command: `npx vite preview --host 127.0.0.1 --port ${PORT} --strictPort`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});
