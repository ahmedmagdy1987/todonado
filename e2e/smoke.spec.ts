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
 *
 * Two details this depends on, both learned the hard way from a CI-only failure:
 *
 *  1. YIELD A FRAME after each scroll. IntersectionObserver only recomputes at a
 *     rendering opportunity. On a saturated main thread (cold Vite in CI,
 *     transforming a dozen chunks) a tight scroll loop never lets the page
 *     paint, so every scroll collapses into ONE observation — taken at the final
 *     position. The loop used to end at the top, so nothing below the fold ever
 *     mounted and five whole sections silently went missing.
 *  2. VERIFY, don't assume. The document grows as sections mount, so one sweep
 *     may not reach the new bottom. Sweep until the last lazy section exists.
 */
async function mountLazySections(page: import('@playwright/test').Page) {
  const sweep = () =>
    page.evaluate(async () => {
      const frame = () => new Promise((r) => requestAnimationFrame(() => r(null)))
      const step = Math.round(window.innerHeight * 0.75)
      for (let y = 0; y < document.body.scrollHeight; y += step) {
        window.scrollTo(0, y)
        await frame()
        await frame()
        await new Promise((r) => setTimeout(r, 100))
      }
      window.scrollTo(0, document.body.scrollHeight)
      await frame()
      await new Promise((r) => setTimeout(r, 150))
    })

  // The pricing teaser is the LAST lazily-mounted section — once its link is in
  // the DOM, everything above it has mounted too.
  const sentinel = page.getByRole('link', { name: 'Compare all plans' })
  for (let attempt = 0; attempt < 5 && (await sentinel.count()) === 0; attempt += 1) {
    await sweep()
  }
  await expect(sentinel, 'lazy landing sections never mounted').toHaveCount(1)
  await page.evaluate(() => window.scrollTo(0, 0))
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

// --- REST helpers for the history-window test -------------------------------
// Data is seeded over the REST API with the user's OWN session (RLS applies
// normally) rather than through the UI, so the fixture is deterministic: the
// UI has no way to backdate a completion.
async function rest(
  path: string,
  token: string,
  init: { method?: string; body?: unknown; prefer?: string } = {},
) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method: init.method ?? 'GET',
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(init.prefer ? { Prefer: init.prefer } : {}),
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`REST ${path} → ${res.status} ${text}`)
  return text ? (JSON.parse(text) as unknown) : null
}

/** ISO timestamp `days` ago at local midday (never lands on a day boundary). */
function daysAgoISO(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() - days)
  d.setHours(12, 0, 0, 0)
  return d.toISOString()
}

