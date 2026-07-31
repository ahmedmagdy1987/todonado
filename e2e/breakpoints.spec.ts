import { test, expect, type Page } from '@playwright/test'
import {
  type TestAccount,
  createTestAccount,
  deleteTestAccount,
  expectNoHorizontalOverflow,
  rest,
  signIn,
} from './fixtures'

/**
 * EVERY ROUTE, AT ALL THREE BREAKPOINTS.
 *
 * The 2026-07-31 design sweep said it had checked 390 / 768 / 1440. Only 390
 * was ever asserted — `mobile-ergonomics.spec.ts` never leaves it — so the two
 * wider claims were carried by a commit message. This spec makes all three real.
 *
 * It found two things the 390-only suite could not:
 *
 *  1. /projects/:id at 768 rendered its project name as "Q3 Laun…" next to two
 *     buttons with room to spare. The wrap that fixes it hinged on `sm` (640),
 *     but this row lives inside AppShell and the 256px sidebar appears at `md`
 *     (768) — so at 768 the CONTENT column is ~512px, narrower than the phone
 *     the wrap was written for. Window width is not content width.
 *  2. The 44px touch floor lifted at `min-width: 768px`, which is iPad PORTRAIT.
 *     It is now `(min-width: 768px) and (pointer: fine)`, and the last test here
 *     is what stops that reverting to a width-only query.
 *
 * The routes are listed explicitly rather than crawled: a route that silently
 * stops being reachable should fail this, not vanish from the coverage.
 */

const PUBLIC_ROUTES = [
  '/welcome',
  '/pricing',
  '/about',
  '/privacy',
  '/terms',
  '/login',
  '/reset-password',
]

const AUTHED_ROUTES = [
  '/today',
  '/week',
  '/inbox',
  '/projects',
  '/focus',
  '/work',
  '/vision',
  '/vision/maps',
  '/journal',
  '/challenges',
  '/hub',
  '/insights',
  '/wellness',
  '/wellness/breathe',
  '/wellness/sleep',
  '/wellness/meditate',
  '/wellness/tracker',
  '/wellness/quit',
  '/templates',
  '/templates/deep-work-day',
  '/settings',
  '/settings/plan',
]

/** The three widths the design sweep is written against. */
const WIDTHS = [390, 768, 1440] as const

/**
 * Long, realistic content. An empty page cannot overflow, so a sweep run
 * against a fresh account proves almost nothing — every layout failure in this
 * app so far has needed a title long enough to fight for room.
 */
const LONG_TITLE = 'Rewrite the onboarding activation sequence and measure retention'
const LONG_PROJECT = 'Q3 Launch — marketing, legal and infra'

const today = () => new Date().toISOString().slice(0, 10)

let account: TestAccount
let projectId = ''

test.beforeAll(async () => {
  account = await createTestAccount('breakpoints', 360)
  const t = account.token

  const projects = (await rest('projects', t, {
    method: 'POST',
    prefer: 'return=representation',
    body: { workspace_id: account.workspaceId, name: LONG_PROJECT, color: '#6C5CE7' },
  })) as { id: string }[]
  projectId = projects[0].id

  const sections = (await rest('sections', t, {
    method: 'POST',
    prefer: 'return=representation',
    body: [
      { project_id: projectId, name: 'Before the announcement', position: 0 },
      { project_id: projectId, name: 'After the announcement', position: 1 },
    ],
  })) as { id: string }[]

  await rest('tasks', t, {
    method: 'POST',
    body: Array.from({ length: 9 }).map((_, i) => ({
      workspace_id: account.workspaceId,
      project_id: i % 2 === 0 ? projectId : null,
      section_id: i % 2 === 0 ? sections[i % 2].id : null,
      title: `${LONG_TITLE} — item ${i + 1}`,
      effort_minutes: 30 + i * 10,
      priority: i % 4,
      due_date: today(),
      scheduled_for: i < 5 ? today() : null,
      position: i,
    })),
  })
})

test.afterAll(async () => {
  if (account) await deleteTestAccount(account, 'breakpoints')
})

/**
 * Names elements crossing the viewport edge — DIAGNOSTICS ONLY, never the
 * assertion. Plenty of elements legitimately sit outside it: the landing
 * page's aurora blobs are positioned wide and clipped by an `overflow-hidden`
 * parent, and entrance animations translate in from off-screen. The invariant
 * that actually matters is whether the PAGE scrolls, which is measured on the
 * document below. Asserting per-element would fail on correct pages.
 */
async function overflowingElements(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const limit = document.documentElement.clientWidth
    const out: string[] = []
    for (const el of Array.from(document.querySelectorAll<HTMLElement>('body *'))) {
      const r = el.getBoundingClientRect()
      if (r.width === 0 || r.height === 0) continue
      if (r.right > limit + 1 || r.left < -1) {
        out.push(
          `${el.tagName.toLowerCase()}.${String(el.className).slice(0, 70)} [${Math.round(r.left)}→${Math.round(r.right)}]`,
        )
      }
      if (out.length >= 5) break
    }
    return out
  })
}

