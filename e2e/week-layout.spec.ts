import { test, expect, type Page } from '@playwright/test'
import {
  type TestAccount,
  cleanupLeftoverAccounts,
  createTestAccount,
  deleteTestAccount,
  expectNoHorizontalOverflow,
  rest,
  signIn,
} from './fixtures'

/**
 * The week board's LAYOUT, pinned.
 *
 * Every assertion here corresponds to something that was actually wrong and
 * would be invisible to a typecheck:
 *
 *   • columns rendered 105–145px wide depending on how full the day was, because
 *     the section sized to its content inside a flex wrapper. The board looked
 *     ragged and nobody could tell it was meant to be seven equal columns.
 *   • the frame was capped at 1152px on every route, so a 1920 screen showed
 *     512px of empty gutter beside a board that had no room.
 *   • between 640 and 1024 the carousel columns collapsed to as little as 29px.
 *   • "Client workshop prep" — twenty characters — rendered as "Client worksh…".
 *
 * None of that is caught by anything else, and all of it is one careless
 * className away from returning.
 */

const day = (n: number) => {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** A week with full days, light days and empty days. */
async function seedWeek(account: TestAccount) {
  const rows = [
    { title: 'Client workshop prep', effort_minutes: 90, scheduled_for: day(0), priority: 3 },
    { title: 'Review the launch copy', effort_minutes: 45, scheduled_for: day(0), priority: 2 },
    { title: 'Standup notes', effort_minutes: 15, scheduled_for: day(0), priority: 0 },
    { title: 'Write the release notes', effort_minutes: 120, scheduled_for: day(1), priority: 2 },
    { title: 'Design review', effort_minutes: 60, scheduled_for: day(3), priority: 1 },
  ]
  await rest('tasks', account.token, {
    method: 'POST',
    body: rows.map((t) => ({ workspace_id: account.workspaceId, ...t })),
  })
}

/** Widths of the seven day columns, in DOM order. */
async function columnWidths(page: Page): Promise<number[]> {
  return page.evaluate(() =>
    [...document.querySelectorAll('section[aria-label]')]
      .filter((el) => /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun)/.test(el.getAttribute('aria-label') ?? ''))
      .map((el) => Math.round(el.getBoundingClientRect().width)),
  )
}

test('week board: seven EQUAL columns that use the width the screen has', async ({ page }) => {
  const account = await createTestAccount('week layout', 360)
  await seedWeek(account)
  await signIn(page, account)
  await page.addInitScript(() => localStorage.setItem('todonado.plan', 'pro'))

  for (const width of [1440, 1920]) {
    await page.setViewportSize({ width, height: 950 })
    await page.goto('/week')
    await expect(page.getByRole('heading', { name: 'Your week' })).toBeVisible({ timeout: 20_000 })

    const widths = await columnWidths(page)
    expect(widths, `${width}: seven columns`).toHaveLength(7)
    // EQUAL, not merely present: an empty day and a full day must render the
    // same width. This is the assertion the old layout failed.
    expect(new Set(widths).size, `${width}: columns differ — ${widths.join(',')}`).toBe(1)
    expect(widths[0], `${width}: columns must be comfortable`).toBeGreaterThanOrEqual(148)

    // The board actually uses the room. At 1920 the frame used to stop at 1152.
    const frame = await page.evaluate(() =>
      Math.round((document.querySelector('main > div') as HTMLElement).getBoundingClientRect().width),
    )
    expect(frame, `${width}: the frame must not waste the screen`).toBeGreaterThan(width - 340)

    await expectNoHorizontalOverflow(page, width)
  }

  // A reading-width route is UNCHANGED — the wide frame is opt-in, per route.
  await page.setViewportSize({ width: 1920, height: 950 })
  await page.goto('/today')
  await expect(page.getByRole('heading', { level: 2 })).toBeVisible({ timeout: 20_000 })
  const todayFrame = await page.evaluate(() =>
    Math.round((document.querySelector('main > div') as HTMLElement).getBoundingClientRect().width),
  )
  expect(todayFrame, 'Today keeps its reading width').toBeLessThanOrEqual(1152)

  await deleteTestAccount(account, 'week layout')
})

test('week board: a short title is never truncated, and empty days invite a drop', async ({
  page,
}) => {
  const account = await createTestAccount('week titles', 360)
  await seedWeek(account)
  await signIn(page, account)
  await page.addInitScript(() => localStorage.setItem('todonado.plan', 'pro'))

  await page.setViewportSize({ width: 1440, height: 950 })
  await page.goto('/week')
  await expect(page.getByRole('heading', { name: 'Your week' })).toBeVisible({ timeout: 20_000 })

  // Rendered in full, not clipped by the browser. `scrollWidth <= clientWidth`
  // is what "no ellipsis" actually means; asserting the text alone would pass
  // even while the user saw "Client worksh…".
  for (const title of ['Client workshop prep', 'Review the launch copy', 'Write the release notes']) {
    const node = page.getByText(title, { exact: true })
    await expect(node, title).toBeVisible()
    const clipped = await node.evaluate((el) => el.scrollHeight > el.clientHeight + 1)
    expect(clipped, `"${title}" is being clipped`).toBe(false)
  }

  // Days with nothing on them say so, and say what to do about it.
  const empties = page.getByText('Nothing planned')
  expect(await empties.count(), 'empty days get a drop target').toBeGreaterThan(0)
  await expect(empties.first()).toBeVisible()
  await expect(page.getByText('Drop a task here').first()).toBeVisible()

  await deleteTestAccount(account, 'week titles')
})

test('week board: the tablet carousel keeps readable columns', async ({ page }) => {
  const account = await createTestAccount('week tablet', 360)
  await seedWeek(account)
  await signIn(page, account)
  await page.addInitScript(() => localStorage.setItem('todonado.plan', 'pro'))

  for (const [width, height, floor] of [
    [768, 1024, 240],
    [390, 844, 300],
  ] as const) {
    await page.setViewportSize({ width, height })
    await page.goto('/week')
    await expect(page.getByRole('heading', { name: 'Your week' })).toBeVisible({ timeout: 20_000 })

    const widths = await columnWidths(page)
    expect(widths).toHaveLength(7)
    // 768 used to collapse these to between 29px and 120px.
    expect(Math.min(...widths), `${width}: columns collapsed — ${widths.join(',')}`).toBeGreaterThanOrEqual(floor)

    await expectNoHorizontalOverflow(page, width)
  }

  await deleteTestAccount(account, 'week tablet')
})

test.afterAll(cleanupLeftoverAccounts)
