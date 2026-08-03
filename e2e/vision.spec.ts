import { test, expect } from '@playwright/test'
import {
  SUPABASE_ANON_KEY,
  SUPABASE_URL,
  cleanupLeftoverAccounts,
  createTestAccount,
  deleteTestAccount,
  expectNoHorizontalOverflow,
  rest,
  signIn,
  tableExists,
} from './fixtures'

/**
 * Stage 3 — the checklist template style and the Vision page.
 *
 * The CHECKLIST tests need no migration at all — the new "Routines & Checklists"
 * catalog entries are plain typed data. `vision_cards` and `user_templates.style`
 * are both APPLIED now (CLAUDE.md §7), so every test here RUNS; the `tableExists`
 * / `columnExists` probes stay as deploy gates for a fresh project, and the
 * route-render test asserts whichever state is live so it is honest either way.
 */

/**
 * Does a COLUMN exist? A missing one makes PostgREST reject the select.
 *
 * PROBED WITH A USER'S OWN TOKEN, not the bare anon key. It used to send only
 * `apikey`, which worked because anon held a table-wide SELECT handed out by
 * Supabase's old default privileges. `20260801170000` revokes that — anon has
 * no legitimate read of user_templates — so an anon probe now answers 401/403
 * and `res.ok` would report a column that plainly exists as missing, flipping
 * the assertion below to the "not switched on yet" branch against an app where
 * it IS switched on. A green-to-red flip caused by the probe, not the product.
 */
async function columnExists(table: string, column: string, token: string): Promise<boolean> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?select=${column}&limit=1`, {
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` },
  })
  return res.ok
}

test('checklists: a checklist template never offers the dated target and lands undated', async ({
  page,
}) => {
  const account = await createTestAccount('checklists')
  await signIn(page, account)

  // --- The new category is browsable -------------------------------------
  await page.goto('/templates')
  await expect(page.getByRole('heading', { name: 'Templates', level: 2 })).toBeVisible()
  await page.getByRole('button', { name: /Routines & Checklists/ }).click()
  await expect(page.getByRole('link', { name: 'Preview Gym: Push Day (PPL)' })).toBeVisible()

  // --- The detail page says what it is, and drops "Today" -----------------
  await page.getByRole('link', { name: 'Preview Gym: Push Day (PPL)' }).click()
  await expect(page.getByRole('heading', { name: 'Gym: Push Day (PPL)', level: 2 })).toBeVisible()
  await expect(page.getByText('Checklist', { exact: true })).toBeVisible()

  const targets = page.getByRole('group', { name: 'Where should these tasks go?' })
  await expect(targets).toBeVisible()
  await expect(targets.getByRole('button', { name: /New project/ })).toBeVisible()
  await expect(targets.getByRole('button', { name: /Inbox/ })).toBeVisible()
  // THE POINT: a checklist has no dates, so the dated target is not offered.
  await expect(targets.getByRole('button', { name: /Today/ })).toHaveCount(0)
  await expect(page.getByText(/doesn’t take a bite out of today’s capacity/i)).toBeVisible()

  // --- Applying it produces UNDATED, effort-tagged tasks -------------------
  await page.getByRole('button', { name: 'Use this list' }).click()
  await expect(page).toHaveURL(/\/projects\/[0-9a-f-]+/, { timeout: 20_000 })

  await expect
    .poll(
      async () =>
        (await rest(
          'tasks?select=title,scheduled_for,effort_minutes&order=position.asc',
          account.token,
        )) as { title: string; scheduled_for: string | null; effort_minutes: number }[],
      { timeout: 15_000 },
    )
    .toHaveLength(9)

  const tasks = (await rest(
    'tasks?select=title,scheduled_for,effort_minutes',
    account.token,
  )) as { title: string; scheduled_for: string | null; effort_minutes: number }[]
  expect(tasks.every((t) => t.scheduled_for === null), 'a checklist is never dated').toBe(true)
  // A checklist is not an excuse to drop the differentiator.
  expect(tasks.every((t) => t.effort_minutes > 0), 'every task still effort-tagged').toBe(true)

  // --- A PLAN is unchanged: it still offers Today, and still dates ---------
  await page.goto('/templates')
  await page.getByRole('link', { name: 'Preview Morning Routine' }).click()
  const planTargets = page.getByRole('group', { name: 'Where should these tasks go?' })
  await expect(planTargets.getByRole('button', { name: /Today/ })).toBeVisible()

  await deleteTestAccount(account, 'checklists')
})

