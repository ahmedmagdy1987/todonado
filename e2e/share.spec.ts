import { test, expect } from '@playwright/test'
import {
  cleanupLeftoverAccounts,
  createTestAccount,
  deleteTestAccount,
  rest,
  signIn,
} from './fixtures'

/**
 * Stage 4 — points, the share card, the invite groundwork and the sound settings.
 *
 * None of it needs a migration (points are derived, prefs are device-local, the
 * share card is drawn in the browser), so every test here runs for real in CI.
 * The one exception is the referral CHIP's insert, which the widening migration
 * has to land before it can succeed — so that is asserted as "the chip is
 * offered honestly", not as "the vote was recorded".
 */

/** ISO timestamp `days` ago at local midday (never lands on a day boundary). */
function daysAgoISO(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() - days)
  d.setHours(12, 0, 0, 0)
  return d.toISOString()
}

test('points: the chip is derived from real work, and Insights shows the same number', async ({
  page,
}) => {
  const account = await createTestAccount('points')

  // Two finished tasks (one estimated) and one completed 25-minute session.
  const mk = (body: Record<string, unknown>) =>
    rest('tasks', account.token, {
      method: 'POST',
      body: { workspace_id: account.workspaceId, ...body },
      prefer: 'return=representation',
    })
  await mk({ title: 'Shipped the thing', status: 'done', completed_at: daysAgoISO(1), effort_minutes: 60 })
  await mk({ title: 'Answered the email', status: 'done', completed_at: daysAgoISO(2) })
  await rest('focus_sessions', account.token, {
    method: 'POST',
    body: {
      workspace_id: account.workspaceId,
      planned_minutes: 25,
      started_at: daysAgoISO(1),
      ended_at: daysAgoISO(1),
      status: 'completed',
      actual_seconds: 25 * 60,
    },
  })

  await signIn(page, account)

  // 2 tasks (20) + 60min effort (10) + 1 session (15) + 25min focus (10) = 55
  //
  // POLLED, not read once: the chip appears as soon as EITHER the tasks or the
  // focus-sessions query resolves, so reading the label immediately can catch a
  // partial score (it caught 25 — focus only — on the first run).
  const chip = page.getByLabel(/\d+ points in the last 7 days/)
  await expect(chip).toBeVisible({ timeout: 20_000 })
  await expect
    .poll(async () => Number(/(\d+) points/.exec((await chip.getAttribute('aria-label')) ?? '')?.[1]), {
      timeout: 15_000,
    })
    .toBe(55)
  const chipTotal = 55
  // A band, never "Level 3" — a rolling score cannot honestly be demoted.
  expect(await chip.getAttribute('aria-label')).not.toMatch(/level\s*\d/i)

  // --- Insights shows the SAME number, broken down ------------------------
  // Insights is Pro; flip the plan through the app's own documented override so
  // the real usePlan() gate decides (no test-only branch in app code).
  await page.evaluate(() => localStorage.setItem('todonado.plan', 'pro'))
  await page.goto('/insights')
  const panel = page.getByRole('heading', { name: 'Points', level: 3 })
  await expect(panel).toBeVisible({ timeout: 20_000 })
  await expect(page.getByText('The last 7 days · Getting going')).toBeVisible()
  // Same computation, same window — the two surfaces cannot disagree.
  await expect(page.getByText(String(chipTotal), { exact: true }).first()).toBeVisible()
  await expect(page.getByText('Tasks finished', { exact: true })).toBeVisible()
  await expect(page.getByText('Focus sessions', { exact: true })).toBeVisible()
  await expect(page.getByText('Effort behind them', { exact: true })).toBeVisible()

  await page.evaluate(() => localStorage.removeItem('todonado.plan'))
  await deleteTestAccount(account, 'points')
})

test('share card: renders a real, non-blank PNG and never leaks anything', async ({ page }) => {
  const account = await createTestAccount('share card')
  // A task scheduled AND completed today gives the planning streak a day to count.
  const today = new Date()
  const day = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
  await rest('tasks', account.token, {
    method: 'POST',
    body: {
      workspace_id: account.workspaceId,
      title: 'Planned today',
      scheduled_for: day,
      effort_minutes: 30,
    },
  })

  await signIn(page, account)

  const shareBtn = page.getByRole('button', { name: /Share your \d+-day streak/ })
  await expect(shareBtn).toBeVisible({ timeout: 20_000 })
  await shareBtn.click()

  const dialog = page.getByRole('dialog', { name: 'Share this' })
  await expect(dialog).toBeVisible()

  const canvas = dialog.getByRole('img', { name: /Share card: \d+ day/ })
  await expect(canvas).toBeVisible()

  // THE ASSERTION THAT MATTERS: a real image came out, not a blank canvas.
  const info = await canvas.evaluate((el) => {
    const c = el as HTMLCanvasElement
    const ctx = c.getContext('2d')!
    const { data } = ctx.getImageData(0, 0, c.width, c.height)
    let opaque = 0
    const colours = new Set<string>()
    for (let i = 0; i < data.length; i += 4 * 97) {
      if (data[i + 3] > 0) opaque += 1
      colours.add(`${data[i]},${data[i + 1]},${data[i + 2]}`)
    }
    return { width: c.width, height: c.height, opaque, colours: colours.size, png: c.toDataURL('image/png').length }
  })
  expect(info.width).toBe(1080)
  expect(info.height).toBe(1080)
  expect(info.opaque, 'the card is not transparent').toBeGreaterThan(0)
  expect(info.colours, 'the card is not one flat colour').toBeGreaterThan(3)
  expect(info.png, 'a real PNG was encoded').toBeGreaterThan(5000)

  // Download always works, whatever the browser supports.
  await expect(dialog.getByRole('button', { name: 'Download' })).toBeVisible()
  await expect(dialog.getByText(/made here on your device/i)).toBeVisible()

  await deleteTestAccount(account, 'share card')
})

