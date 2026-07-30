import { test, expect } from '@playwright/test'
import {
  cleanupLeftoverAccounts,
  createTestAccount,
  deleteTestAccount,
  expectNoHorizontalOverflow,
  signIn,
} from './fixtures'

/**
 * Stage 5 — the Hub.
 *
 * The one thing worth testing hard: EVERY tile must actually go where it says.
 * A tile pointing at an unmounted route hits the router's catch-all and silently
 * lands the user on Today — no error, no 404, just the wrong screen. So this
 * clicks every live tile and asserts the destination, rather than asserting the
 * grid rendered.
 *
 * `hubTiles.test.ts` pins the same thing statically (tile → mounted route); this
 * proves it in a real browser with the real router.
 */

/** Every live tile, and the heading that proves you arrived. */
const TILES: { label: string; url: RegExp; heading: RegExp }[] = [
  { label: 'Get to work', url: /\/work$/, heading: /^Get to work$/ },
  { label: 'Today', url: /\/today$/, heading: /^Your Command Center$/ },
  { label: 'Week', url: /\/week$/, heading: /Week planning|Your week/ },
  { label: 'Templates', url: /\/templates$/, heading: /^Templates$/ },
  { label: 'Checklists', url: /\/templates\?category=checklists$/, heading: /^Templates$/ },
  { label: 'Focus & pomodoro', url: /\/focus$/, heading: /^Focus$/ },
  { label: 'Breathwork', url: /\/wellness\/breathe$/, heading: /^Breathwork$/ },
  { label: 'Quit tracker', url: /\/wellness\/quit$/, heading: /^Quit tracker$/ },
  { label: 'Vision', url: /\/vision$/, heading: /^Vision$/ },
  { label: 'Insights', url: /\/insights$/, heading: /^Insights$/ },
  { label: 'Wellness', url: /\/wellness$/, heading: /Focus & Calm/ },
  { label: 'Settings', url: /\/settings$/, heading: /^Settings$/ },
]

test('hub: renders every tile and each one goes where it says', async ({ page }) => {
  const account = await createTestAccount('hub')
  await signIn(page, account)

  await page.goto('/hub')
  await expect(page.getByRole('heading', { name: 'Hub', level: 2 })).toBeVisible()
  await expect(page.getByText(/Your day, your focus, your habits/i)).toBeVisible()

  for (const tile of TILES) {
    await page.goto('/hub')
    const link = page.getByRole('link', { name: new RegExp(`^${escape(tile.label)} — `) })
    await expect(link, `the "${tile.label}" tile exists`).toBeVisible()
    await link.click()
    await expect(page, `"${tile.label}" lands on the right URL`).toHaveURL(tile.url, {
      timeout: 20_000,
    })
    await expect(
      page.getByRole('heading', { name: tile.heading, level: 2 }),
      `"${tile.label}" lands on the right screen`,
    ).toBeVisible({ timeout: 20_000 })
  }

  await deleteTestAccount(account, 'hub')
})

test('hub: "Build my day" opens the planner, and the Journal tile is now real', async ({
  page,
}) => {
  const account = await createTestAccount('hub deep links', 480)
  await signIn(page, account)

  // --- Build my day deep-links straight into the planner's preview ---------
  await page.goto('/hub')
  await page.getByRole('link', { name: /^Build my day — / }).click()
  await expect(page).toHaveURL(/\/today\?plan=1$/)
  await expect(page.getByRole('dialog', { name: 'Plan my day' })).toBeVisible({ timeout: 20_000 })

  // --- Journal WAS a fake door. It isn't one any more ----------------------
  //
  // The tile used to be a button that navigated nowhere and explained that a
  // journal needs an AI service. That was true of the version which reads you
  // back and false of the one that simply lets you write, and the writing half
  // now ships. So the assertion is inverted: a tile for a built feature must be
  // a LINK, and the "needs an AI service" copy must be gone from the Hub — the
  // unbuilt AI layer is stated on the journal page itself, next to the thing it
  // is missing from.
  await page.goto('/hub')
  await expect(page.getByRole('button', { name: /^Journal — / })).toHaveCount(0)
  const journal = page.getByRole('link', { name: /^Journal — / })
  await expect(journal).toBeVisible()
  await expect(page.getByText(/needs an AI service this app does not have yet/i)).toHaveCount(0)
  await journal.click()
  await expect(page).toHaveURL(/\/journal$/)
  await expect(page.getByRole('heading', { name: 'Journal', level: 2 })).toBeVisible()
  // …and the honest line lives HERE now, where it can be checked against what
  // the page does and does not do.
  await expect(page.getByText(/AI review of your entries isn.t built yet/i)).toBeVisible()

  await deleteTestAccount(account, 'hub deep links')
})

