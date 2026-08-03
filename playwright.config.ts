import { defineConfig, devices } from '@playwright/test'
import { resolveSupabaseTarget } from './scripts/supabaseTarget.js'

/**
 * Playwright E2E smoke config. Chromium-only, serial, lean.
 *
 * THE SUITE RUNS AGAINST A DISPOSABLE LOCAL SUPABASE STACK, NEVER PRODUCTION.
 *
 * It used to drive the Vite dev server against the REAL cloud project, on the
 * grounds that the anon key already ships in the bundle so no CI secret was
 * needed. That was true and it was not the problem: an automated job on every
 * push was signing throwaway users up on the production auth server, writing
 * rows into production tables and relying on a self-delete to tidy up.
 *
 * The target is resolved HERE, at config load, so an unset or hosted URL fails
 * before Playwright starts a browser or the dev server opens a socket. There is
 * no fallback — see scripts/supabaseTarget.js for why a default would silently
 * point the whole suite back at production.
 */
const { url: SUPABASE_URL, anonKey: SUPABASE_ANON_KEY } = resolveSupabaseTarget() as {
  url: string
  anonKey: string
}

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
    /*
     * NEVER reuse a server in CI, and never silently reuse one locally that was
     * started against a different Supabase. The env below is what points the
     * BUNDLE at the local stack (src/lib/env.ts prefers a non-empty VITE_ var
     * over its built-in production default), so a reused server from an earlier
     * shell would quietly be talking to something else.
     */
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      VITE_SUPABASE_URL: SUPABASE_URL,
      VITE_SUPABASE_ANON_KEY: SUPABASE_ANON_KEY,
    },
  },
})