test('Free history window: first run is untouched, old history is windowed, upgrade reveals it', async ({
  page,
}) => {
  // --- Seed a throwaway account with a KNOWN history spread ----------------
  const id = uniqueIdentity()
  const signUp = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
    method: 'POST',
    headers: { apikey: SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: id.email, password: id.password }),
  })
  expect(signUp.ok, 'signup for the history fixture').toBeTruthy()
  const auth = (await signUp.json()) as { access_token: string; user: { id: string } }
  const token = auth.access_token
  created = { email: id.email, password: id.password } // safety net owns cleanup

  // Skip first-run onboarding so the app lands straight on the project.
  await rest(`profiles?id=eq.${auth.user.id}`, token, {
    method: 'PATCH',
    body: { onboarding_completed: true },
  })
  const workspaces = (await rest('workspaces?select=id', token)) as { id: string }[]
  const workspaceId = workspaces[0].id
  const [project] = (await rest('projects', token, {
    method: 'POST',
    body: { workspace_id: workspaceId, name: 'History fixture' },
    prefer: 'return=representation',
  })) as { id: string }[]

  const mk = (body: Record<string, unknown>) =>
    rest('tasks', token, {
      method: 'POST',
      body: { workspace_id: workspaceId, project_id: project.id, ...body },
      prefer: 'return=representation',
    })
  await mk({ title: 'Recently finished', status: 'done', completed_at: daysAgoISO(2) })
  await mk({ title: 'Finished long ago', status: 'done', completed_at: daysAgoISO(40) })
  // The invariant that matters most: an OPEN task older than the window must
  // still show and still be plannable on Free.
  await mk({ title: 'Ancient open task', status: 'todo', effort_minutes: 30 })

  // --- Sign in through the UI ---------------------------------------------
  await page.goto('/login')
  await page.getByLabel('Email', { exact: true }).fill(id.email)
  await page.getByLabel('Password', { exact: true }).fill(id.password)
  await page.getByRole('button', { name: 'Sign in' }).last().click()
  await expect(page.getByRole('heading', { name: 'Your Command Center', level: 2 })).toBeVisible({
    timeout: 30_000,
  })

  // FIRST-RUN PROOF: this account's own history is only minutes old, and the
  // 40-day task is the ONLY thing outside the window — Today never shows a
  // cutoff, because Today is never history.
  await expect(page.getByText(/Your history continues/)).toHaveCount(0)

  // --- FREE: the project view is windowed ---------------------------------
  await page.goto(`/projects/${project.id}`)
  await expect(page.getByRole('button', { name: 'Recently finished' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Ancient open task' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Finished long ago' })).toHaveCount(0)

  // The quiet cutoff card — a card, not a dialog.
  const cutoff = page.getByText(/Your history continues/)
  await expect(cutoff).toBeVisible()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'Upgrade' })).toBeVisible()

  // --- UPGRADE: everything reappears, with no data ever having moved -------
  // Flip the plan through the app's OWN documented preview override, so the
  // real usePlan() gate decides — no test-only branch in app code.
  await page.evaluate(() => localStorage.setItem('todonado.plan', 'pro'))
  await page.reload()

  await expect(page.getByRole('button', { name: 'Finished long ago' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Recently finished' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Ancient open task' })).toBeVisible()
  await expect(page.getByText(/Your history continues/)).toHaveCount(0)

  // --- DOWNGRADE: it windows again, proving the data was never touched -----
  await page.evaluate(() => localStorage.removeItem('todonado.plan'))
  await page.reload()
  await expect(page.getByRole('button', { name: 'Finished long ago' })).toHaveCount(0)
  await expect(page.getByText(/Your history continues/)).toBeVisible()

  // Cleanup: the account (and its fixture rows) self-delete.
  const del = await fetch(`${SUPABASE_URL}/rest/v1/rpc/delete_own_account`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: '{}',
  })
  expect(del.ok, `history fixture cleanup failed: ${del.status}`).toBeTruthy()
  created = null
})

test('calendar proxy: never serves data to an anonymous caller', async ({ page }) => {
  // The dev/preview server mounts api/*.ts (see devApiRoutes in vite.config.ts),
  // so this drives the REAL handler rather than trusting it.
  const get = await page.request.get('/api/calendar-fetch')
  expect(get.status(), 'GET must be rejected').toBe(405)

  const res = await page.request.post('/api/calendar-fetch', {
    data: { url: 'http://169.254.169.254/latest/meta-data/' },
  })
  // 401 once deployed with Supabase env present; 503 not_configured locally,
  // where there is deliberately no service-role key. Either way: a rejection.
  expect([401, 503], `unexpected status ${res.status()}`).toContain(res.status())
  const body = await res.text()
  expect(body, 'must never return calendar data unauthenticated').not.toContain('"sources"')
  // A 503 lists missing variable NAMES only — never a value.
  expect(body).not.toContain('service-role')
})