test('hub: the start-screen preference moves / to the Hub, and Today is the default', async ({
  page,
}) => {
  const account = await createTestAccount('hub start screen')
  await signIn(page, account)

  // --- Today is the default, untouched -------------------------------------
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Your Command Center', level: 2 })).toBeVisible()

  // --- Switch the start screen ---------------------------------------------
  await page.goto('/settings')
  await expect(page.getByRole('heading', { name: 'Start my day on' })).toBeVisible()
  const todayOption = page.getByRole('radio', { name: 'Today' })
  await expect(todayOption).toHaveAttribute('aria-checked', 'true')
  await page.getByRole('radio', { name: 'Hub' }).click()

  // `/` REDIRECTS rather than rendering a page, so the URL always says where
  // you are.
  await page.goto('/')
  await expect(page).toHaveURL(/\/hub$/, { timeout: 20_000 })
  await expect(page.getByRole('heading', { name: 'Hub', level: 2 })).toBeVisible()

  // It survives a reload — the preference is device-local, in localStorage.
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Hub', level: 2 })).toBeVisible()

  // --- THE REGRESSION THIS GUARDS ------------------------------------------
  // Today must stay REACHABLE while the Hub preference is on. When `/` rendered
  // Today directly and only redirected for hub users, every Today control
  // pointed at `/` and bounced straight back to the Hub, so Today was
  // unreachable entirely. Today has its own path now; these assert it works.
  await page.goto('/today')
  await expect(page).toHaveURL(/\/today$/)
  await expect(page.getByRole('heading', { name: 'Your Command Center', level: 2 })).toBeVisible()

  // The nav's Today item, with the preference still on.
  await page.goto('/hub')
  await page.getByRole('complementary').getByRole('link', { name: 'Today', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Your Command Center', level: 2 })).toBeVisible()

  // And the Hub's own Today + Build-my-day tiles, which are the ones that broke.
  await page.goto('/hub')
  await page.getByRole('link', { name: /^Today — / }).click()
  await expect(page.getByRole('heading', { name: 'Your Command Center', level: 2 })).toBeVisible()
  await page.goto('/hub')
  await page.getByRole('link', { name: /^Build my day — / }).click()
  await expect(page.getByRole('dialog', { name: 'Plan my day' })).toBeVisible({ timeout: 20_000 })

  // --- And switching back really switches back ------------------------------
  await page.goto('/settings')
  await page.getByRole('radio', { name: 'Today' }).click()
  await page.goto('/')
  await expect(page).toHaveURL(/\/today$/, { timeout: 20_000 })
  await expect(page.getByRole('heading', { name: 'Your Command Center', level: 2 })).toBeVisible()

  await deleteTestAccount(account, 'hub start screen')
})

test('hub: reachable from the nav and laid out at 390px', async ({ page }) => {
  const account = await createTestAccount('hub nav')
  await signIn(page, account)

  // Desktop: the Hub sits at the TOP of the sidebar.
  const sidebar = page.getByRole('complementary')
  const links = sidebar.getByRole('link')
  await expect(links.first()).toHaveAccessibleName(/Hub/)
  await links.first().click()
  await expect(page).toHaveURL(/\/hub$/)

  // Vision now has its own nav entry too, so its flag doc is true and it stays
  // reachable with FEATURES.hub off.
  await expect(sidebar.getByRole('link', { name: 'Vision', exact: true })).toBeVisible()

  // Mobile: it is in the More sheet, so the bottom bar keeps its five slots.
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/hub')
  await expect(page.getByRole('heading', { name: 'Hub', level: 2 })).toBeVisible()
  await expectNoHorizontalOverflow(page, 390)

  const bottomBar = page.locator('nav').filter({ has: page.getByRole('button', { name: 'More destinations' }) })
  await expect(bottomBar.getByRole('link')).toHaveCount(4)
  await page.getByRole('button', { name: 'More destinations' }).click()
  await expect(page.getByRole('link', { name: 'Hub' })).toBeVisible()

  await deleteTestAccount(account, 'hub nav')
})

/** Escape a label for use inside a RegExp. */
function escape(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

test.afterAll(cleanupLeftoverAccounts)