async function checkRoute(page: Page, route: string, width: number) {
  await page.setViewportSize({ width, height: 900 })
  await page.goto(route, { waitUntil: 'domcontentloaded' })
  // Content arrives after the route does; layout failures need the content.
  await page.waitForTimeout(700)
  const measured = await page.evaluate(() => ({
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    viewport: window.innerWidth,
  }))
  if (measured.overflow > 1) {
    const offenders = await overflowingElements(page)
    expect(
      measured.overflow,
      `${route} scrolls sideways at ${width}px by ${measured.overflow}px — widest elements:\n` +
        offenders.join('\n'),
    ).toBeLessThanOrEqual(1)
  }
  expect(measured.viewport, `${route} was not rendered at ${width}px`).toBeLessThanOrEqual(width + 1)
  await expectNoHorizontalOverflow(page, width)
}

test('public routes do not scroll sideways at 390, 768 or 1440', async ({ page }) => {
  test.setTimeout(180_000)
  for (const width of WIDTHS) {
    for (const route of PUBLIC_ROUTES) await checkRoute(page, route, width)
  }
})

test('every signed-in route does not scroll sideways at 390, 768 or 1440', async ({ page }) => {
  test.setTimeout(300_000)
  await page.setViewportSize({ width: 1440, height: 900 })
  await signIn(page, account)

  for (const width of WIDTHS) {
    for (const route of [...AUTHED_ROUTES, `/projects/${projectId}`]) {
      await checkRoute(page, route, width)
    }
  }
})

test('768px: the project name is not squeezed out by the buttons beside it', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await signIn(page, account)

  await page.setViewportSize({ width: 768, height: 1024 })
  await page.goto(`/projects/${projectId}`)
  const heading = page.getByRole('heading', { name: LONG_PROJECT, level: 2 })
  await expect(heading).toBeVisible()

  /*
   * "Visible" is not the test — "Q3 Laun…" was visible too. The question is
   * whether the name gets the ROW, or is sharing it with the two action
   * buttons. So measure the heading against its header: before the fix it held
   * about a quarter of the row while the buttons took the rest; with the
   * actions wrapped below it holds essentially all of it.
   *
   * Deliberately NOT "no ellipsis". At 768 the sidebar leaves a ~448px column
   * and this name is ~461px at text-2xl, so it still ellipsises by a hair — and
   * a test demanding otherwise would only be satisfiable by shrinking the type.
   */
  const share = await heading.evaluate((el) => {
    const header = el.closest('header')
    if (!header) return 0
    return el.getBoundingClientRect().width / header.getBoundingClientRect().width
  })
  expect(
    share,
    `the project name holds only ${Math.round(share * 100)}% of its header row at 768px — ` +
      'the actions beside it are taking the row instead of wrapping below it',
  ).toBeGreaterThan(0.8)
})

test('768px with a TOUCH pointer keeps the 44px targets a mouse does not need', async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: { width: 768, height: 1024 },
    hasTouch: true,
  })
  const page = await context.newPage()
  try {
    await signIn(page, account)

    // Guard the guard: if the emulation ever stops reporting a coarse pointer,
    // this test would silently start asserting the desktop case instead.
    const coarse = await page.evaluate(() => matchMedia('(pointer: coarse)').matches)
    expect(coarse, 'touch emulation is not reporting a coarse pointer').toBe(true)

    await page.goto('/inbox')
    await expect(page.getByRole('heading', { name: 'Inbox', level: 2 })).toBeVisible()
    // WAIT FOR THE ROWS, not just the heading. The controls this test is about
    // live on task rows, and an empty list has none — the first version of this
    // test measured zero elements and passed, which is precisely the failure
    // mode the rest of this session was spent removing.
    await expect(page.getByRole('checkbox').first()).toBeVisible()

    const { shrunk, examined } = await page.evaluate(() => {
      const out: string[] = []
      let examined = 0
      for (const el of document.querySelectorAll('.tap-44, .tap-h-44')) {
        const r = el.getBoundingClientRect()
        if (r.width === 0 || r.height === 0) continue
        examined += 1
        const before = getComputedStyle(el, '::before')
        // `display`, not `content` — the lift sets `display: none` and leaves
        // the content intact, which is how the old check passed either way.
        if (before.display === 'none' || before.content === 'none') {
          const label = (el.getAttribute('aria-label') || el.textContent || el.tagName)
            .trim()
            .slice(0, 40)
          out.push(`${label} ${Math.round(r.width)}x${Math.round(r.height)}`)
        }
      }
      return { shrunk: out, examined }
    })

    // An empty result must mean "all of them are fine", never "there were none".
    expect(examined, 'found no .tap-44 / .tap-h-44 controls to check').toBeGreaterThanOrEqual(3)

    expect(
      shrunk,
      'these lost their 44px hit area on a TOUCH device at 768px — the media query is\n' +
        'keyed on width instead of `pointer: fine`:\n' +
        shrunk.join('\n'),
    ).toEqual([])
  } finally {
    await context.close()
  }
})
