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
 * Challenges.
 *
 * The claim under test is the one the whole feature rests on: PROGRESS IS
 * DERIVED. So the journey seeds REAL tasks through the REST API and then asserts
 * the bars — nothing anywhere writes a progress value, and if anything ever
 * started to, these numbers would stop matching the tasks behind them.
 *
 * `user_challenges` ships committed-but-UNAPPLIED, so the real journey self-skips
 * until `supabase db push` runs. The same journey also runs against an
 * intercepted table, because a skipping test verifies nothing.
 */

const todayISO = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Seed work the challenges can count. Real rows, real RLS, real user. */
async function seedWork(account: TestAccount) {
  const today = todayISO()
  const done = Array.from({ length: 50 }, (_, i) => ({
    workspace_id: account.workspaceId,
    title: `Finished ${i + 1}`,
    status: 'done',
    // Local noon, so the day key is the same in every timezone the CI might run in.
    completed_at: `${today}T12:00:00`,
    effort_minutes: 30,
  }))
  await rest('tasks', account.token, { method: 'POST', body: done })
  await rest('tasks', account.token, {
    method: 'POST',
    body: [
      {
        workspace_id: account.workspaceId,
        title: 'Planned for today',
        scheduled_for: today,
        effort_minutes: 60,
      },
    ],
  })
}

/**
 * The journey, shared by the real and the intercepted runs so they cannot drift.
 *
 * It deliberately starts with the challenge that COMPLETES immediately, because
 * that is what proves both halves of the design at once: the bar is computed
 * from the 50 seeded tasks, and a finished attempt stops counting against the
 * Free limit.
 */
