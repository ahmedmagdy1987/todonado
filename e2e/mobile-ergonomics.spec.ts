import { test, expect, type Page } from '@playwright/test'
import {
  type TestAccount,
  cleanupLeftoverAccounts,
  createTestAccount,
  deleteTestAccount,
  rest,
  signIn,
} from './fixtures'

/**
 * The 390px invariants, pinned.
 *
 * A design sweep of every route found these by measuring rather than looking,
 * and every one of them is a className away from returning:
 *
 *   • task titles rendered as "Client ..." on the Inbox, because four 44px
 *     action buttons never shrink and the title was the only flex-1 child
 *   • fifteen primary controls sat at 32px because `size="sm"` had no touch floor
 *   • the account avatar, every checkbox and every drag grip were 20–36px
 *   • toasts — where every Undo lives — rendered on top of the bottom nav
 *   • informative copy sat at 11px
 *
 * The checks are deliberately generic: they walk whatever is on the page rather
 * than naming components, so a NEW screen that reintroduces the problem fails
 * too.
 */

const day = (n: number) => {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

async function seed(account: TestAccount) {
  await rest('tasks', account.token, {
    method: 'POST',
    body: [
      { workspace_id: account.workspaceId, title: 'Client workshop prep', effort_minutes: 90, scheduled_for: day(0), priority: 3 },
      { workspace_id: account.workspaceId, title: 'Review the launch copy', effort_minutes: 45, scheduled_for: day(0), priority: 2 },
      { workspace_id: account.workspaceId, title: 'Something for the inbox', effort_minutes: 30, scheduled_for: null, priority: 0 },
    ],
  })
}

/**
 * Interactive elements whose EFFECTIVE target is under 40px.
 *
 * `.tap-44` / `.tap-h-44` draw a transparent hit area with a `::before` that the
 * element's own box does not report, so both are taken into account — otherwise
 * this would fail on controls that are already correct.
 */
async function undersizedTargets(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const out: string[] = []
    const seen = new Set<string>()
    for (const el of document.querySelectorAll('button, a[href], [role="button"], [role="checkbox"]')) {
      const r = el.getBoundingClientRect()
      if (r.width === 0 || r.height === 0) continue
      const cls = el.classList
      const expands = cls.contains('tap-44') || cls.contains('tap-h-44')
      const grown = expands && getComputedStyle(el, '::before').content !== 'none'
      const h = grown ? Math.max(r.height, 44) : r.height
      const w = cls.contains('tap-44') && grown ? Math.max(r.width, 44) : r.width
      // HEIGHT is the rule. A chip in a horizontal row can legitimately be
      // narrow (an effort chip reading "1h" is 32px wide) as long as it is a
      // full thumb tall; a control that is SHORT is the miss.
      if (h >= 40 && w >= 28) continue
      const label = (el.getAttribute('aria-label') || el.textContent || el.tagName).trim().slice(0, 40)
      const key = `${label} ${Math.round(w)}x${Math.round(h)}`
      if (!seen.has(key)) {
        seen.add(key)
        out.push(key)
      }
    }
    return out
  })
}

/** Text under 12px that a user is expected to READ (not a badge or a label). */
async function tinyProse(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const out: string[] = []
    for (const el of document.querySelectorAll('p, li, span, div')) {
      if (el.children.length > 0) continue
      const txt = (el.textContent || '').trim()
      if (txt.length < 16) continue
      const fs = parseFloat(getComputedStyle(el).fontSize)
      if (fs > 0 && fs < 11.5) out.push(`${fs}px "${txt.slice(0, 30)}"`)
    }
    return out
  })
}

test('390px: task titles are readable, and nothing is a 20px tap target', async ({ page }) => {
  const account = await createTestAccount('ergonomics', 360)
  await seed(account)
  await signIn(page, account)
  await page.setViewportSize({ width: 390, height: 844 })

  await page.goto('/inbox')
  await expect(page.getByRole('heading', { name: 'Inbox', level: 2 })).toBeVisible({
    timeout: 20_000,
  })

  // THE ONE THAT MATTERED MOST: a twenty-character title, rendered in full.
  const title = page.getByRole('button', { name: 'Client workshop prep' })
  await expect(title).toBeVisible()
  const width = await title.evaluate((el) => el.getBoundingClientRect().width)
  expect(width, 'the title must get the row, not the leftovers').toBeGreaterThan(180)
  const clipped = await title.evaluate((el) => el.scrollWidth > el.clientWidth + 1)
  expect(clipped, 'the title is being truncated').toBe(false)

  const tooSmall = await undersizedTargets(page)
  expect(tooSmall, `undersized targets: ${tooSmall.join(' | ')}`).toEqual([])

  expect(await tinyProse(page)).toEqual([])

  await deleteTestAccount(account, 'ergonomics')
})

test('390px: primary actions clear 44px, and labels never wrap inside a pill', async ({ page }) => {
  const account = await createTestAccount('ergonomics buttons', 360)
  await seed(account)
  await signIn(page, account)
  await page.setViewportSize({ width: 390, height: 844 })

  await page.goto('/today')
  await expect(page.getByRole('heading', { level: 2 })).toBeVisible({ timeout: 20_000 })

  for (const name of [/Get to work/, /Plan my day/]) {
    const button = page.getByRole('button', { name }).first()
    if ((await button.count()) === 0) continue
    const box = await button.evaluate((el) => ({
      h: el.getBoundingClientRect().height,
      // `scrollHeight / lineHeight` would just measure the pill's own height —
      // the real question is whether the LABEL had to break, which `white-space`
      // answers directly and `scrollWidth` confirms.
      nowrap: getComputedStyle(el).whiteSpace === 'nowrap',
      clippedH: el.scrollWidth > el.clientWidth + 1,
    }))
    expect(box.h, `${name} is under 44px`).toBeGreaterThanOrEqual(44)
    // "Get to / work" inside an h-11 pill is the failure this prevents.
    expect(box.nowrap, `${name} may wrap its label`).toBe(true)
    expect(box.clippedH, `${name} overflows its pill`).toBe(false)
  }

  await deleteTestAccount(account, 'ergonomics buttons')
})

test('390px: a toast never covers the bottom navigation', async ({ page }) => {
  const account = await createTestAccount('ergonomics toast', 360)
  await seed(account)
  await signIn(page, account)
  await page.setViewportSize({ width: 390, height: 844 })

  await page.goto('/inbox')
  await expect(page.getByRole('heading', { name: 'Inbox', level: 2 })).toBeVisible({
    timeout: 20_000,
  })

  // Completing a task raises the undo toast.
  await page.getByRole('checkbox').first().click()
  const toast = page.locator('[role="status"], [role="alert"]').last()
  await expect(toast).toBeVisible({ timeout: 15_000 })

  const clear = await page.evaluate(() => {
    const nav = document.querySelector('nav[aria-label="Primary"]') as HTMLElement | null
    const t = [...document.querySelectorAll('[role="status"], [role="alert"]')]
      .map((el) => el.getBoundingClientRect())
      .filter((r) => r.height > 0)
      .pop()
    if (!nav || !t) return true
    return t.bottom <= nav.getBoundingClientRect().top + 1
  })
  expect(clear, 'the toast sits on top of the bottom nav').toBe(true)

  await deleteTestAccount(account, 'ergonomics toast')
})

test.afterAll(cleanupLeftoverAccounts)
