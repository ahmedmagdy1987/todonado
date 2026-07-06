import { defineConfig, devices } from '@playwright/test'

/**
 * Playwright E2E smoke config. Chromium-only, serial, lean (< ~2 min).
 *
 * The suite drives the local Vite dev server against the REAL cloud Supabase
 * (the public anon key is baked into the app, mailer autoconfirm is ON), so no
 * secrets are required — locally or in CI. See e2e/smoke.spec.ts for the
 * covered / out-of-scope boundaries.
 */
const PORT = 5173
const BASE_URL = `http://localhost:${PORT}`

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1, // serial: the tests share one real cloud DB — keep them deterministic
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm run dev',
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
