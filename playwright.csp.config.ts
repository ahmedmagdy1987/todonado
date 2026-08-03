import { defineConfig, devices } from '@playwright/test'
import { resolveSupabaseTarget } from './scripts/supabaseTarget.js'

/**
 * ENFORCING-CSP smoke against the PRODUCTION BUILD.
 *
 * Separate from playwright.config.ts because it tests a different artefact: the
 * built bundle behind scripts/serve-production-like.mjs, which applies
 * vercel.json's headers verbatim and ENFORCING. The main E2E suite drives the
 * Vite dev server, where the same policy is deliberately served Report-Only
 * (Vite injects an inline HMR preamble and a ws://localhost connection, both of
 * which the production policy forbids), so it can never answer "does the real
 * policy break the real app".
 */
const { url: SUPABASE_URL, anonKey: SUPABASE_ANON_KEY } = resolveSupabaseTarget() as {
  url: string
  anonKey: string
}

const PORT = Number(process.env.CSP_PORT ?? 4178)
const BASE_URL = `http://127.0.0.1:${PORT}`

export default defineConfig({
  testDir: './e2e-csp',
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: process.env.CI ? [['list']] : 'list',
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    locale: 'en-US',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm run csp:serve',
    url: BASE_URL,
    reuseExistingServer: false,
    timeout: 60_000,
    env: {
      VITE_SUPABASE_URL: SUPABASE_URL,
      VITE_SUPABASE_ANON_KEY: SUPABASE_ANON_KEY,
      CSP_PORT: String(PORT),
    },
  },
})
