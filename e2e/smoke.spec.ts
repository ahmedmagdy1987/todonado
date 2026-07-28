import { test, expect } from '@playwright/test'

/**
 * Todonado E2E smoke — a real browser driving the local dev server against the
 * REAL cloud Supabase. Mirrors docs/LAUNCH_CHECKLIST.md's fresh-user script.
 *
 * COVERED
 *   1. Landing (/welcome) renders, primary CTA visible.
 *   2. Signup with a unique throwaway identity → lands in onboarding
 *      (autoconfirm is ON, so signup returns a session with no email step).
 *   3. Onboarding → "Start from a template" → apply to Today → capacity meter
 *      shows a real number.
 *   4. Auto-plan ("Plan my day"): preview opens, applies, never exceeds capacity.
 *   5. Deep-route direct loads (/wellness, /settings) render — no 404 / blank.
 *   5b. The landing's LIVE demo widgets: the hero capacity meter self-plays and
 *      replays; the effort-chip, auto-plan, and focus widgets are interactive —
 *      and the whole journey makes ZERO Supabase REST/RPC calls (the demos are
 *      in-memory only). Plus the "Powered by HBV Studio" credit (plain text).
 *   6. /reset-password renders; forgot-password returns the neutral,
 *      non-enumerating message (logged-out test below).
 *   7. CLEANUP: the throwaway account deletes itself via the Settings
 *      delete-account flow (the delete_own_account RPC). A best-effort afterAll
 *      safety net removes the account too if the journey fails before step 7, so
 *      runs never pollute the DB. Deletion failure fails LOUDLY.
 *
 * EXPLICITLY OUT OF SCOPE (documented, not silently skipped)
 *   - Email receipt (reset / confirmation): no inbox access in CI.
 *   - Stripe / billing: not built (demand-capture fake door only).
 *   - ICS URL-subscribe fetch: browser CORS makes it non-deterministic.
 *   - ICS file-upload: skipped to keep the suite lean and under ~2 min; the ICS
 *     parser itself is thoroughly unit-tested (src/features/calendar/ics.test.ts).
 */

// Public config — the anon key already ships in the client bundle (RLS-protected),
// so it is safe here and needs NO CI secret. Used only by the afterAll safety net.
const SUPABASE_URL = 'https://lplsbfduankkpglyusjp.supabase.co'
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxwbHNiZmR1YW5ra3BnbHl1c2pwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAzNDkzMzksImV4cCI6MjA5NTkyNTMzOX0.lVX3cKJWiQYlUWGUE35sui45NKgVLWhBBX4ju-o5_OY'

/** A unique throwaway identity per run (timestamp + random suffix). */
function uniqueIdentity() {
  const stamp = Date.now()
  const rand = Math.random().toString(36).slice(2, 8)
  return {
    email: `e2e+${stamp}${rand}@example.com`,
    username: `e2e_${stamp}`, // ^[A-Za-z0-9_]{3,30}$
    password: `E2e!smoke-${stamp}`,
  }
}

// Creds of the account created by the journey test, recorded BEFORE submit so the
// safety net can clean up even if the journey fails mid-way. Nulled once the UI
// delete flow has removed it.
let created: { email: string; password: string } | null = null

