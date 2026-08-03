/**
 * DIAGNOSTIC (not committed output): captures 390px (and 768px for a couple)
 * screenshots of every key screen for the mobile/a11y sweep, then deletes the
 * throwaway account. A programmatic RPC safety-net removes the account even if
 * the run fails mid-way (never pollute the DB). Output -> .mobile-audit/ (gitignored).
 *
 * IT SIGNS A REAL ACCOUNT UP, so it now resolves its Supabase the same way the
 * test suites do and REFUSES a hosted project. It used to hold the production
 * URL and anon key as literals and create throwaway users on the live auth
 * server — the same thing the E2E suite was doing until 20260801170000's
 * iteration, and the reason a manual diagnostic is not an exception to the rule.
 *
 * Prereq: a local Supabase stack and a dev server on http://localhost:5173:
 *   supabase start
 *   eval "$(supabase status -o env | sed 's/^/export /')"
 *   export VITE_SUPABASE_URL="$API_URL" VITE_SUPABASE_ANON_KEY="$ANON_KEY"
 *   npm run dev
 *   node scripts/audit-mobile.mjs
 */
import { chromium } from '@playwright/test'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { mkdirSync } from 'node:fs'
import { resolveSupabaseTarget } from './supabaseTarget.js'

const BASE = 'http://localhost:5173'
const { url: SUPABASE_URL, anonKey: ANON } = resolveSupabaseTarget()

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const out = join(root, '.mobile-audit')
mkdirSync(out, { recursive: true })

const stamp = Date.now()
const cred = { email: `m8+${stamp}@example.com`, password: `M8!${stamp}` }
let deleted = false

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })
const page = await ctx.newPage()
// Force the dev-only Pro preview so Insights (with the weekly review) renders.
await page.addInitScript(() => localStorage.setItem('todonado.plan', 'pro'))

const shot = (name) => page.screenshot({ path: join(out, name), fullPage: true }).then(() => console.log('  ', name))

try {
  // Logged out
  await page.goto(`${BASE}/welcome`)
  await page.getByRole('heading', { name: /Plan a realistic day/i }).first().waitFor()
  await shot('01-landing.png')
  await page.goto(`${BASE}/login`)
  await page.getByRole('button', { name: 'Create account' }).waitFor().catch(() => {})
  await shot('02-login.png')

  // Sign up
  await page.goto(`${BASE}/welcome`)
  await page.getByRole('button', { name: 'Start free' }).first().click()
  await page.getByRole('button', { name: 'Create account' }).waitFor()
  await page.getByLabel('Name', { exact: true }).fill('Mobile Audit')
  await page.getByLabel('Username', { exact: true }).fill(`m8${stamp}`.slice(0, 24))
  await page.getByLabel('Email', { exact: true }).fill(cred.email)
  await page.getByLabel('Password', { exact: true }).fill(cred.password)
  await page.getByRole('button', { name: 'Create account' }).click()

  const ob = page.getByRole('dialog', { name: /Get started with Todonado/i })
  await ob.waitFor({ state: 'visible', timeout: 30_000 })
  await shot('03-onboarding.png')
  await ob.getByRole('button', { name: /Start planning today/i }).click()
  await ob.getByLabel('Custom daily hours').fill('2.5')
  await ob.getByRole('button', { name: 'Continue' }).click()
  await ob.getByRole('button', { name: /start from a template/i }).click()

  // Templates browse + detail
  await page.getByRole('heading', { name: 'Templates', level: 2 }).waitFor()
  await shot('08-templates.png')
  await page.getByRole('link', { name: /^Preview / }).first().click()
  await page.getByRole('button', { name: 'Use this list' }).waitFor()
  await shot('09-template-detail.png')
  await page.getByRole('button', { name: 'Use this list' }).click()

  // Today
  await page.getByRole('heading', { name: 'Your Command Center', level: 2 }).waitFor()
  await page.getByText(/Added \d+ tasks/i).waitFor({ state: 'hidden', timeout: 8000 }).catch(() => {})
  await shot('04-today.png')

  // Inbox
  await page.goto(`${BASE}/inbox`)
  await page.getByRole('heading', { name: 'Inbox', level: 2 }).waitFor()
  await shot('05-inbox.png')

  // Projects (create one via template? just show empty projects page)
  await page.goto(`${BASE}/projects`)
  await page.waitForTimeout(500)
  await shot('06-projects.png')

  // Wellness hub + breathwork
  await page.goto(`${BASE}/wellness`)
  await page.getByRole('heading', { name: /Focus & Calm/i, level: 2 }).waitFor()
  await shot('10-wellness.png')
  await page.goto(`${BASE}/wellness/breathe`)
  await page.waitForTimeout(700)
  await shot('11-breathe.png')

  // Insights (with the new weekly review — Pro preview is on)
  await page.goto(`${BASE}/insights`)
  await page.waitForTimeout(900)
  await shot('12-insights.png')

  // Settings + My Plan
  await page.goto(`${BASE}/settings`)
  await page.getByRole('heading', { name: 'Settings', level: 2 }).waitFor()
  await shot('13-settings.png')
  await page.goto(`${BASE}/settings/plan`)
  await page.waitForTimeout(500)
  await shot('14-plan.png')

  // 768px tablet spot-checks
  await page.setViewportSize({ width: 768, height: 1024 })
  await page.goto(`${BASE}/`)
  await page.getByRole('heading', { name: 'Your Command Center', level: 2 }).waitFor()
  await shot('20-today-768.png')

  // CLEANUP via the real delete flow
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto(`${BASE}/settings`)
  await page.getByRole('button', { name: 'Delete account' }).click()
  const del = page.getByRole('dialog', { name: 'Delete account' })
  await del.getByPlaceholder('DELETE').fill('DELETE')
  await del.getByRole('button', { name: 'Delete my account' }).click()
  await page.waitForURL(/\/welcome/, { timeout: 15_000 })
  deleted = true
  console.log('  account deleted via UI')
} finally {
  await ctx.close()
  await browser.close()
  if (!deleted) {
    // Safety net: remove the throwaway account programmatically (public anon key only).
    try {
      const si = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
        method: 'POST',
        headers: { apikey: ANON, 'Content-Type': 'application/json' },
        body: JSON.stringify(cred),
      })
      if (si.ok) {
        const { access_token } = await si.json()
        const d = await fetch(`${SUPABASE_URL}/rest/v1/rpc/delete_own_account`, {
          method: 'POST',
          headers: { apikey: ANON, Authorization: `Bearer ${access_token}`, 'Content-Type': 'application/json' },
          body: '{}',
        })
        console.log(d.ok ? '  account deleted via safety-net RPC' : `  SAFETY-NET DELETE FAILED: ${d.status}`)
      }
    } catch (e) {
      console.log('  safety-net error:', e.message)
    }
  }
}