async function runJourney(page: Page) {
  await page.goto('/challenges')
  await expect(page.getByRole('heading', { name: 'Challenges', level: 2 })).toBeVisible()

  // --- Join the one the seeded work already satisfies ----------------------
  await page.getByRole('button', { name: 'Join Fifty finished' }).click()

  // Derived from the 50 seeded tasks — nothing wrote this number.
  await expect(page.getByText('50 of 50 tasks')).toBeVisible({ timeout: 20_000 })
  // It moved into the Done section — the heading, not the badge, which shares
  // the word and made this ambiguous the first time round.
  await expect(page.getByRole('heading', { name: 'Done', level: 3 })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Share Fifty finished' })).toBeVisible()

  // --- A FINISHED challenge never blocks a new one -------------------------
  await page.getByRole('button', { name: 'Join Seven days of showing up' }).click()

  // One day of seven, because one day has happened — not "1 of 7, 6 missed".
  await expect(page.getByText('1 of 7 days')).toBeVisible({ timeout: 20_000 })
  await expect(page.getByText('6 days left')).toBeVisible()

  // --- …but a RUNNING one does, on Free ------------------------------------
  await page.getByRole('button', { name: 'Join A week inside your capacity' }).click()
  await expect(page.getByRole('note', { name: /Challenge limit reached/i })).toBeVisible()

  // --- Leaving is one tap and loses nothing --------------------------------
  await page.getByRole('button', { name: 'Leave Seven days of showing up' }).click()
  await expect(page.getByText('1 of 7 days')).toHaveCount(0)
  // The finished one is untouched, and so are the tasks behind it.
  await expect(page.getByText('50 of 50 tasks')).toBeVisible()
}

test('challenges: the route renders and states its case honestly', async ({ page }) => {
  const account = await createTestAccount('challenge route')
  await signIn(page, account)

  await page.goto('/challenges')
  await expect(page.getByRole('heading', { name: 'Challenges', level: 2 })).toBeVisible()

  if (await tableExists('user_challenges')) {
    await expect(page.getByRole('heading', { name: 'Pick one' })).toBeVisible()

    // A challenge is offered only when its SOURCE exists. This account tracks no
    // quit habit, so "Thirty days clean" stays hidden — a locked card would read
    // as a nag to start one.
    await expect(page.getByText('Thirty days clean')).toHaveCount(0)

    // The journal one is the mirror image, and it flipped when the migration was
    // applied: `journal_entries` now exists, so the source is there and the
    // challenge appears by itself. It was asserted ABSENT here while the table
    // was pending, which is exactly the same rule read the other way round.
    await expect(page.getByText('Seven days written down')).toBeVisible()
  } else {
    await expect(page.getByRole('heading', { name: 'Not switched on yet' })).toBeVisible()
    // No Join button that could only ever fail.
    await expect(page.getByRole('button', { name: /^Join / })).toHaveCount(0)
  }

  await page.setViewportSize({ width: 390, height: 844 })
  await expectNoHorizontalOverflow(page, 390)

  await deleteTestAccount(account, 'challenge route')
})

test('challenges: progress is derived from real work, and finishing frees the slot', async ({
  page,
}) => {
  const ready = await tableExists('user_challenges')
  test.skip(
    !ready,
    'user_challenges does not exist yet — apply supabase/migrations/20260731130000_user_challenges.sql',
  )

  const account = await createTestAccount('challenge journey')
  await seedWork(account)
  await signIn(page, account)
  await runJourney(page)

  // The row records that you joined and that you finished — never how far along.
  const rows = (await rest(
    'user_challenges?select=challenge_key,status,completed_at',
    account.token,
  )) as { challenge_key: string; status: string; completed_at: string | null }[]
  expect(rows).toHaveLength(1)
  expect(rows[0].challenge_key).toBe('tasks_50')
  expect(rows[0].status).toBe('completed')
  expect(rows[0].completed_at).not.toBeNull()

  await deleteTestAccount(account, 'challenge journey')
})

test('challenges: the same journey against an intercepted table (stubbed)', async ({ page }) => {
  const account = await createTestAccount('challenge stub')
  await seedWork(account)
  await signIn(page, account)

  interface Row {
    id: string
    user_id: string
    challenge_key: string
    started_at: string
    completed_at: string | null
    status: string
    created_at: string
  }
  const store = new Map<string, Row>()

  await page.route('**/rest/v1/user_challenges**', async (route) => {
    const req = route.request()
    const url = new URL(req.url())
    const single = (req.headers()['accept'] ?? '').includes('pgrst.object')
    const json = (body: unknown) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { 'access-control-allow-origin': '*' },
        body: JSON.stringify(body),
      })
    const id = url.searchParams.get('id')?.replace('eq.', '')

    if (req.method() === 'GET') {
      return json([...store.values()])
    }
    if (req.method() === 'POST') {
      const b = req.postDataJSON() as Partial<Row>
      // The UNIQUE the migration declares, enforced here so the stub cannot be
      // more permissive than the real table and hide a double-join bug.
      const clash = [...store.values()].some(
        (r) => r.challenge_key === b.challenge_key && r.started_at === b.started_at,
      )
      if (clash) {
        return route.fulfill({
          status: 409,
          contentType: 'application/json',
          headers: { 'access-control-allow-origin': '*' },
          body: JSON.stringify({ code: '23505', message: 'duplicate key' }),
        })
      }
      const row: Row = {
        id: `aaaaaaaa-bbbb-cccc-dddd-${String(store.size + 1).padStart(12, '0')}`,
        user_id: account.userId,
        challenge_key: b.challenge_key ?? '',
        started_at: b.started_at ?? '',
        completed_at: null,
        status: 'active',
        created_at: new Date().toISOString(),
      }
      store.set(row.id, row)
      return json(single ? row : [row])
    }
    if (req.method() === 'PATCH' && id) {
      const b = req.postDataJSON() as Partial<Row>
      const row = { ...store.get(id)!, ...b }
      store.set(id, row)
      return json(single ? row : [row])
    }
    if (req.method() === 'DELETE' && id) {
      store.delete(id)
      return json([])
    }
    return route.continue()
  })

  await runJourney(page)

  // The stub saw the completion written exactly once, with a timestamp.
  const rows = [...store.values()]
  expect(rows).toHaveLength(1)
  expect(rows[0].challenge_key).toBe('tasks_50')
  expect(rows[0].status).toBe('completed')
  expect(rows[0].completed_at).toBeTruthy()

  await deleteTestAccount(account, 'challenge stub')
})

test.afterAll(cleanupLeftoverAccounts)
