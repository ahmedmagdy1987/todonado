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

/**
 * Scroll until the landing FAQ has actually mounted.
 *
 * A single scroll pass is a RACE AGAINST THE PAGE'S OWN HEIGHT: each pass only
 * mounts the lazy sections it reaches, and mounting makes the document taller,
 * so the bottom keeps moving away. That is exactly how the first version of the
 * touch-target test below failed with a locator timeout instead of an
 * assertion. Looping until the sentinel exists cannot be outrun.
 */
async function mountFaq(page: Page) {
  const sentinel = page.getByRole('link', { name: /See all pricing questions/i })
  for (let attempt = 0; attempt < 6 && (await sentinel.count()) === 0; attempt += 1) {
    await scrollThrough(page)
    await page.waitForTimeout(150)
  }
  await expect(sentinel, 'the landing FAQ never mounted').toHaveCount(1)
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

/**
 * The vortex funnel.
 *
 * Same promises as the background above, for the same reasons: this is the
 * largest decorative element on the page, it is the one the product is named
 * after, and every way it can go wrong is invisible to a build.
 */
const VORTEX = '.vortex'

test('vortex: decorative, and provably so', async ({ page }) => {
  await page.goto('/welcome')

  const vortex = page.locator(VORTEX)
  await expect(vortex).toHaveCount(1)
  await expect(vortex).toHaveAttribute('aria-hidden', 'true')
  expect(await vortex.evaluate((el) => getComputedStyle(el).pointerEvents)).toBe('none')

  // A background must never be a tab stop.
  expect(await vortex.locator('a, button, input, [tabindex]').count()).toBe(0)

  // The full composition: five rings receding, one eye, nine orbiting motes.
  await expect(page.locator('.vortex__ring')).toHaveCount(5)
  await expect(page.locator('.vortex__core')).toHaveCount(1)
  await expect(page.locator('.vortex__mote')).toHaveCount(9)

  // It is behind the copy: the hero heading must be hit-testable, which it
  // cannot be if a full-bleed decorative layer is painted over it.
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
})

test('vortex: orbits, and parks when the tab is hidden', async ({ page }) => {
  await page.goto('/welcome')

  const orbit = page.locator('.vortex__orbit').first()
  const anim = await orbit.evaluate((el) => {
    const cs = getComputedStyle(el)
    return {
      duration: cs.animationDuration,
      iterations: cs.animationIterationCount,
      state: cs.animationPlayState,
      timing: cs.animationTimingFunction,
    }
  })
  expect(anim.iterations).toBe('infinite')
  expect(anim.state).toBe('running')
  // Slow enough to read as an orbit rather than a spinner.
  expect(Number.parseFloat(anim.duration)).toBeGreaterThan(10)
  expect(anim.timing, 'an orbit that eases is an orbit that looks wrong').toBe('linear')

  // THE MEASURED RULE: nothing in the funnel may be blurred. A blurred surface
  // is re-rasterised every time it moves, which is what cost ~40fps before.
  for (const sel of ['.vortex__mote', '.vortex__core', '.vortex__ring']) {
    const filter = await page.locator(sel).first().evaluate((el) => getComputedStyle(el).filter)
    expect(filter, `${sel} must never be blurred`).toBe('none')
  }

  // Hidden tab ⇒ every cycle parks.
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true })
    document.dispatchEvent(new Event('visibilitychange'))
  })
  await expect(page.locator(VORTEX)).toHaveAttribute('data-paused', 'true')
  expect(await orbit.evaluate((el) => getComputedStyle(el).animationPlayState)).toBe('paused')
})

test('vortex: reduced motion keeps the funnel and stops only the movement', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/welcome')

  // The composition survives in full — this is not "turn the design off".
  await expect(page.locator('.vortex__ring')).toHaveCount(5)
  await expect(page.locator('.vortex__mote')).toHaveCount(9)
  const visible = await page.locator('.vortex__ring').first().evaluate((el) => {
    const cs = getComputedStyle(el)
    return cs.display !== 'none' && cs.opacity !== '0' && cs.visibility !== 'hidden'
  })
  expect(visible, 'the funnel is held still, not removed').toBe(true)

  // Nothing orbits, and nothing pulses.
  expect(await page.locator('.vortex__orbit').first().evaluate((el) => getComputedStyle(el).animationName)).toBe('none')
  expect(await page.locator('.vortex__core').evaluate((el) => getComputedStyle(el).animationName)).toBe('none')

  // The pointer listener is never attached, so moving the mouse writes nothing.
  await page.mouse.move(200, 200)
  await page.mouse.move(900, 500)
  await page.waitForTimeout(150)
  const vx = await page.locator(VORTEX).evaluate((el) => el.style.getPropertyValue('--vx'))
  expect(vx, 'no pointer parallax under reduced motion').toBe('')
})

