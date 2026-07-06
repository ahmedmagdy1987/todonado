/**
 * Generates REAL product screenshots for the landing "How it works" section.
 *
 * Drives a headless browser through a throwaway account (sign up -> set capacity
 * -> apply a template so Today shows effort-tagged tasks + a filled meter),
 * captures desktop + 390px mobile frames of Today, an Inbox "capture with
 * effort" shot, and a Focus shot, then DELETES the account via the real Settings
 * flow (same self-clean pattern as the E2E). No mockups — these are the real UI.
 *
 * Prereq: a dev server on http://localhost:5173 (npm run dev). Then:
 *   node scripts/generate-screenshots.mjs
 */
import { chromium } from '@playwright/test'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const BASE = 'http://localhost:5173'
const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const outDir = join(root, 'public/shots')

const stamp = Date.now()
const id = {
  name: 'Alex Morgan',
  username: `alex${stamp}`.slice(0, 24),
  email: `shots+${stamp}@example.com`,
  password: `Shots!${stamp}`,
}

const browser = await chromium.launch()
const context = await browser.newContext({ viewport: { width: 1280, height: 820 }, deviceScaleFactor: 2 })
const page = await context.newPage()

async function shot(name, opts = {}) {
  await page.screenshot({ path: join(outDir, name), ...opts })
  console.log('  captured', name)
}

try {
  // --- Sign up (throwaway) -> onboarding ---
  await page.goto(`${BASE}/welcome`)
  await page.getByRole('button', { name: 'Start free' }).first().click()
  await page.getByRole('button', { name: 'Create account' }).waitFor()
  await page.getByLabel('Name', { exact: true }).fill(id.name)
  await page.getByLabel('Username', { exact: true }).fill(id.username)
  await page.getByLabel('Email', { exact: true }).fill(id.email)
  await page.getByLabel('Password', { exact: true }).fill(id.password)
  await page.getByRole('button', { name: 'Create account' }).click()

  const onboarding = page.getByRole('dialog', { name: /Get started with Todonado/i })
  await onboarding.waitFor({ state: 'visible', timeout: 30_000 })
  await onboarding.getByRole('button', { name: /Start planning today/i }).click()
  // Capacity 2.5h — a template lands a meaningfully-filled (~60%, not overflowing) meter.
  await onboarding.getByLabel('Custom daily hours').fill('2.5')
  await onboarding.getByRole('button', { name: 'Continue' }).click()
  await onboarding.getByRole('button', { name: /start from a template/i }).click()

  // --- Apply a template to Today ---
  await page.getByRole('heading', { name: 'Templates', level: 2 }).waitFor()
  await page.getByRole('link', { name: /^Preview / }).first().click()
  await page.getByRole('button', { name: 'Use this list' }).click()

  // --- Today: meter + effort-tagged tasks + streak ---
  await page.getByRole('heading', { name: 'Your Command Center', level: 2 }).waitFor()
  await page.getByRole('heading', { name: 'Day Capacity' }).waitFor()
  // Let the "Added N tasks" toast auto-dismiss so the shot is clean.
  await page.getByText(/Added \d+ tasks/i).waitFor({ state: 'hidden', timeout: 8000 }).catch(() => {})
  await page.waitForTimeout(600) // let the meter bar animate to its width
  await shot('today-desktop.png', { clip: { x: 0, y: 0, width: 1280, height: 820 } })

  // Mobile frame (390px) of Today.
  await page.setViewportSize({ width: 390, height: 844 })
  await page.waitForTimeout(500)
  await shot('today-mobile.png', { clip: { x: 0, y: 0, width: 390, height: 844 } })
  await page.setViewportSize({ width: 1280, height: 820 })

  // --- Capture with effort: Inbox QuickAdd with the effort chips + suggestion ---
  await page.getByRole('complementary').getByRole('link', { name: 'Inbox', exact: true }).click()
  await page.getByRole('heading', { name: 'Inbox', level: 2 }).waitFor()
  const capture = page.getByRole('textbox', { name: 'Task title' })
  await capture.fill('Draft the launch announcement')
  await page.waitForTimeout(700) // let the "Suggest Xm" chip resolve
  await shot('capture-desktop.png', { clip: { x: 0, y: 0, width: 1280, height: 520 } })

  // --- Focus & finish: start a focus session on a task → running circular timer ---
  await page.getByRole('complementary').getByRole('link', { name: 'Today', exact: true }).click()
  await page.getByRole('heading', { name: 'Your Command Center', level: 2 }).waitFor()
  await page.getByRole('button', { name: 'Focus on this task' }).first().click()
  await page.getByRole('button', { name: /Start .*sprint/i }).click()
  await page.waitForTimeout(1400) // the running circular timer renders + ticks
  await shot('focus-desktop.png', { clip: { x: 0, y: 0, width: 1280, height: 820 } })

  // --- CLEANUP: delete the throwaway account via the real Settings flow ---
  await page.goto(`${BASE}/settings`)
  await page.getByRole('button', { name: 'Delete account' }).click()
  const del = page.getByRole('dialog', { name: 'Delete account' })
  await del.getByPlaceholder('DELETE').fill('DELETE')
  await del.getByRole('button', { name: 'Delete my account' }).click()
  await page.waitForURL(/\/welcome/, { timeout: 15_000 })
  console.log('  account deleted — done')
} finally {
  await context.close()
  await browser.close()
}