test('calendar: live URL sync is Pro — Free gets an honest upsell and file upload still works', async ({
  page,
}) => {
  const id = uniqueIdentity()
  const signUp = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
    method: 'POST',
    headers: { apikey: SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: id.email, password: id.password }),
  })
  expect(signUp.ok, 'signup for the calendar fixture').toBeTruthy()
  const auth = (await signUp.json()) as { access_token: string; user: { id: string } }
  const token = auth.access_token
  created = { email: id.email, password: id.password } // safety net owns cleanup

  await rest(`profiles?id=eq.${auth.user.id}`, token, {
    method: 'PATCH',
    body: { onboarding_completed: true },
  })

  await page.goto('/login')
  await page.getByLabel('Email', { exact: true }).fill(id.email)
  await page.getByLabel('Password', { exact: true }).fill(id.password)
  await page.getByRole('button', { name: 'Sign in' }).last().click()
  await expect(page.getByRole('heading', { name: 'Your Command Center', level: 2 })).toBeVisible({
    timeout: 30_000,
  })

  await page.goto('/settings')
  await expect(page.getByRole('heading', { name: 'Calendar' })).toBeVisible()

  // --- FREE submits a subscribe URL → honest upsell, nothing saved ----------
  await page.getByLabel('Calendar .ics URL').fill('https://calendar.google.com/basic.ics')
  await page.getByRole('button', { name: 'Subscribe' }).click()

  const upsell = page.getByRole('note', { name: /Live calendar sync is a Pro feature/i })
  await expect(upsell).toBeVisible()
  await expect(upsell.getByRole('link', { name: 'Upgrade' })).toBeVisible()
  // A card in the page — never a modal that traps the user.
  await expect(page.getByRole('dialog')).toHaveCount(0)

  // The gate is real: no source row was created.
  const afterUrl = (await rest('calendar_sources?select=id,kind', token)) as { kind: string }[]
  expect(afterUrl, 'Free must not create a URL source').toHaveLength(0)

  // --- FREE file upload is untouched and fully functional -------------------
  const ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'BEGIN:VEVENT',
    'UID:e2e-1',
    'DTSTART:20260101T090000Z',
    'DTEND:20260101T100000Z',
    'SUMMARY:Standup',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n')
  await page.locator('input[type="file"]').setInputFiles({
    name: 'work.ics',
    mimeType: 'text/calendar',
    buffer: Buffer.from(ics),
  })

  await expect(page.getByText('work.ics')).toBeVisible({ timeout: 15_000 })
  await expect(page.getByText('File').first()).toBeVisible()

  const afterFile = (await rest('calendar_sources?select=id,kind', token)) as { kind: string }[]
  expect(afterFile.map((s) => s.kind), 'Free keeps full .ics file import').toEqual(['file'])

  const del = await fetch(`${SUPABASE_URL}/rest/v1/rpc/delete_own_account`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: '{}',
  })
  expect(del.ok, `calendar fixture cleanup failed: ${del.status}`).toBeTruthy()
  created = null
})

