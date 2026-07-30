import { test, expect, type Page } from '@playwright/test'
import {
  type TestAccount,
  cleanupLeftoverAccounts,
  createTestAccount,
  deleteTestAccount,
  expectNoHorizontalOverflow,
  rest,
  signIn,
  tableExists,
} from './fixtures'

/**
 * The journal.
 *
 * `journal_entries` and the `journal-audio` bucket ship committed-but-UNAPPLIED,
 * so the real journey self-skips until `supabase db push` runs. The same journey
 * also runs against an intercepted table, because a skipping test verifies
 * nothing.
 *
 * VOICE IS NOT RECORDED HERE. Driving MediaRecorder through a headless browser
 * proves the harness works, not the feature; what IS asserted is the part that
 * can actually be wrong in the client — that Free is offered an honest upsell
 * rather than a dead button, and that Pro is offered a real control.
 */

const todayISO = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

async function writeTodaysEntry(page: Page) {
  await page.goto('/journal')
  await expect(page.getByRole('heading', { name: 'Journal', level: 2 })).toBeVisible()

  await page.getByLabel('What got done?').fill('Shipped the journal.')
  await page.getByLabel('What could go better?').fill('Started too late again.')
  await page.getByLabel('Anything else').fill('Sleep earlier.')
  await page.getByRole('button', { name: /Save entry/ }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Saved' })).toBeVisible({
    timeout: 20_000,
  })
}

test('journal: the route renders and states its case honestly', async ({ page }) => {
  const account = await createTestAccount('journal route')
  await signIn(page, account)

  await page.goto('/journal')
  await expect(page.getByRole('heading', { name: 'Journal', level: 2 })).toBeVisible()

  // The AI line is present in EVERY state, because it is true in every state.
  await expect(page.getByText(/AI review of your entries isn.t built yet/i)).toBeVisible()
  // …and there is no fake analysis anywhere near it.
  const body = (await page.locator('main').textContent()) ?? ''
  expect(body).not.toMatch(/your patterns|we noticed|insight:/i)

  if (await tableExists('journal_entries')) {
    await expect(page.getByLabel('What got done?')).toBeVisible()
  } else {
    await expect(page.getByRole('heading', { name: 'Not switched on yet' })).toBeVisible()
    // No Save button that could only ever fail.
    await expect(page.getByRole('button', { name: /Save entry/ })).toHaveCount(0)
  }

  await page.setViewportSize({ width: 390, height: 844 })
  await expectNoHorizontalOverflow(page, 390)

  await deleteTestAccount(account, 'journal route')
})

test('journal: write an entry, reload, and find it — with voice gated to Pro', async ({ page }) => {
  const ready = await tableExists('journal_entries')
  test.skip(
    !ready,
    'journal_entries does not exist yet — apply supabase/migrations/20260731140000_journal_entries.sql',
  )

  const account = await createTestAccount('journal journey')
  await signIn(page, account)
  await writeTodaysEntry(page)

  // --- FREE sees an honest upsell, not a dead button ----------------------
  await expect(page.getByRole('heading', { name: 'Say it instead' })).toBeVisible()
  await expect(page.getByText(/Voice notes are part of Pro/i)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Record' })).toHaveCount(0)

  // --- It survives a reload ------------------------------------------------
  await page.reload()
  await expect(page.getByLabel('What got done?')).toHaveValue('Shipped the journal.', {
    timeout: 20_000,
  })
  await expect(page.getByLabel('What could go better?')).toHaveValue('Started too late again.')

  // --- ONE row for the day, holding the whole entry ------------------------
  const rows = (await rest(
    'journal_entries?select=entry_date,text,audio_path,audio_seconds',
    account.token,
  )) as { entry_date: string; text: string; audio_path: string | null; audio_seconds: number | null }[]
  expect(rows).toHaveLength(1)
  expect(rows[0].entry_date).toBe(todayISO())
  expect(rows[0].text).toContain('Shipped the journal.')
  expect(rows[0].text).toContain('## What could go better')
  expect(rows[0].audio_path).toBeNull()

  // --- Editing the same day UPDATES rather than adding a second entry ------
  await page.getByLabel('Anything else').fill('Actually, sleep much earlier.')
  await page.getByRole('button', { name: /Save changes/ }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Saved' })).toBeVisible({
    timeout: 20_000,
  })
  const after = (await rest('journal_entries?select=entry_date', account.token)) as unknown[]
  expect(after, 'one entry per day').toHaveLength(1)

  // --- PRO is offered the real control -------------------------------------
  // Same local override every other spec uses to exercise a Pro surface.
  await page.evaluate(() => localStorage.setItem('todonado.plan', 'pro'))
  await page.reload()
  // WAIT FOR THE PAGE FIRST. `.count()` does not retry, so counting straight
  // after a reload measured the loading screen and reported that Pro was offered
  // neither a control nor a reason — which was true of a page that had not
  // rendered yet, and false of the product.
  await expect(page.getByLabel('What got done?')).toBeVisible({ timeout: 20_000 })
  await expect(page.getByText(/Voice notes are part of Pro/i)).toHaveCount(0)

  // Either a record button, or an honest reason this browser cannot — never
  // nothing, and never a dead control.
  await expect
    .poll(
      async () =>
        (await page.getByRole('button', { name: /^Record/ }).count()) +
        (await page.getByText(/can.t record audio|microphone is blocked/i).count()),
      { timeout: 15_000, message: 'Pro must get a control or a reason' },
    )
    .toBeGreaterThan(0)

  await deleteTestAccount(account, 'journal journey')
})

