import { test, expect, type Page } from '@playwright/test'
import {
  cleanupLeftoverAccounts,
  createTestAccount,
  deleteTestAccount,
  expectNoHorizontalOverflow,
  rest,
  signIn,
  type TestAccount,
} from './fixtures'

/**
 * Stage 2 — the Get-to-Work flow and Pomodoro mode.
 *
 * HOW THE PHASE TRANSITIONS ARE TESTED WITHOUT WAITING 25 MINUTES: the fixture
 * inserts a focus session whose `started_at` is already in the past, so the real
 * timer is genuinely complete the moment the page mounts. Nothing is mocked and
 * no test-only branch exists in app code — this works precisely BECAUSE the
 * timer derives everything from timestamps instead of counting ticks, so it is
 * the drift-resistance contract that makes the test possible.
 *
 * The pomodoro chain lives in localStorage (see pomodoro.ts for why), so it is
 * seeded the same way a reload would restore it, via addInitScript.
 *
 * No migration is involved: pomodoro mode adds no column and no table, so these
 * tests run for real in CI today rather than skipping on a table probe.
 */

const CHAIN_KEY = 'todonado.pomodoro'

interface Chain {
  sessionId: string | null
  taskId: string | null
  completed: number
  break: { kind: 'break' | 'long-break'; minutes: number; startedAtMs: number } | null
}

/** Put a chain in localStorage before any app code runs on the next navigation. */
async function seedChain(page: Page, chain: Chain) {
  await page.addInitScript(
    ([key, value]) => window.localStorage.setItem(key as string, value as string),
    [CHAIN_KEY, JSON.stringify(chain)] as const,
  )
}

/** Insert a RUNNING focus session that started `minutesAgo` ago. */
async function seedRunningSession(
  account: TestAccount,
  { minutesAgo, plannedMinutes = 25, taskId = null }:
    { minutesAgo: number; plannedMinutes?: number; taskId?: string | null },
): Promise<string> {
  const [row] = (await rest('focus_sessions', account.token, {
    method: 'POST',
    body: {
      workspace_id: account.workspaceId,
      task_id: taskId,
      planned_minutes: plannedMinutes,
      started_at: new Date(Date.now() - minutesAgo * 60_000).toISOString(),
      status: 'running',
    },
    prefer: 'return=representation',
  })) as { id: string }[]
  return row.id
}

test('pomodoro: a finished interval rolls into its break, and the break rolls into the next one', async ({
  page,
}) => {
  const account = await createTestAccount('pomodoro chain')
  const sessionId = await seedRunningSession(account, { minutesAgo: 26 })
  await seedChain(page, { sessionId, taskId: null, completed: 0, break: null })

  await signIn(page, account)
  await page.goto('/focus')

  // --- WORK -> BREAK: the interval was already over, so the break is open ----
  await expect(page.getByText(/Step away for a minute|Break’s over/)).toBeVisible({
    timeout: 20_000,
  })
  await expect(page.getByText('5-min break')).toBeVisible()
  await expect(page.getByText(/^1 pomodoro done/)).toBeVisible()
  // The break is a break, not a long one — this is the every-4th boundary.
  await expect(page.getByText(/Long break/)).toHaveCount(0)
  // The break's own clock is running down from five minutes.
  await expect(page.getByText(/^0[45]:\d{2}$/)).toBeVisible()

  // The interval was recorded as a real completed session — 25 minutes of focus,
  // and NOT a moment of break time (breaks are never rows).
  //
  // POLLED, not read once: `patchSession` is optimistic, so the break screen is
  // on-screen before the write reaches Postgres. Reading immediately is a race
  // that passes alone and fails in a full suite run.
  await expect
    .poll(
      async () =>
        (await rest(
          'focus_sessions?select=status,actual_seconds',
          account.token,
        )) as { status: string; actual_seconds: number }[],
      { timeout: 15_000 },
    )
    .toEqual([{ status: 'completed', actual_seconds: 25 * 60 }])

  // --- BREAK -> WORK: skipping the break starts interval 2 -------------------
  await page.getByRole('button', { name: /Skip the break/i }).click()
  await expect(page.getByText('Pomodoro 2 of 4')).toBeVisible({ timeout: 20_000 })
  await expect(page.getByText(/1 done so far/)).toBeVisible()

  const afterSecond = (await rest(
    'focus_sessions?select=id,status,planned_minutes&order=started_at.desc',
    account.token,
  )) as { status: string; planned_minutes: number }[]
  expect(afterSecond).toHaveLength(2)
  expect(afterSecond[0]).toMatchObject({ status: 'running', planned_minutes: 25 })

  await deleteTestAccount(account, 'pomodoro chain')
})

test('pomodoro: the fourth interval earns the long break', async ({ page }) => {
  const account = await createTestAccount('pomodoro long break')
  const sessionId = await seedRunningSession(account, { minutesAgo: 26 })
  // Three already banked; finishing this one makes four.
  await seedChain(page, { sessionId, taskId: null, completed: 3, break: null })

  await signIn(page, account)
  await page.goto('/focus')

  await expect(page.getByText('Long break', { exact: true })).toBeVisible({ timeout: 20_000 })
  await expect(page.getByText('15-min long break')).toBeVisible()
  await expect(page.getByText(/^4 pomodoros done/)).toBeVisible()
  // The counter wraps: the next interval is 1 of 4 again, not 5 of 4.
  await expect(page.getByRole('button', { name: 'Start pomodoro 1 of 4' })).toBeVisible()
  // A long break is where breathwork is offered, since there is time for it.
  await expect(page.getByRole('link', { name: /breathwork/i })).toBeVisible()

  await deleteTestAccount(account, 'pomodoro long break')
})