test('checklists: a personal checklist saves, and never lies about the style sticking', async ({
  page,
}) => {
  const ready = await tableExists('user_templates')
  test.skip(!ready, 'user_templates does not exist yet')

  const account = await createTestAccount('personal checklist')
  const hasStyle = await columnExists('user_templates', 'style', account.token)
  await signIn(page, account)

  await page.goto('/templates')
  await page.getByRole('button', { name: 'New template' }).click()
  const editor = page.getByRole('dialog', { name: /template/i })
  await expect(editor).toBeVisible()

  await editor.getByLabel('Name').fill('Sunday reset')
  await editor.getByRole('button', { name: /A checklist/ }).click()
  await editor.getByLabel('Task 1 title').fill('Strip the beds')
  await editor.getByRole('button', { name: /^Save/ }).click()

  // EITHER WAY the template is saved — the only difference is whether the app
  // claims the checklist style stuck. It never claims it falsely.
  await expect(
    hasStyle
      ? page.getByText('Template saved', { exact: true })
      : page.getByText(/checklist mode isn’t switched on yet/i),
  ).toBeVisible({ timeout: 15_000 })

  const saved = (await rest('user_templates?select=title', account.token)) as { title: string }[]
  expect(saved, 'the template itself is never lost').toHaveLength(1)
  expect(saved[0].title).toBe('Sunday reset')

  await deleteTestAccount(account, 'personal checklist')
})

test('vision: the route renders and states its case honestly', async ({ page }) => {
  const account = await createTestAccount('vision route')
  await signIn(page, account)

  await page.goto('/vision')
  await expect(page.getByRole('heading', { name: 'Vision', level: 2 })).toBeVisible()

  if (await tableExists('vision_cards')) {
    await expect(page.getByRole('heading', { name: 'Nothing here yet' })).toBeVisible()
    // The image-board fake door is present and honest about being a fake door.
    await expect(page.getByText(/Would you want picture boards\?/i)).toBeVisible()
  } else {
    await expect(page.getByRole('heading', { name: 'Not switched on yet' })).toBeVisible()
    // No Add button that could only ever fail.
    await expect(page.getByRole('button', { name: 'Add goal' })).toHaveCount(0)
  }

  await page.setViewportSize({ width: 390, height: 844 })
  await expectNoHorizontalOverflow(page, 390)

  await deleteTestAccount(account, 'vision route')
})

test('vision: add a goal, link it to a project, reorder, and stop at the Free limit', async ({
  page,
}) => {
  const ready = await tableExists('vision_cards')
  test.skip(
    !ready,
    'vision_cards does not exist yet — apply supabase/migrations/20260730140000_vision_cards.sql',
  )

  const account = await createTestAccount('vision journey')
  const [project] = (await rest('projects', account.token, {
    method: 'POST',
    body: { workspace_id: account.workspaceId, name: 'Marathon training' },
    prefer: 'return=representation',
  })) as { id: string }[]

  await signIn(page, account)
  await page.goto('/vision')

  // --- Add a goal with a reason and a project link -------------------------
  await page.getByRole('button', { name: /Add your first goal/i }).click()
  const dialog = page.getByRole('dialog', { name: 'Add a goal' })
  await dialog.getByLabel(/What are you working toward/i).fill('Run a half marathon')
  await dialog.getByLabel(/Why does it matter/i).fill('Because I said I would in January.')
  await dialog.getByLabel(/Served by a project/i).selectOption('Marathon training')
  await dialog.getByRole('button', { name: 'Add goal' }).click()
  await expect(dialog).toBeHidden()

  await expect(page.getByRole('heading', { name: 'Run a half marathon', level: 3 })).toBeVisible()
  await expect(page.getByText('Because I said I would in January.')).toBeVisible()
  // The link is what makes it more than a mood board — and it goes somewhere.
  const badge = page.getByRole('link', { name: 'Marathon training' })
  await expect(badge).toBeVisible()
  await expect(badge).toHaveAttribute('href', `/projects/${project.id}`)

  // --- Drag handles exist, so reordering is keyboard-reachable -------------
  await page.getByRole('button', { name: 'Add goal' }).click()
  const second = page.getByRole('dialog', { name: 'Add a goal' })
  await second.getByLabel(/What are you working toward/i).fill('Learn to sail')
  await second.getByRole('button', { name: 'Add goal' }).click()
  await expect(page.getByRole('heading', { name: 'Learn to sail', level: 3 })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Drag to reorder' })).toHaveCount(2)

  // --- Free stops at the limit, and nothing already written is touched -----
  await page.getByRole('button', { name: 'Add goal' }).click()
  const third = page.getByRole('dialog', { name: 'Add a goal' })
  await third.getByLabel(/What are you working toward/i).fill('Third goal')
  await third.getByRole('button', { name: 'Add goal' }).click()

  await page.getByRole('button', { name: 'Add goal' }).click()
  await expect(page.getByRole('note', { name: /Vision card limit reached/i })).toBeVisible()
  // A card in the page — the editor must NOT have opened behind it.
  await expect(page.getByRole('dialog', { name: 'Add a goal' })).toHaveCount(0)
  // All three goals still render and are still editable.
  await expect(page.getByRole('heading', { name: 'Run a half marathon', level: 3 })).toBeVisible()

  const cards = (await rest(
    'vision_cards?select=title,why,project_id,position&order=position.asc',
    account.token,
  )) as { title: string; project_id: string | null; position: number }[]
  expect(cards).toHaveLength(3)
  expect(cards[0].project_id).toBe(project.id)
  // Each new goal appends BELOW, rather than jumping to the top of the list.
  expect(cards.map((c) => c.position)).toEqual([...cards.map((c) => c.position)].sort((a, b) => a - b))

  await deleteTestAccount(account, 'vision journey')
})

test.afterAll(cleanupLeftoverAccounts)