test('daily digest: Free base is useful, dismiss lasts the day, Pro adds the ready-made plan', async ({
  page,
}) => {
  const id = uniqueIdentity()
  const signUp = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
    method: 'POST',
    headers: { apikey: SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: id.email, password: id.password }),
  })
  expect(signUp.ok, 'signup for the digest fixture').toBeTruthy()
  const auth = (await signUp.json()) as { access_token: string; user: { id: string } }
  const token = auth.access_token
  created = { email: id.email, password: id.password }

  await rest(`profiles?id=eq.${auth.user.id}`, token, {
    method: 'PATCH',
    body: { onboarding_completed: true, daily_capacity_minutes: 360 },
  })
  const workspaces = (await rest('workspaces?select=id', token)) as { id: string }[]
  const workspaceId = workspaces[0].id
  const dayOffset = (n: number) => {
    const d = new Date()
    d.setDate(d.getDate() + n)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }
  const mk = (body: Record<string, unknown>) =>
    rest('tasks', token, {
      method: 'POST',
      body: { workspace_id: workspaceId, ...body },
      prefer: 'return=representation',
    })

  await mk({ title: 'Carried over A', scheduled_for: dayOffset(-1), effort_minutes: 45 })
  await mk({ title: 'Overdue contract', scheduled_for: dayOffset(-2), effort_minutes: 30, priority: 3 })
  await mk({ title: 'Backlog task one', effort_minutes: 60, priority: 2 })
  await mk({ title: 'Backlog task two', effort_minutes: 30, priority: 1 })

  await page.goto('/login')
  await page.getByLabel('Email', { exact: true }).fill(id.email)
  await page.getByLabel('Password', { exact: true }).fill(id.password)
  await page.getByRole('button', { name: 'Sign in' }).last().click()
  await expect(page.getByRole('heading', { name: 'Your Command Center', level: 2 })).toBeVisible({
    timeout: 30_000,
  })

  const briefing = page.getByRole('region', { name: /Good (morning|afternoon|evening)/i })

  // --- FREE: a genuinely useful base ---------------------------------------
  await expect(briefing).toBeVisible()
  // Today itself still renders fully alongside it — the card never gates the page.
  await expect(page.getByRole('heading', { name: 'Day Capacity' })).toBeVisible()

  await expect(briefing.getByText(/Carried over from earlier days: 2 tasks/i)).toBeVisible()
  await expect(briefing.getByText(/free today/i)).toBeVisible()
  await expect(briefing.getByRole('button', { name: 'Plan my day' })).toBeVisible()
  // Quiet Pro line, no suggestion block, no modal.
  await expect(briefing.getByText(/Your suggested day is ready/i)).toBeVisible()
  await expect(briefing.getByRole('button', { name: 'Accept' })).toHaveCount(0)
  await expect(page.getByRole('dialog')).toHaveCount(0)

  // --- Dismiss lasts the day and survives a reload -------------------------
  await briefing.getByRole('button', { name: /Dismiss today/i }).click()
  await expect(briefing).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Show briefing' })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Your Command Center', level: 2 })).toBeVisible()
  await expect(briefing).toHaveCount(0)
  // …and can be reopened the same day.
  await page.getByRole('button', { name: 'Show briefing' }).click()
  await expect(briefing).toBeVisible()

  // --- PRO: the smart layer ------------------------------------------------
  await page.evaluate(() => localStorage.setItem('todonado.plan', 'pro'))
  await page.reload()
  await expect(briefing).toBeVisible({ timeout: 30_000 })

  await expect(briefing.getByText(/Your suggested day:/i)).toBeVisible()
  await expect(briefing.getByText(/Overdue contract/).first()).toBeVisible()
  await expect(briefing.getByText(/high priority, overdue/i)).toBeVisible()
  await expect(briefing.getByText(/Your suggested day is ready/i)).toHaveCount(0)

  // Accept applies the plan through the existing undo path.
  await briefing.getByRole('button', { name: 'Accept' }).click()
  await expect(page.getByText(/Planned \d+ tasks? to today/i)).toBeVisible()

  const del = await fetch(`${SUPABASE_URL}/rest/v1/rpc/delete_own_account`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: '{}',
  })
  expect(del.ok, `digest fixture cleanup failed: ${del.status}`).toBeTruthy()
  created = null
})

/**
 * Personal templates ship with their migration COMMITTED BUT NOT APPLIED, so
 * this probes for the table and skips until `supabase db push` has run. It then
 * exercises the real flow with no further changes — the skip is a deploy gate,
 * not a permanent excuse.
 */