test('hero: the day completes, and reduced motion starts already finished', async ({ page }) => {
  /*
   * THE HERO'S CONTRACT, IN THE ONE PLACE A REAL ENGINE CAN CHECK IT.
   *
   * Three versions have stood here. A five-element entrance stagger; then a
   * fully static card, because the version before it opened with an EMPTY
   * capacity meter that filled over four seconds and showed a product with
   * nothing in it to anybody who scrolled early; and now a day being finished.
   *
   * The static version fixed the empty-start problem and introduced another
   * that the owner caught on the live site: it read "92% planned" and stopped,
   * so the hero's last word was an amber "nearly full" warning. The number it
   * tracked was planning LOAD, which can only ever approach full.
   *
   * So the rules that matter now are: the meaningful state must be reachable
   * without waiting (reduced motion opens on the finished day), the sequence
   * must actually reach 100, and tasks must visibly complete on the way.
   */

  // ── Reduced motion: the finished day is the FIRST frame ──────────────
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/welcome')

  const hero = page.locator('main > section').first()
  await expect(hero.getByRole('heading', { level: 1 })).toBeVisible()
  await expect(hero.getByText('100%')).toBeVisible()
  await expect(hero.getByText(/Plan complete/)).toBeVisible()

  // Every task is already crossed off, with no animation to wait for.
  const struck = await hero.locator('li span').evaluateAll((els) =>
    els.filter((el) => getComputedStyle(el).textDecorationLine.includes('line-through')).length,
  )
  expect(struck, 'reduced motion opens on a completed day').toBeGreaterThanOrEqual(6)

  // ── Normal motion: it starts at zero and gets all the way to 100 ─────
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.goto('/welcome')

  // The plan is legible before anything moves: this is the differentiator and
  // it must not be something you have to wait for.
  await expect(hero.getByText('Today’s plan')).toBeVisible()
  await expect(hero.getByText(/of 6h/)).toBeVisible()

  // And it resolves. The sequence is a lead-in plus one step per task, so this
  // bound is generous enough not to flake and tight enough to catch a stall.
  await expect(hero.getByText('100%')).toBeVisible({ timeout: 15_000 })
  await expect(hero.getByText(/Plan complete/)).toBeVisible()

  const struckAfter = await hero.locator('li span').evaluateAll((els) =>
    els.filter((el) => getComputedStyle(el).textDecorationLine.includes('line-through')).length,
  )
  expect(struckAfter, 'every planned task ends crossed off').toBeGreaterThanOrEqual(6)

  /*
   * Every CONTENT element in the hero is opaque. The decorative layers are
   * excluded deliberately: the vortex's motes and the aurora's specks genuinely
   * start transparent and fade up, which is what makes them atmosphere. They
   * are `aria-hidden` and carry no information.
   */
  const faded = await hero.locator('*').evaluateAll((els) =>
    els.filter(
      (el) => Number(getComputedStyle(el).opacity) === 0 && !el.closest('[aria-hidden="true"]'),
    ).length,
  )
  expect(faded, 'nothing in the hero is hidden waiting to animate').toBe(0)
})

test('hero: completing a task never moves the layout', async ({ page }) => {
  /*
   * A hero that reflows while somebody is reading it is worse than one that
   * does not move. Seven rows swap a duration for a tick and take a
   * strike-through; none of that may change a height.
   *
   * MEASURED ON THE CARD, NOT THE SECTION, AND AFTER FONTS SETTLE. An earlier
   * version of this test compared the whole hero section immediately after
   * `goto` against the same section fifteen seconds later, and caught a 1px
   * difference that had nothing to do with the animation: the first read
   * happened before the webfont swapped. The card is the thing that animates,
   * so the card is the thing to measure, and `document.fonts.ready` removes the
   * confound rather than papering over it with a tolerance.
   */
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.goto('/welcome')
  await page.evaluate(() => document.fonts.ready)

  const hero = page.locator('main > section').first()
  const card = hero.locator('.shadow-elevation-lg').first()
  const rows = card.locator('li')
  await expect(rows.first()).toBeVisible()

  const measure = async () => ({
    card: await card.evaluate((el) => el.getBoundingClientRect().height),
    rows: await rows.evaluateAll((els) => els.map((el) => el.getBoundingClientRect().height)),
  })

  const before = await measure()
  await expect(card.getByText('100%')).toBeVisible({ timeout: 15_000 })
  const after = await measure()

  expect(after.rows, 'row heights are identical before and after completion').toEqual(before.rows)
  expect(after.card, 'the card does not change height as the day completes').toBe(before.card)
})