test('journal: the same journey against an intercepted table (stubbed)', async ({ page }) => {
  const account = await createTestAccount('journal stub')
  await signIn(page, account)
  await stubJournal(page, account)

  await writeTodaysEntry(page)

  // Past entries are read-only on purpose, so today's is the only editor.
  await expect(page.getByLabel('What got done?')).toHaveValue('Shipped the journal.')

  await page.reload()
  await expect(page.getByLabel('What got done?')).toHaveValue('Shipped the journal.', {
    timeout: 20_000,
  })
  await expect(page.getByLabel('Anything else')).toHaveValue('Sleep earlier.')

  // An entry from an earlier day is listed, searchable, and NOT editable.
  await expect(page.getByRole('heading', { name: 'Earlier' })).toBeVisible()
  await expect(page.getByText('A quieter day.')).toBeVisible()
  await page.getByLabel('Search entries').fill('nothing matches this')
  await expect(page.getByText('Nothing matches that.')).toBeVisible()
  await page.getByLabel('Search entries').fill('quieter')
  await expect(page.getByText('A quieter day.')).toBeVisible()

  await deleteTestAccount(account, 'journal stub')
})

test('journal: the daily briefing offers a way in at the end of the day', async ({ page }) => {
  const account = await createTestAccount('journal digest')
  await signIn(page, account)

  await page.goto('/today')
  const link = page.getByRole('link', { name: /Write down how today went/i })
  await expect(link).toBeVisible({ timeout: 20_000 })
  await expect(link).toHaveAttribute('href', '/journal')

  await deleteTestAccount(account, 'journal digest')
})

/** An in-memory `journal_entries`, seeded with one older entry. */
async function stubJournal(page: Page, account: TestAccount) {
  interface Row {
    id: string
    user_id: string
    entry_date: string
    text: string | null
    audio_path: string | null
    audio_seconds: number | null
    created_at: string
    updated_at: string
  }
  const yesterday = (() => {
    const d = new Date()
    d.setDate(d.getDate() - 1)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  })()

  const store = new Map<string, Row>()
  store.set(yesterday, {
    id: 'seed-1',
    user_id: account.userId,
    entry_date: yesterday,
    text: '## Notes\nA quieter day.',
    audio_path: null,
    audio_seconds: null,
    created_at: `${yesterday}T20:00:00Z`,
    updated_at: `${yesterday}T20:00:00Z`,
  })

  await page.route('**/rest/v1/journal_entries**', async (route) => {
    const req = route.request()
    const single = (req.headers()['accept'] ?? '').includes('pgrst.object')
    const json = (body: unknown) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { 'access-control-allow-origin': '*' },
        body: JSON.stringify(body),
      })

    if (req.method() === 'GET') {
      return json([...store.values()].sort((a, b) => (a.entry_date < b.entry_date ? 1 : -1)))
    }
    if (req.method() === 'POST') {
      // The client UPSERTs on (user_id, entry_date) — the stub keys by day so a
      // second save for the same day replaces rather than duplicates, exactly as
      // the unique constraint would.
      const b = req.postDataJSON() as Partial<Row>
      const day = b.entry_date ?? ''
      const now = new Date().toISOString()
      const row: Row = {
        id: store.get(day)?.id ?? `row-${day}`,
        user_id: account.userId,
        entry_date: day,
        text: b.text ?? null,
        audio_path: b.audio_path ?? null,
        audio_seconds: b.audio_seconds ?? null,
        created_at: store.get(day)?.created_at ?? now,
        updated_at: now,
      }
      store.set(day, row)
      return json(single ? row : [row])
    }
    return json([])
  })
}

test.afterAll(cleanupLeftoverAccounts)
