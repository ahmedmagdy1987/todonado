import { test, expect } from '@playwright/test'
import {
  cleanupLeftoverAccounts,
  createTestAccount,
  deleteTestAccount,
  expectNoHorizontalOverflow,
  rest,
  signIn,
  tableExists,
} from './fixtures'

/**
 * Stage 1 — the Quit tracker.
 *
 * COVERED
 *   1. /wellness/quit renders and always carries the support note (this runs
 *      even before the migration is applied — the honest "not switched on yet"
 *      state is a shipped state, not a bug, so it is asserted as one).
 *   2. The full journey once `quit_habits` exists: create from a preset with a
 *      replacement action → the live counter → "still clean today" → "I slipped"
 *      → the replacement action surfaced immediately after the reset.
 *   3. Free stops at ONE active habit, and the habit already running is
 *      completely untouched by the gate.
 *   4. The page does not scroll sideways at 390px.
 *
 * The migration ships committed but NOT applied (CLAUDE.md §7), so the
 * interactive tests probe for the table and skip until `supabase db push` has
 * run — the same deploy gate the personal-templates test uses. They then run for
 * real with no code change.
 *
 * OUT OF SCOPE: milestone days (1/3/7/… ) cannot be reached in a browser test
 * without backdating day zero, which the UI deliberately refuses to allow. The
 * boundaries are exhaustively unit-tested instead — see quitMath.test.ts.
 */

test('quit tracker: the route renders and always shows the support note', async ({ page }) => {
  const account = await createTestAccount('quit route')
  await signIn(page, account)

  await page.goto('/wellness/quit')
  await expect(page.getByRole('heading', { name: 'Quit tracker', level: 2 })).toBeVisible()

  // Non-dismissible, on every state of the page. This is the one assertion that
  // must hold whether or not the migration has been applied.
  await expect(
    page.getByText(/professional support helps — this is a personal tracker, not treatment/i),
  ).toBeVisible()

  // It is reachable from the Focus & Calm hub, not just by typing the URL.
  await page.goto('/wellness')
  await expect(page.getByRole('heading', { name: /Focus & Calm/i, level: 2 })).toBeVisible()
  await expect(page.getByRole('link', { name: /Quit tracker/i })).toBeVisible()

  await deleteTestAccount(account, 'quit route')
})