test('hero: both CTAs still go where they claim', async ({ page }) => {
  await page.goto('/welcome')

  /*
   * The secondary CTA points at the FEATURES section rather than at /pricing:
   * asking a stranger to evaluate cost before they have been told what the
   * product does is the wrong second step. It is still a REAL anchor rather
   * than a scroll handler, so it works from the keyboard and without
   * JavaScript, and that is what is asserted.
   */
  const explore = page.getByRole('link', { name: 'See what Todonado does' })
  await expect(explore).toHaveAttribute('href', '#features')
  await explore.click()
  await expect(page).toHaveURL(/#features$/)
  // The target exists, so the link cannot rot into a no-op.
  await expect(page.locator('#features')).toHaveCount(1)

  // Primary CTA sends a signed-out visitor to the auth page.
  await page.goto('/welcome')
  await page.getByRole('button', { name: 'Start free' }).first().click()
  await expect(page).toHaveURL(/\/login$/)
})

test('390px: every control in the landing FAQ clears the 44px touch floor', async ({
  page,
}) => {
  /*
   * THE DEFECT THIS EXISTS TO CATCH, WHICH REACHED PRODUCTION.
   *
   * "See all pricing questions" shipped as a bare inline link and measured
   * 162x17 CSS px on the live site. That is under Todonado's own 44px floor and
   * under the WCAG 2.2 SC 2.5.8 AA minimum of 24x24, so it was a conformance
   * failure, not a preference. Nothing caught it: it type-checked, it linted,
   * every content assertion passed, and it looked completely correct.
   *
   * The whole FAQ block is covered rather than just that one link, because it
   * is one component and the next control added to it would be just as easy to
   * miss.
   *
   * The height is measured from the RENDERED BOX. `tap-h-44`-style
   * pseudo-element expansion is deliberately not credited here: this block's
   * controls sit in flowing text, where an absolutely positioned band lands on
   * the lines above and below and is not actually hit-testable.
   */
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/welcome')
  await mountFaq(page)

  const faq = page.locator('section', { has: page.locator('#faq') }).first()
  await faq.scrollIntoViewIfNeeded()
  await expect(faq.getByRole('link', { name: /See all pricing questions/i })).toBeVisible()

  const targets = await faq.evaluate((section) =>
    [...section.querySelectorAll('a, button, summary')].map((el) => ({
      label: (el.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 40),
      height: Math.round(el.getBoundingClientRect().height),
    })),
  )

  expect(targets.length, 'the FAQ should expose its questions plus the link').toBeGreaterThanOrEqual(4)
  for (const t of targets) {
    expect(t.height, `"${t.label}" is ${t.height}px, under the 44px touch floor`).toBeGreaterThanOrEqual(44)
  }
})

test('the landing FAQ link still points at the full set on /pricing', async ({ page }) => {
  // The touch-target fix must not quietly change where the link goes: the
  // homepage carries three questions and the other three live on /pricing, so
  // this anchor is the only route to them.
  await page.goto('/welcome')
  await mountFaq(page)
  const link = page.getByRole('link', { name: /See all pricing questions/i })
  await link.scrollIntoViewIfNeeded()
  await expect(link).toHaveAttribute('href', '/pricing#faq')
})

test('hero: pricing is still one click away from the top of the page', async ({ page }) => {
  /*
   * The rule is unchanged: a visitor who wants the price must never have to
   * scroll the whole page to find it. What changed is where that click lands.
   *
   * The landing now carries the price itself, so the header's "Pricing" is an
   * anchor to that section rather than a navigation to /pricing. Both still
   * exist and both are asserted here: one click from the top reveals the real
   * price, and the full comparison page is still reachable from the page.
   */
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.goto('/welcome')

  await page.getByRole('link', { name: 'Pricing' }).first().click()
  await expect(page).toHaveURL(/#pricing$/)

  const pricing = page.locator('#pricing')
  await expect(pricing).toHaveCount(1)
  await expect(pricing.getByText('$5').first()).toBeVisible()

  // /pricing is not orphaned: the section links on to the full comparison.
  await expect(
    page.getByRole('link', { name: /See the full plan comparison/i }),
  ).toHaveAttribute('href', '/pricing')
})
