// Dev/CI-only Playwright config (not shipped in the offline bundle).
// See ./README.md for how to run. Kept dependency-light so it is inert unless
// @playwright/test is installed in a networked environment.
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: '.',
  timeout: 30_000,
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL: process.env.BASE_URL || 'http://localhost:5173',
    trace: 'on-first-retry',
    // On the managed box the browser lives under /opt/pw-browsers.
    launchOptions: process.env.PW_CHROMIUM_PATH
      ? { executablePath: process.env.PW_CHROMIUM_PATH }
      : {},
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
})