async function userTemplatesTableExists(): Promise<boolean> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/user_templates?select=id&limit=1`, {
    headers: { apikey: SUPABASE_ANON_KEY },
  })
  return res.status !== 404
}

test('personal templates: capture a project → My templates → apply to Today; Free stops at the limit', async ({
  page,
}) => {
  const ready = await userTemplatesTableExists()
  test.skip(
    !ready,
    'user_templates does not exist yet — apply supabase/migrations/20260728120000_user_templates.sql',
  )

  const id = uniqueIdentity()
  const signUp = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
    method: 'POST',
    headers: { apikey: SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: id.email, password: id.password }),
  })
  expect(signUp.ok, 'signup for the templates fixture').toBeTruthy()
  const auth = (await signUp.json()) as { access_token: string; user: { id: string } }
  const token = auth.access_token
  created = { email: id.email, password: id.password }

  await rest(`profiles?id=eq.${auth.user.id}`, token, {
    method: 'PATCH',
    body: { onboarding_completed: true, daily_capacity_minutes: 480 },
  })
  const workspaces = (await rest('workspaces?select=id', token)) as { id: string }[]
  const workspaceId = workspaces[0].id
  const [project] = (await rest('projects', token, {
    method: 'POST',
    body: { workspace_id: workspaceId, name: 'Client onboarding' },
    prefer: 'return=representation',
  })) as { id: string }[]
  const [section] = (await rest('sections', token, {
    method: 'POST',
    body: { project_id: project.id, name: 'Kickoff', position: 0 },
    prefer: 'return=representation',
  })) as { id: string }[]

  const mk = (body: Record<string, unknown>) =>
    rest('tasks', token, {
      method: 'POST',
      body: { workspace_id: workspaceId, project_id: project.id, ...body },
      prefer: 'return=representation',
    })
  await mk({ title: 'Collect brand assets', effort_minutes: 20, position: 0 })
  await mk({ title: 'Schedule kickoff call', effort_minutes: 30, position: 0, section_id: section.id })
  await mk({ title: 'Already finished', effort_minutes: 45, status: 'done' })

  await page.goto('/login')
  await page.getByLabel('Email', { exact: true }).fill(id.email)
  await page.getByLabel('Password', { exact: true }).fill(id.password)
  await page.getByRole('button', { name: 'Sign in' }).last().click()
  await expect(page.getByRole('heading', { name: 'Your Command Center', level: 2 })).toBeVisible({
    timeout: 30_000,
  })

  // --- Capture the project as a template -----------------------------------
  await page.goto(`/projects/${project.id}`)
  await page.getByRole('button', { name: 'Save as template' }).click()
  await expect(page.getByText(/Saved .*Client onboarding.* to My templates/i)).toBeVisible({
    timeout: 15_000,
  })

  const saved = (await rest('user_templates?select=title,tasks', token)) as {
    title: string
    tasks: { title: string; effortMinutes: number; section?: string }[]
  }[]
  expect(saved).toHaveLength(1)
  // Fidelity: open tasks only, unsectioned first, section + effort preserved.
  expect(saved[0].tasks).toEqual([
    { title: 'Collect brand assets', effortMinutes: 20 },
    { title: 'Schedule kickoff call', effortMinutes: 30, section: 'Kickoff' },
  ])

  // --- It shows under "My templates" and applies through the shared path ----
  await page.goto('/templates')
  const mine = page.getByRole('region', { name: 'My templates' })
  await expect(mine).toBeVisible()
  await expect(mine.getByRole('link', { name: 'Preview Client onboarding' })).toBeVisible()

  await mine.getByRole('link', { name: 'Preview Client onboarding' }).click()
  await expect(page.getByRole('button', { name: 'Use this list' })).toBeVisible()
  await page.getByRole('button', { name: 'Use this list' }).click()

  // Lands on Today with the tasks and a capacity meter that has moved.
  await expect(page.getByRole('heading', { name: 'Your Command Center', level: 2 })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Collect brand assets' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Schedule kickoff call' })).toBeVisible()
  // 50 minutes of 480 → a non-zero percentage.
  await expect(page.getByText(/\b(?!0%)\d+%\s*planned/)).toBeVisible()

  // --- Free stops at the limit — but nothing already saved is affected ------
  for (const n of [2, 3]) {
    await rest('user_templates', token, {
      method: 'POST',
      body: {
        user_id: auth.user.id,
        title: `Filler ${n}`,
        tasks: [{ title: 'x', effortMinutes: 15 }],
      },
    })
  }
  await page.goto('/templates')
  await expect(mine).toBeVisible()
  await page.getByRole('button', { name: 'New template' }).click()
  await expect(page.getByRole('note', { name: /Personal template limit reached/i })).toBeVisible()
  // The editor must NOT have opened.
  await expect(page.getByRole('dialog', { name: 'New template' })).toHaveCount(0)
  // …and every saved template still previews and applies.
  await expect(mine.getByRole('link', { name: 'Preview Client onboarding' })).toBeVisible()

  const del = await fetch(`${SUPABASE_URL}/rest/v1/rpc/delete_own_account`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: '{}',
  })
  expect(del.ok, `templates fixture cleanup failed: ${del.status}`).toBeTruthy()
  created = null
})

test('week view: Free sees a labelled SAMPLE preview, Pro sees the real 7-day board', async ({
  page,
}) => {
  const id = uniqueIdentity()
  const signUp = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
    method: 'POST',
    headers: { apikey: SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: id.email, password: id.password }),
  })
  expect(signUp.ok, 'signup for the week fixture').toBeTruthy()
  const auth = (await signUp.json()) as { access_token: string; user: { id: string } }
  const token = auth.access_token
  created = { email: id.email, password: id.password }

  await rest(`profiles?id=eq.${auth.user.id}`, token, {
    method: 'PATCH',
    body: { onboarding_completed: true, daily_capacity_minutes: 360 },
  })
  const workspaces = (await rest('workspaces?select=id', token)) as { id: string }[]
  const workspaceId = workspaces[0].id
  const dayOffset = (n: number) => {
    const d = new Date()
    d.setDate(d.getDate() + n)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }
  const mk = (body: Record<string, unknown>) =>
    rest('tasks', token, {
      method: 'POST',
      body: { workspace_id: workspaceId, ...body },
      prefer: 'return=representation',
    })
  await mk({ title: 'Week task today', scheduled_for: dayOffset(0), effort_minutes: 60 })
  await mk({ title: 'Week task thursday', scheduled_for: dayOffset(2), effort_minutes: 90 })
  await mk({ title: 'Unscheduled backlog item', effort_minutes: 45 })

  await page.goto('/login')
  await page.getByLabel('Email', { exact: true }).fill(id.email)
  await page.getByLabel('Password', { exact: true }).fill(id.password)
  await page.getByRole('button', { name: 'Sign in' }).last().click()
  await expect(page.getByRole('heading', { name: 'Your Command Center', level: 2 })).toBeVisible({
    timeout: 30_000,
  })

  // --- FREE: an honestly labelled SAMPLE, never their own week teased -------
  await page.goto('/week')
  await expect(page.getByRole('heading', { name: 'Week planning' })).toBeVisible({ timeout: 15_000 })
  await expect(page.getByText(/A sample week — made-up tasks, not yours/i)).toBeVisible()
  await expect(page.getByText(/Plan your whole week/i)).toBeVisible()
  await expect(page.getByRole('link', { name: 'See Pro' })).toBeVisible()
  // Their REAL tasks must not appear in the preview.
  await expect(page.getByText('Week task today')).toHaveCount(0)

  // --- PRO: the real board, seven meters ------------------------------------
  await page.evaluate(() => localStorage.setItem('todonado.plan', 'pro'))
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Your week' })).toBeVisible({ timeout: 30_000 })

  // One capacity meter per day.
  await expect(page.getByRole('progressbar')).toHaveCount(7)

  // Tasks land on their own day, and the unscheduled one stays in Inbox only.
  await expect(page.getByText('Week task today')).toBeVisible()
  await expect(page.getByText('Week task thursday')).toBeVisible()
  await expect(page.getByText('Unscheduled backlog item')).toHaveCount(0)

  // Each task carries a keyboard-reachable move handle (drag is not mouse-only).
  await expect(page.getByRole('button', { name: /Move Week task today to another day/i })).toBeVisible()

  // The Today ⇄ Week toggle works both ways.
  await page.getByRole('button', { name: 'Today' }).first().click()
  await expect(page.getByRole('heading', { name: 'Your Command Center', level: 2 })).toBeVisible()
  await page.getByRole('button', { name: 'Week' }).first().click()
  await expect(page.getByRole('heading', { name: 'Your week' })).toBeVisible()

  const del = await fetch(`${SUPABASE_URL}/rest/v1/rpc/delete_own_account`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: '{}',
  })
  expect(del.ok, `week fixture cleanup failed: ${del.status}`).toBeTruthy()
  created = null
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