test('quit tracker: create → check in → slip → the replacement action is right there', async ({
  page,
}) => {
  const ready = await tableExists('quit_habits')
  test.skip(
    !ready,
    'quit_habits does not exist yet — apply supabase/migrations/20260730120000_quit_habits.sql',
  )

  const account = await createTestAccount('quit journey')
  await signIn(page, account)
  await page.goto('/wellness/quit')

  // --- Empty state offers the first habit ----------------------------------
  await expect(page.getByRole('heading', { name: 'Nothing being tracked yet' })).toBeVisible()

  // --- Create from a preset, with a replacement action ---------------------
  await page.getByRole('button', { name: /Track your first one/i }).click()
  const dialog = page.getByRole('dialog', { name: /Track a habit/i })
  await expect(dialog).toBeVisible()

  // Picking a preset fills the name for you.
  await dialog.getByRole('button', { name: 'Smoking or vaping' }).click()
  await expect(dialog.getByPlaceholder('Call it whatever makes sense to you')).toHaveValue(
    'Smoking or vaping',
  )

  // A suggestion chip writes the exact stored string, so it can deep-link later.
  await dialog.getByRole('button', { name: 'Breathe for 60 seconds' }).click()
  await dialog.getByRole('button', { name: 'Start tracking' }).click()
  await expect(dialog).toBeHidden()

  // --- The card: day zero, the live clock, the replacement ----------------
  await expect(page.getByRole('heading', { name: 'Smoking or vaping', level: 3 })).toBeVisible()
  await expect(page.getByText(/Day zero/)).toBeVisible()
  // The live elapsed clock (0d 00h 00m 00s and counting).
  await expect(page.getByText(/\d+d \d{2}h \d{2}m \d{2}s/)).toBeVisible()
  // The replacement action is on the card itself, not hidden behind the slip.
  await expect(page.getByText('Instead, you do')).toBeVisible()
  await expect(page.getByText('Breathe for 60 seconds').first()).toBeVisible()
  // A progress track toward the first milestone, as a real progressbar.
  await expect(page.getByRole('progressbar', { name: /Progress to the 1-day milestone/i })).toBeVisible()

  // --- "Still clean today" is optional and reversible ----------------------
  await page.getByRole('button', { name: 'Still clean today' }).click()
  await expect(page.getByRole('button', { name: 'Checked in today' })).toBeVisible()

  const rows = (await rest('quit_checkins?select=checked_on', account.token)) as {
    checked_on: string
  }[]
  expect(rows, 'one check-in row for today').toHaveLength(1)

  // --- "I slipped": what you keep first, then the replacement -------------
  await page.getByRole('button', { name: 'I slipped' }).click()
  const slipDialog = page.getByRole('dialog', { name: 'Reset day zero' })
  await expect(slipDialog).toBeVisible()
  // The no-shame contract, stated once.
  await expect(slipDialog.getByText(/A slip is not a failure/i)).toBeVisible()
  await expect(slipDialog.getByText(/longest run, kept on record/i)).toBeVisible()
  // The replacement is in the dialog too — this is the moment it exists for.
  await expect(slipDialog.getByText('Breathe for 60 seconds')).toBeVisible()
  // No destructive framing: this is not a scary confirm.
  await expect(slipDialog.getByRole('button', { name: /^Delete/ })).toHaveCount(0)

  await slipDialog.getByRole('button', { name: 'Reset day zero' }).click()
  await expect(slipDialog).toBeHidden()

  // --- THE POINT OF THE FEATURE: the replacement is on screen straight after
  const afterSlip = page.getByRole('region', { name: 'Day zero reset' })
  await expect(afterSlip).toBeVisible()
  await expect(afterSlip.getByText('Do this instead')).toBeVisible()
  await expect(afterSlip.getByText('Breathe for 60 seconds')).toBeVisible()
  // …and it deep-links to the breathwork tool that already exists.
  const doItNow = afterSlip.getByRole('link', { name: /Do it now/i })
  await expect(doItNow).toBeVisible()
  await expect(doItNow).toHaveAttribute('href', '/wellness/breathe')

  // The reset banked the run and moved day zero — the record survived.
  const habits = (await rest(
    'quit_habits?select=longest_streak_days,quit_started_at,replacement_action',
    account.token,
  )) as { longest_streak_days: number; replacement_action: string }[]
  expect(habits).toHaveLength(1)
  // Slipped on day zero, so the record is still 0 — and crucially NOT negative
  // and NOT lowered. The chain-of-slips case is unit-tested.
  expect(habits[0].longest_streak_days).toBe(0)
  expect(habits[0].replacement_action).toBe('Breathe for 60 seconds')

  // --- Free stops at one, and the running habit is untouched --------------
  await page.getByRole('button', { name: 'Add habit' }).click()
  await expect(page.getByRole('note', { name: /Quit habit limit reached/i })).toBeVisible()
  // A card in the page — the editor must NOT have opened behind it.
  await expect(page.getByRole('dialog', { name: /Track a habit/i })).toHaveCount(0)
  // The habit already being tracked still counts and still checks in.
  await expect(page.getByRole('heading', { name: 'Smoking or vaping', level: 3 })).toBeVisible()
  await expect(page.getByRole('button', { name: /Still clean today|Checked in today/ })).toBeVisible()

  // --- Mobile: 390px must not scroll sideways -----------------------------
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(page.getByRole('heading', { name: 'Quit tracker', level: 2 })).toBeVisible()
  await expectNoHorizontalOverflow(page, 390)

  await deleteTestAccount(account, 'quit journey')
})

test.afterAll(cleanupLeftoverAccounts)
