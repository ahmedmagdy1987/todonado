import { test, expect, type Page } from '@playwright/test'
import { expectNoHorizontalOverflow } from './fixtures'

/**
 * The living background.
 *
 * Every assertion here is a PROMISE THAT COULD SILENTLY BREAK: decoration that
 * stops being decoration (focusable, or announced to a screen reader), motion
 * that ignores a reduced-motion preference, a decorative layer that widens the
 * document, or an animation that keeps burning battery in a hidden tab. None of
 * those show up as a failing build — only as a worse product.
 *
 * The one thing NOT asserted here is frame rate: a headless CI runner's fps says
 * nothing useful about a phone. That was measured directly instead (production
 * build, 390px, CPU throttled 4x and 6x — 60fps, identical to the page without
 * the background) and the finding that made it possible is recorded in index.css.
 */

const BG = '.living-bg'

/** Scroll to the bottom and back so lazy sections mount and the page is tall. */
async function scrollThrough(page: Page) {
  await page.evaluate(async () => {
    const frame = () => new Promise((r) => requestAnimationFrame(() => r(null)))
    for (let y = 0; y < document.body.scrollHeight; y += Math.round(window.innerHeight * 0.8)) {
      window.scrollTo(0, y)
      await frame()
      await new Promise((r) => setTimeout(r, 60))
    }
  })
}

test('living background: decorative, and provably so', async ({ page }) => {
  await page.goto('/welcome')

  const bg = page.locator(BG)
  await expect(bg).toHaveCount(1)
  // Decorative means decorative: never announced, never hit-testable.
  await expect(bg).toHaveAttribute('aria-hidden', 'true')
  expect(await bg.evaluate((el) => getComputedStyle(el).pointerEvents)).toBe('none')

  // Nothing inside it can take focus — a background must never be a tab stop.
  expect(await bg.locator('a, button, input, [tabindex]').count()).toBe(0)

  // It sits BEHIND the content: the header is z-30, the background z-0.
  expect(await bg.evaluate((el) => getComputedStyle(el).zIndex)).toBe('0')
})

test('living background: moves, and parks when the tab is hidden', async ({ page }) => {
  await page.goto('/welcome')

  // Three parallax planes and the full aurora.
  await expect(page.locator('.living-bg__layer')).toHaveCount(3)
  await expect(page.locator('.living-bg__blob')).toHaveCount(3)
  await expect(page.locator('.living-bg__grain')).toHaveCount(1)
  await expect(page.locator('.living-bg__speck')).toHaveCount(14)

  // The blobs are actually animating (a real duration, running, and looping).
  const blob = page.locator('.living-bg__blob').first()
  const anim = await blob.evaluate((el) => {
    const cs = getComputedStyle(el)
    return {
      duration: cs.animationDuration,
      iterations: cs.animationIterationCount,
      state: cs.animationPlayState,
      // The measured fix: a blurred layer cannot be moved cheaply.
      filter: cs.filter,
    }
  })
  expect(anim.iterations).toBe('infinite')
  expect(anim.state).toBe('running')
  expect(Number.parseFloat(anim.duration)).toBeGreaterThan(20) // slow, not a screensaver
  expect(anim.filter, 'blobs must never be blurred — it costs ~40fps').toBe('none')

  // Parallax writes exactly one custom property, once per frame.
  await scrollThrough(page)
  await page.waitForTimeout(200)
  const scrollVar = await page.locator(BG).evaluate((el) =>
    getComputedStyle(el).getPropertyValue('--living-scroll').trim(),
  )
  expect(scrollVar, 'the scroll offset should be published to CSS').toMatch(/^\d+(\.\d+)?px$/)
  expect(Number.parseFloat(scrollVar)).toBeGreaterThan(0)

  // Hidden tab ⇒ every cycle parks. Playwright cannot truly background a tab, so
  // this drives the exact event the component listens for.
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true })
    document.dispatchEvent(new Event('visibilitychange'))
  })
  await expect(page.locator(BG)).toHaveAttribute('data-paused', 'true')
  expect(await blob.evaluate((el) => getComputedStyle(el).animationPlayState)).toBe('paused')
})

test('living background: reduced motion stops ALL of it, and the page stays beautiful', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/welcome')

  // The composition survives — this is not "turn the design off".
  const bg = page.locator(BG)
  await expect(bg).toHaveCount(1)
  await expect(page.locator('.living-bg__blob')).toHaveCount(3)
  await expect(page.locator('.living-bg__grain')).toHaveCount(1)
  const visible = await page
    .locator('.living-bg__blob')
    .first()
    .evaluate((el) => {
      const cs = getComputedStyle(el)
      return cs.display !== 'none' && cs.opacity !== '0' && cs.visibility !== 'hidden'
    })
  expect(visible, 'the aurora is held still, not removed').toBe(true)

  // …but nothing moves. Drifting dust would be pointless held still, so it is
  // not rendered at all rather than frozen mid-air.
  await expect(page.locator('.living-bg__speck')).toHaveCount(0)

  // The global reduced-motion rule neutralises the keyframes.
  const frozen = await page.locator('.living-bg__blob').first().evaluate((el) => {
    const cs = getComputedStyle(el)
    return { duration: cs.animationDuration, iterations: cs.animationIterationCount }
  })
  expect(Number.parseFloat(frozen.duration)).toBeLessThan(0.01)
  expect(frozen.iterations).toBe('1')

  // And the parallax listener is never even attached, so scrolling writes nothing.
  await scrollThrough(page)
  await page.waitForTimeout(200)
  const scrollVar = await bg.evaluate((el) =>
    getComputedStyle(el).getPropertyValue('--living-scroll').trim(),
  )
  expect(scrollVar, 'no parallax under reduced motion').toBe('')

  // The page is still fully usable: the hero CTA works.
  await expect(page.getByRole('button', { name: 'Start free' }).first()).toBeVisible()
})

test('living background: never widens the page, at any width', async ({ page }) => {
  // Huge off-screen blobs are exactly the kind of decoration that quietly adds a
  // horizontal scrollbar. `contain: paint` + the wrapper's overflow-x-clip are
  // what prevent it; this proves they do.
  for (const width of [390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 })
    await page.goto('/welcome')
    await scrollThrough(page)
    await expectNoHorizontalOverflow(page, width)
  }
})