test('pomodoro: a break resumed from storage shows the right time left, not a fresh five minutes', async ({
  page,
}) => {
  const account = await createTestAccount('pomodoro break reload')
  // A break that began four minutes ago: one minute should remain.
  await seedChain(page, {
    sessionId: null,
    taskId: null,
    completed: 2,
    break: { kind: 'break', minutes: 5, startedAtMs: Date.now() - 4 * 60_000 },
  })

  await signIn(page, account)
  await page.goto('/focus')

  await expect(page.getByText('5-min break')).toBeVisible({ timeout: 20_000 })
  await expect(page.getByText(/^0[01]:\d{2}$/)).toBeVisible()
  await expect(page.getByText(/^2 pomodoros done/)).toBeVisible()

  // Ending the chain here leaves the setup screen, with nothing recorded.
  await page.getByRole('button', { name: /End for now/i }).click()
  await expect(page.getByRole('heading', { name: 'Focus', level: 2 })).toBeVisible()
  const sessions = (await rest('focus_sessions?select=id', account.token)) as unknown[]
  expect(sessions, 'a break must never create a session row').toHaveLength(0)

  await deleteTestAccount(account, 'pomodoro break reload')
})

test('get to work: picks the overdue task, offers a 60-second reset, hands off to Focus', async ({
  page,
}) => {
  const account = await createTestAccount('get to work', 480)
  const dayOffset = (n: number) => {
    const d = new Date()
    d.setDate(d.getDate() + n)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }
  const mk = (body: Record<string, unknown>) =>
    rest('tasks', account.token, {
      method: 'POST',
      body: { workspace_id: account.workspaceId, ...body },
      prefer: 'return=representation',
    })
  await mk({ title: 'Overdue invoice run', scheduled_for: dayOffset(-2), effort_minutes: 30 })
  await mk({ title: 'Planned for today', scheduled_for: dayOffset(0), effort_minutes: 45, priority: 3 })
  await mk({ title: 'Someday backlog item', effort_minutes: 60 })

  await signIn(page, account)

  // --- Today carries the entry point ---------------------------------------
  await page.getByRole('link', { name: 'Get to work' }).click()
  await expect(page.getByRole('heading', { name: 'Get to work', level: 2 })).toBeVisible()

  // Overdue beats today's plan, even though today's task is higher priority.
  await expect(page.getByRole('heading', { name: 'Overdue invoice run', level: 3 })).toBeVisible()
  await expect(page.getByText('This one is overdue')).toBeVisible()

  // Everything open is still offered as an alternative.
  const picker = page.getByLabel('Choose what to work on')
  await expect(picker).toBeVisible()
  await expect(picker.locator('option')).toHaveCount(3)

  // --- The 60-second reset is the EXISTING breathwork pacer, embedded -------
  await page.getByRole('button', { name: /Clear your head first/i }).click()
  await expect(page.getByRole('heading', { name: 'Sixty seconds' })).toBeVisible()
  // The pacer's own live phase readout proves it is really running.
  await expect(page.getByText(/Breathe in|Breathe out/i).first()).toBeVisible()
  // Ending early is allowed and still returns you to the flow.
  await page.getByRole('button', { name: 'End' }).click()
  await expect(page.getByText(/Head cleared/i)).toBeVisible()

  // --- Hand-off carries BOTH the task and the rhythm ------------------------
  await page.getByRole('button', { name: 'Start focusing' }).click()
  await expect(page).toHaveURL(/\/focus\?task=[0-9a-f-]+&pomodoro=1/)
  const start = page.getByRole('button', { name: 'Start pomodoro 1 of 4' })
  await expect(start).toBeVisible()

  // …and starting it really begins a pomodoro chain.
  await start.click()
  await expect(page.getByText('Pomodoro 1 of 4')).toBeVisible({ timeout: 20_000 })
  await expect(page.getByRole('heading', { name: 'Overdue invoice run' })).toBeVisible()

  const sessions = (await rest(
    'focus_sessions?select=planned_minutes,status,task_id',
    account.token,
  )) as { planned_minutes: number; status: string; task_id: string | null }[]
  expect(sessions).toHaveLength(1)
  expect(sessions[0].planned_minutes).toBe(25)
  expect(sessions[0].task_id, 'the chain works on the task that was chosen').not.toBeNull()

  await deleteTestAccount(account, 'get to work')
})

test('get to work: renders at 390px without scrolling sideways', async ({ page }) => {
  const account = await createTestAccount('get to work mobile')
  await rest('tasks', account.token, {
    method: 'POST',
    body: { workspace_id: account.workspaceId, title: 'A task with a fairly long title to wrap', effort_minutes: 30 },
  })

  await page.setViewportSize({ width: 390, height: 844 })
  await signIn(page, account)
  await page.goto('/work')
  await expect(page.getByRole('heading', { name: 'Get to work', level: 2 })).toBeVisible()
  await expectNoHorizontalOverflow(page, 390)

  await deleteTestAccount(account, 'get to work mobile')
})

test.afterAll(cleanupLeftoverAccounts)