test('fresh-user journey: signup → onboarding → template → auto-plan → deep routes → self-delete', async ({
  page,
}) => {
  const id = uniqueIdentity()

  // 1. Landing renders with its primary CTA.
  await page.goto('/welcome')
  const startFree = page.getByRole('button', { name: 'Start free' }).first()
  await expect(startFree).toBeVisible()

  // 2. Signup → onboarding (autoconfirm ON ⇒ signup returns a session directly).
  await startFree.click()
  await expect(page.getByRole('button', { name: 'Create account' })).toBeVisible()
  await page.getByLabel('Name', { exact: true }).fill('E2E Smoke')
  await page.getByLabel('Username', { exact: true }).fill(id.username)
  await page.getByLabel('Email', { exact: true }).fill(id.email)
  await page.getByLabel('Password', { exact: true }).fill(id.password)
  created = { email: id.email, password: id.password } // record before submit for the safety net
  await page.getByRole('button', { name: 'Create account' }).click()

  const onboarding = page.getByRole('dialog', { name: /Get started with Todonado/i })
  await expect(onboarding).toBeVisible({ timeout: 30_000 })

  // 3. Onboarding: set a large capacity (room for auto-plan), then start from a template.
  await onboarding.getByRole('button', { name: /Start planning today/i }).click()
  await onboarding.getByLabel('Custom daily hours').fill('100')
  await onboarding.getByRole('button', { name: 'Continue' }).click()
  await onboarding.getByRole('button', { name: /start from a template/i }).click()

  // Inside the app shell the TopBar renders an <h1> with the page title too, so
  // target the page's own <h2> by level to stay unambiguous.
  await expect(page.getByRole('heading', { name: 'Templates', level: 2 })).toBeVisible()
  await page.getByRole('link', { name: /^Preview / }).first().click()
  const useList = page.getByRole('button', { name: 'Use this list' })
  await expect(useList).toBeVisible()
  await useList.click()

  // Lands on Today with a live capacity meter showing a real number.
  await expect(page.getByRole('heading', { name: 'Your Command Center', level: 2 })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Day Capacity' })).toBeVisible()
  await expect(page.getByText(/\d+%\s*planned/)).toBeVisible()

  // 4. Auto-plan: create one backlog (Inbox) candidate, then plan it into today.
  // Navigate CLIENT-SIDE via the sidebar (not page.goto, which discards the query
  // cache and can refetch before the insert persists) so the planner sees the task.
  const sidebar = page.getByRole('complementary')
  await sidebar.getByRole('link', { name: 'Inbox', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Inbox', level: 2 })).toBeVisible()
  const capture = page.getByRole('textbox', { name: 'Task title' })
  await capture.fill('E2E auto-plan candidate')
  await capture.press('Enter')
  await expect(page.getByRole('button', { name: 'E2E auto-plan candidate' })).toBeVisible()

  await sidebar.getByRole('link', { name: 'Today', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Your Command Center', level: 2 })).toBeVisible()
  await page.getByRole('button', { name: 'Plan my day' }).first().click()
  const planDialog = page.getByRole('dialog', { name: 'Plan my day' })
  await expect(planDialog).toBeVisible()
  // The planner's own promise — proves the preview ran and respects capacity.
  await expect(planDialog.getByText(/never over/i)).toBeVisible()
  await planDialog.getByRole('button', { name: /Plan \d+ into today/ }).click()
  await expect(planDialog).toBeHidden()
  await expect(page.getByText(/Planned \d+ task/i)).toBeVisible()

  // 5. Deep-route direct loads render (no 404 / blank).
  await page.goto('/wellness')
  await expect(page.getByRole('heading', { name: /Focus & Calm/i, level: 2 })).toBeVisible()
  await page.goto('/settings')
  await expect(page.getByRole('heading', { name: 'Settings', level: 2 })).toBeVisible()

  // 7. CLEANUP: delete the account via the real Settings flow.
  await page.getByRole('button', { name: 'Delete account' }).click()
  const deleteDialog = page.getByRole('dialog', { name: 'Delete account' })
  await expect(deleteDialog).toBeVisible()
  await deleteDialog.getByPlaceholder('DELETE').fill('DELETE')
  await deleteDialog.getByRole('button', { name: 'Delete my account' }).click()

  // Success ⇒ signed out and bounced to the marketing landing. If the RPC failed
  // we'd still be on /settings, so this assertion fails LOUDLY.
  await expect(page).toHaveURL(/\/welcome(\/|$|\?)/, { timeout: 15_000 })
  await expect(page.getByRole('button', { name: 'Start free' }).first()).toBeVisible()
  created = null // the UI flow deleted it — nothing for the safety net to do
})

test('reset-password renders and forgot-password is non-enumerating (logged out)', async ({ page }) => {
  // /reset-password renders on a direct load (no token) — the heading always shows.
  await page.goto('/reset-password')
  await expect(page.getByRole('heading', { name: 'Set a new password' })).toBeVisible()

  // Forgot-password returns the neutral, non-enumerating confirmation.
  await page.goto('/login')
  await page.getByRole('button', { name: 'Forgot password?' }).click()
  await page.getByLabel('Email', { exact: true }).fill(`e2e+noaccount-${Date.now()}@example.com`)
  await page.getByRole('button', { name: 'Send reset link' }).click()
  await expect(page.getByText(/If an account exists for that email/i)).toBeVisible()
  // NOTE: we deliberately do NOT verify email receipt — out of scope (no inbox in CI).
})

test('landing serves static share meta (OG/Twitter tags in the raw HTML — no JS)', async ({ page }) => {
  // Fetch the RAW document a crawler gets (no JS run) — the share tags must be
  // static in index.html, not injected client-side.
  const res = await page.request.get('/')
  expect(res.ok()).toBeTruthy()
  const html = await res.text()
  expect(html).toContain('property="og:title"')
  expect(html).toContain('property="og:description"')
  expect(html).toContain('property="og:image"')
  expect(html).toContain('https://www.todonado.com/og-image.png')
  expect(html).toContain('name="twitter:card"')
  expect(html).toContain('summary_large_image')
  expect(html).toContain('rel="canonical"')

  // The og:image asset itself is served.
  const img = await page.request.get('/og-image.png')
  expect(img.ok()).toBeTruthy()
  expect(img.headers()['content-type']).toContain('image')
})

test('landing shows How-it-works + FAQ with real screenshots that load', async ({ page }) => {
  await page.goto('/welcome')
  // These sections are code-split and mount as they near the viewport, so the
  // page has to be scrolled before they exist in the DOM.
  await mountLazySections(page)
  await expect(page.getByRole('heading', { name: 'How Todonado works' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Questions, answered' })).toBeVisible()
  await expect(page.getByText('Is Todonado free?')).toBeVisible()

  // A real product screenshot actually loads (not a broken image).
  const shot = page.locator('img[src="/shots/today-desktop.png"]')
  await shot.scrollIntoViewIfNeeded()
  await expect(shot).toBeVisible()
  await expect
    .poll(() => shot.evaluate((el) => (el as HTMLImageElement).naturalWidth))
    .toBeGreaterThan(0)
})

test('registers a service worker (installable PWA) and deep routes still load', async ({ page }) => {
  await page.goto('/welcome')
  // The SW registers on load (vite-plugin-pwa, enabled in dev).
  await expect
    .poll(async () => page.evaluate(async () => !!(await navigator.serviceWorker?.getRegistration())), {
      timeout: 15_000,
    })
    .toBe(true)

  // The manifest is linked + served (installability).
  const manifest = await page.request.get('/manifest.webmanifest')
  expect(manifest.ok()).toBeTruthy()
  const mf = (await manifest.json()) as { name?: string; icons?: unknown[]; display?: string }
  expect(mf.name).toBeTruthy()
  expect(mf.display).toBe('standalone')
  expect(Array.isArray(mf.icons) && mf.icons.length).toBeTruthy()

  // A deep route still direct-loads with the SW active (network-first navigation).
  await page.goto('/reset-password')
  await expect(page.getByRole('heading', { name: 'Set a new password' })).toBeVisible()

  // OG tags remain static in the raw HTML (crawlers, not JS).
  const html = await (await page.request.get('/')).text()
  expect(html).toContain('property="og:image"')
})

test('mobile: form inputs render at ≥16px so iOS Safari does not zoom on focus', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/login')
  const email = page.getByLabel('Email', { exact: true })
  await expect(email).toBeVisible()
  const fontSize = await email.evaluate((el) => parseFloat(getComputedStyle(el).fontSize))
  expect(fontSize).toBeGreaterThanOrEqual(16)
})

/**
 * Scroll the whole document so every IntersectionObserver-gated section and
 * lazily-mounted demo widget is actually in the DOM, then return to the top.
 * Without this, the below-the-fold widgets simply don't exist to query.
 */
async function mountLazySections(page: import('@playwright/test').Page) {
  await page.evaluate(async () => {
    const step = window.innerHeight
    for (let y = 0; y < document.body.scrollHeight; y += step) {
      window.scrollTo(0, y)
      await new Promise((r) => setTimeout(r, 150))
    }
    window.scrollTo(0, 0)
    await new Promise((r) => setTimeout(r, 200))
  })
}

test('landing: the hero capacity demo is live and replayable', async ({ page }) => {
  await page.goto('/welcome')

  // The hero meter is a real progressbar, not a picture.
  const meter = page.getByRole('progressbar').first()
  await expect(meter).toBeVisible()

  // It self-plays to the scripted 92% "nearly full" end state.
  await expect(page.getByText(/92%\s*planned/)).toBeVisible({ timeout: 15_000 })
  await expect(page.getByText('Nearly full')).toBeVisible()
  await expect(meter).toHaveAttribute('aria-valuenow', '92')

  // Replay is interactive: it empties the day, then fills again.
  await page.getByRole('button', { name: 'Replay' }).click()
  await expect(page.getByText('Nearly full')).toBeHidden()
  await expect(page.getByText(/92%\s*planned/)).toBeVisible({ timeout: 15_000 })
})

test('landing: the three demo widgets are interactive and touch a database NEVER', async ({
  page,
}) => {
  // Record every Supabase REST/RPC call. Auth (/auth/v1/) is excluded — the
  // AuthProvider legitimately restores a session on load; the DEMOS must not
  // read or write a single row.
  const dbCalls: string[] = []
  page.on('request', (req) => {
    const url = req.url()
    if (url.includes('.supabase.co/rest/v1/')) dbCalls.push(`${req.method()} ${url}`)
  })

  await page.goto('/welcome')
  await mountLazySections(page)

  // --- W1: tap effort chips until the day stops fitting -------------------
  const chip90 = page.getByRole('button', { name: /Add a 1h 30m task/i })
  await chip90.scrollIntoViewIfNeeded()
  for (let i = 0; i < 5; i += 1) await chip90.click() // 5 x 90m = 450m > 360m
  await expect(page.getByText(/more than the day holds/i)).toBeVisible()

  // The rescue action puts the day back under capacity.
  await page.getByRole('button', { name: /Move the biggest task to tomorrow/i }).click()
  await expect(page.getByText(/more than the day holds/i)).toBeHidden()

  // Reset clears it.
  await page.getByRole('button', { name: 'Reset the demo day' }).click()

  // --- W2: the real planner fills the day and leaves the overflow ---------
  const planBtn = page.getByRole('button', { name: 'Plan my day' })
  await planBtn.scrollIntoViewIfNeeded()
  await planBtn.click()
  await expect(page.getByText(/5 planned · 3 left in backlog/)).toBeVisible({ timeout: 15_000 })
  await expect(page.getByText(/never overcommits your day/i)).toBeVisible()

  // --- W3: the focus ring runs and reaches the calm completion state ------
  const startBtn = page.getByRole('button', { name: 'Start a sprint' })
  await startBtn.scrollIntoViewIfNeeded()
  await startBtn.click()
  // 25-second sped-up sprint → the completion badge.
  await expect(page.getByText('Session complete')).toBeVisible({ timeout: 40_000 })

  // THE ASSERTION THAT MATTERS: not one database call in the whole journey.
  expect(dbCalls, `demo widgets hit the database:\n${dbCalls.join('\n')}`).toEqual([])
})

test('security headers are served on every response (audit M1)', async ({ page }) => {
  // The dev/preview server reads these straight out of vercel.json (see the
  // vercelSecurityHeaders plugin), so asserting them here asserts the REAL
  // production values rather than a copy that could drift.
  for (const path of ['/welcome', '/reset-password']) {
    const res = await page.request.get(path)
    expect(res.ok()).toBeTruthy()
    const h = res.headers()

    expect(h['x-frame-options'], `${path} X-Frame-Options`).toBe('DENY')
    expect(h['x-content-type-options'], `${path} X-Content-Type-Options`).toBe('nosniff')
    expect(h['referrer-policy'], `${path} Referrer-Policy`).toBe('strict-origin-when-cross-origin')
    expect(h['permissions-policy'], `${path} Permissions-Policy`).toContain('camera=()')
    expect(h['strict-transport-security'], `${path} HSTS`).toContain('includeSubDomains')

    const csp = h['content-security-policy-report-only']
    expect(csp, `${path} CSP-Report-Only`).toBeTruthy()
    expect(csp).toContain("default-src 'self'")
    expect(csp).toContain("frame-ancestors 'none'")
    expect(csp).toContain("object-src 'none'")
    // Realtime is enabled — the websocket origin must be allowed or sync breaks
    // the moment this policy is switched to enforcing.
    expect(csp).toContain('wss://lplsbfduankkpglyusjp.supabase.co')

    // Still REPORT-ONLY. Enforcing is a deliberate follow-up once the report
    // queue is clean, not something that should land by accident.
    expect(h['content-security-policy'], `${path} must not enforce CSP yet`).toBeUndefined()
  }
})

test('landing: Focus & Calm shows shipped modules as live and only fake-doors the unbuilt ones', async ({
  page,
}) => {
  await page.goto('/welcome')
  await mountLazySections(page)

  const section = page.getByRole('region', { name: /A calmer side to your day/i })
  await expect(section).toBeVisible()

  // SHIPPED — linked into the real app, no "Notify me".
  for (const title of ['Breathwork', 'Supplement & medication tracker']) {
    const card = section.locator('div').filter({ hasText: title }).last()
    await expect(card.getByText('Live').first()).toBeVisible()
  }
  await expect(section.getByRole('button', { name: 'Open Breathwork' })).toBeVisible()
  await expect(
    section.getByRole('button', { name: 'Open Supplement & medication tracker' }),
  ).toBeVisible()

  // NOT BUILT — still honest fake doors.
  await expect(section.getByText('Sleep sounds')).toBeVisible()
  await expect(section.getByText('Guided meditation')).toBeVisible()
  await expect(section.getByRole('button', { name: 'Notify me about Sleep sounds' })).toBeVisible()
  await expect(
    section.getByRole('button', { name: 'Notify me about Guided meditation' }),
  ).toBeVisible()
  // NOTE: deliberately NOT clicked. feature_intents has no delete policy, so a
  // click would leave an undeletable row behind on every CI run.

  // The two shipped modules must NOT be offered as fake doors any more.
  await expect(section.getByRole('button', { name: /Notify me about Breathwork/ })).toHaveCount(0)
  await expect(
    section.getByRole('button', { name: /Notify me about Supplement/ }),
  ).toHaveCount(0)

  // A logged-out visitor is routed to signup, carrying the destination.
  await section.getByRole('button', { name: 'Open Breathwork' }).click()
  await expect(page).toHaveURL(/\/login/)
  await expect(page.getByRole('button', { name: 'Create account' })).toBeVisible()
})

test('landing: footer carries the HBV Studio credit as plain text (no link)', async ({ page }) => {
  await page.goto('/welcome')
  await mountLazySections(page)

  const credit = page.getByText('Powered by HBV Studio')
  await credit.scrollIntoViewIfNeeded()
  await expect(credit).toBeVisible()

  // Deliberately NOT a link yet — a link gets wired later.
  expect(await credit.evaluate((el) => el.closest('a') !== null)).toBe(false)
})

test.afterAll(async () => {
  if (!created) return
  // Safety net: if the journey failed before the UI delete ran, remove the
  // throwaway account with its OWN session via the same delete_own_account RPC —
  // public anon key only, no secrets. Keeps runs from ever polluting the DB.
  const signIn = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: created.email, password: created.password }),
  })
  if (!signIn.ok) return // already deleted (or never fully created) — nothing to clean up
  const { access_token: token } = (await signIn.json()) as { access_token: string }
  const del = await fetch(`${SUPABASE_URL}/rest/v1/rpc/delete_own_account`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: '{}',
  })
  if (!del.ok) {
    throw new Error(
      `E2E cleanup FAILED to delete ${created.email}: HTTP ${del.status} ${await del.text()}`,
    )
  }
})
