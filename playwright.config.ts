import { defineConfig } from '@playwright/test';

const BASE_URL = 'http://localhost:4321';

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
    command: 'npm run preview -- --ignore-lock --port 4321',
    url: BASE_URL,
    reuseExistingServer: false,
  },
});
