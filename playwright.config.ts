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
    /*
     * PIN THE LOCALE so a local run and CI render the same page.
     *
     * Without it the browser inherits the machine's locale, and the two do not
     * agree: on an Arabic-locale Windows box Chrome renders `input[type=number]`
     * values in Arabic-Indic digits (the duration field on /focus showed "٥٠"
     * beside a "50 min" chip), and every `toLocaleDateString` in the app
     * formats differently. Neither is an app bug — both are correct behaviour
     * for that locale — but they make "it passes locally" and "it passes in CI"
     * two different claims. This is a test-harness decision only; the app still
     * follows the real user's locale in the browser.
     *
     * The TIMEZONE is deliberately left alone. The seeds compute "today" from
     * `toISOString()` (UTC) while the browser uses the machine's zone, so the
     * two can disagree for a few hours around midnight — worth fixing, but not
     * in the same change as a layout sweep.
     */
    locale: 'en-US',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm run dev',
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