test('settings: sounds, the briefing switch and the honest invite card', async ({ page }) => {
  const account = await createTestAccount('settings prefs')
  await signIn(page, account)
  await page.goto('/settings')

  // --- Sounds & notices ----------------------------------------------------
  await expect(page.getByRole('heading', { name: 'Sounds & notices' })).toBeVisible()
  const sounds = page.getByRole('switch', { name: 'Sounds' })
  await expect(sounds).toHaveAttribute('aria-checked', 'true')
  // Three synthesised chimes, no audio files.
  for (const tone of ['Soft', 'Bell', 'Low']) {
    await expect(page.getByRole('button', { name: tone })).toBeVisible()
  }
  await page.getByRole('button', { name: 'Bell' }).click()

  // Turning sound off hides the volume and chime controls entirely.
  await sounds.click()
  await expect(sounds).toHaveAttribute('aria-checked', 'false')
  await expect(page.getByRole('button', { name: 'Bell' })).toHaveCount(0)

  // It is HONEST about what it does not do.
  await expect(page.getByText(/Push notifications and email reminders aren’t built yet/i)).toBeVisible()

  // --- The briefing switch really hides the briefing ------------------------
  const briefing = page.getByRole('switch', { name: 'Start-your-day briefing' })
  await expect(briefing).toHaveAttribute('aria-checked', 'true')
  await briefing.click()
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Your Command Center', level: 2 })).toBeVisible()
  await expect(page.getByRole('region', { name: /Good (morning|afternoon|evening)/i })).toHaveCount(0)
  // …and it is not merely dismissed for the day — the reopen affordance is gone too.
  await expect(page.getByRole('button', { name: 'Show briefing' })).toHaveCount(0)

  // The preference survives a reload (it is device-local, in localStorage).
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Your Command Center', level: 2 })).toBeVisible()
  await expect(page.getByRole('region', { name: /Good (morning|afternoon|evening)/i })).toHaveCount(0)

  // --- Invite: a real link, and NO fake referral code -----------------------
  await page.goto('/settings')
  await expect(page.getByRole('heading', { name: 'Invite a friend' })).toBeVisible()
  await expect(page.getByLabel('Link to share')).toHaveValue('https://todonado.com')
  await expect(page.getByRole('button', { name: 'Copy link' })).toBeVisible()
  await expect(page.getByText('Referral rewards are not built yet')).toBeVisible()
  // No invented code, no invented credit balance, no "invite 3 to unlock".
  await expect(page.getByText(/your referral code|credits|invite \d+ friends to unlock/i)).toHaveCount(0)
  // NOTE: the interest chip is deliberately NOT clicked — feature_intents has no
  // delete policy, so a click would leave an undeletable row on every CI run.
  await expect(page.getByRole('button', { name: /referral rewards/i })).toBeVisible()

  /*
   * --- The delete-account promise -----------------------------------------
   * It used to name five things — "tasks, projects, focus history, wellness
   * log, and calendar sources" — while the cascade took eleven. The journal
   * and its VOICE RECORDINGS were the ones missing that mattered: the
   * recordings are also the only part no cascade reaches, so they are removed
   * explicitly before the account goes. The modal is opened but never
   * confirmed; the account is deleted through the RPC below as usual.
   */
  await page.getByRole('button', { name: 'Delete account' }).first().click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  const warning = ((await dialog.textContent()) ?? '').toLowerCase()
  for (const named of [
    'task',
    'project',
    'focus history',
    'journal',
    'voice recording',
    'quit-tracker',
    'vision',
    'mind map',
    'challenge',
    'personal template',
    'supplement',
    'calendar source',
  ]) {
    expect(warning, `the delete warning must name "${named}"`).toContain(named)
  }
  await page.getByRole('button', { name: 'Keep my account' }).click()

  await deleteTestAccount(account, 'settings prefs')
})

test.afterAll(cleanupLeftoverAccounts)
