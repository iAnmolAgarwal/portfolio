import { defineConfig } from '@playwright/test';

// Node's types are not installed, so say what little of `process` is used here.
declare const process: { env: Record<string, string | undefined> };

// E2E_PORT lets several worktrees run their browser tests at the same time.
const PORT = process.env.E2E_PORT || '4321';
const BASE_URL = `http://localhost:${PORT}`;

// Tests run against the built site, so run `npm run build` before `npm run e2e`.
export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  reporter: 'list',
  use: {
    baseURL: BASE_URL,
    browserName: 'chromium',
  },
  projects: [
    {
      name: 'desktop',
      use: { viewport: { width: 1440, height: 900 } },
    },
    {
      name: 'phone',
      use: { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true },
    },
  ],
  webServer: {
    // Astro puts the preview server in the background by itself when a coding agent
    // runs it, and Playwright then sees the command exit. `--ignore-lock` keeps it
    // in the foreground so Playwright starts and stops it.
    command: `npm run preview -- --ignore-lock --port ${PORT}`,
    url: BASE_URL,
    reuseExistingServer: false,
  },
});
