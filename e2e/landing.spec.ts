import { test, expect, type Page } from '@playwright/test'
import { expectNoHorizontalOverflow } from './fixtures'

/**
 * The top of the landing page: its backdrop, and the way its sections separate.
 *
 * Every assertion here is a PROMISE THAT COULD SILENTLY BREAK: decoration that
 * stops being decoration (focusable, or announced to a screen reader), a
 * decorative layer that widens the document, motion creeping back into a
 * background that is deliberately still, or the tonal step between two sections
 * quietly collapsing back to the value that made the whole page read as one
 * dark wash. None of those show up as a failing build, only as a worse product.
 *
 * Frame rate is still not asserted: a headless CI runner's fps says nothing
 * useful about a phone. It also matters much less than it did, because the
 * background no longer animates at all.
 */

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

const BACKDROP = '.hero-backdrop'
const LAYERS = ['.hero-backdrop__lattice', '.hero-backdrop__spot', '.hero-backdrop__horizon']

/** CIE L* from a computed `rgb(...)` string. 0 is black, 100 is white. */
function lstar(rgb: string): number {
  const [r, g, b] = (rgb.match(/\d+(\.\d+)?/g) ?? ['0', '0', '0']).map(Number)
  const lin = (c: number) => {
    const v = c / 255
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
  }
  const y = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
  return y > 0.008856 ? 116 * Math.cbrt(y) - 16 : 903.3 * y
}

test('hero backdrop: decorative, and provably so', async ({ page }) => {
  await page.goto('/welcome')

  const bg = page.locator(BACKDROP)
  await expect(bg).toHaveCount(1)
  await expect(bg).toHaveAttribute('aria-hidden', 'true')
  expect(await bg.evaluate((el) => getComputedStyle(el).pointerEvents)).toBe('none')

  // Nothing inside it can be reached by a keyboard or announced.
  expect(await bg.locator('a, button, input, [tabindex]').count()).toBe(0)
  for (const layer of LAYERS) await expect(page.locator(layer)).toHaveCount(1)

  /*
   * It sits BEHIND the content. Carried over verbatim from the deleted
   * living-background test, because it is the one assertion in that group that
   * was about STACKING rather than about motion, and stacking is a property the
   * replacement has too. A full-bleed decorative layer painted over the hero
   * would make the headline unreadable and nothing else here would catch it.
   */
  expect(await bg.evaluate((el) => getComputedStyle(el).zIndex)).toBe('0')
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
})

test('hero backdrop: holds completely still, and blurs nothing', async ({ page }) => {
  /*
   * THE RULE THAT REPLACED AN ENTIRE MOTION SYSTEM.
   *
   * What stood here was an aurora of three drifting blobs, fourteen dust
   * specks, a grain tile and a nine-mote vortex, with about a dozen assertions
   * keeping them cheap. A pixel audit of the rendered page found the whole
   * aurora varied the background by delta-L* 3.34 (a WCAG ratio of 1.083:1),
   * with the grain contributing per-pixel noise worth 30 to 50 percent of that
   * signal, and found the vortex contributing ZERO visible pixels at 390px
   * because its stage sat below the fold.
   *
   * So the assertion is no longer "the motion is cheap". It is that there is
   * none, checked in a real engine where `animationName` and `filter` are
   * resolved rather than read out of a stylesheet.
   */
  await page.goto('/welcome')

  for (const selector of [BACKDROP, ...LAYERS]) {
    const style = await page.locator(selector).evaluate((el) => {
      const s = getComputedStyle(el)
      return {
        animationName: s.animationName,
        filter: s.filter,
        backdropFilter: s.backdropFilter,
      }
    })
    expect(style.animationName, selector + ' animates').toBe('none')
    expect(style.filter, selector + ' is filtered').toBe('none')
    expect(style.backdropFilter, selector + ' carries a backdrop filter').toBe('none')
  }
})

test('hero backdrop: the light has no hard edge at the top of the page', async ({ page }) => {
  /*
   * The spotlight used to be anchored at `50% 0%`, which put its brightest
   * point exactly on the hero section's top edge, which is the header's bottom
   * edge. Sampled down the centre column that measured L* 3.71 at y=60 and
   * L* 15.77 at y=66: a seventeen-point step across six pixels, straight across
   * the full width. It did not read as light, it read as a lit bar welded to
   * the navigation.
   *
   * Two things fix it and both are checked here: the gradient origins sit above
   * the box, and the hero's box is lifted behind the sticky header so the light
   * is not clipped to a line at y=64.
   */
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto('/welcome')
  await page.waitForSelector('h1')

  const heroTop = await page
    .locator('main > section')
    .first()
    .evaluate((el) => Math.round(el.getBoundingClientRect().top + window.scrollY))
  expect(heroTop, 'the hero box must start at the top, behind the header').toBeLessThanOrEqual(0)
  // And the content must not have moved with it: the eyebrow still clears the
  // header, so the lift is invisible to everything except the light.
  const eyebrowTop = await page
    .locator('main ul li')
    .first()
    .evaluate((el) => Math.round(el.getBoundingClientRect().top))
  expect(eyebrowTop, 'the lift moved the content instead of only the box').toBeGreaterThan(64)

  const origins = await page.locator('.hero-backdrop__spot').evaluate((el) => {
    const image = getComputedStyle(el).backgroundImage
    return [...image.matchAll(/at\s+[\d.]+%\s+(-?[\d.]+)%/g)].map((m) => Number(m[1]))
  })
  expect(origins.length, 'the spotlight declares radial origins').toBeGreaterThan(0)
  for (const y of origins) expect(y, 'origin at ' + y + '% is inside the frame').toBeLessThan(0)
})

test('hero backdrop: reduced motion changes nothing, because nothing moves', async ({ page }) => {
  // The old aurora had a whole reduced-motion branch. A static layer needs no
  // exception, and this proves the composition is identical rather than merely
  // frozen: a reduced-motion visitor sees the designed page, not a degraded one.
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/welcome')

  await expect(page.locator(BACKDROP)).toHaveCount(1)
  for (const layer of LAYERS) {
    const visible = await page.locator(layer).evaluate((el) => {
      const s = getComputedStyle(el)
      return { display: s.display, opacity: Number(s.opacity), animation: s.animationName }
    })
    expect(visible.display, layer + ' is hidden under reduced motion').not.toBe('none')
    expect(visible.opacity, layer + ' is invisible under reduced motion').toBeGreaterThan(0)
    expect(visible.animation).toBe('none')
  }
})

test('sections: every boundary at the top of the page is a real step in lightness', async ({
  page,
}) => {
  /*
   * THE CORE DEFECT, PINNED IN A BROWSER.
   *
   * `panel` used to be `bg-surface` (#0F172A) against a `#0A0D16` page. Measured
   * across the real rendered boundary that is delta-L* 4.3, a WCAG step of
   * 1.09:1, which is below the level at which peripheral vision registers an
   * edge while scrolling. An audit found 92.2% of the first screen inside a
   * six-L* band out of a hundred and concluded the page read as one long dark
   * wash rather than as a sequence of rooms.
   *
   * Ten is the floor deliberately: comfortably below the 12.68 the page now
   * ships, so a legitimate token adjustment does not fail it, and comfortably
   * above the 4.3 that failed a human.
   */
  for (const width of [390, 1280]) {
    await page.setViewportSize({ width, height: 900 })
    await page.goto('/welcome')
    await page.waitForSelector('h1')

    const tones = await page.evaluate(() => {
      const pageBg = getComputedStyle(document.body).backgroundColor
      return [...document.querySelectorAll('main > section')].slice(0, 3).map((el) => {
        const own = getComputedStyle(el).backgroundColor
        const clear = own === 'rgba(0, 0, 0, 0)' || own === 'transparent'
        return { label: el.getAttribute('aria-label') ?? '', rgb: clear ? pageBg : own }
      })
    })

    expect(tones.length, 'the top of the page has three sections').toBe(3)
    for (let i = 1; i < tones.length; i += 1) {
      const step = Math.abs(lstar(tones[i].rgb) - lstar(tones[i - 1].rgb))
      const where = tones[i - 1].label + ' to ' + tones[i].label
      expect(step, width + 'px: ' + where + ' steps only ' + step.toFixed(2) + ' L*').toBeGreaterThan(
        10,
      )
    }
  }
})

test('hero backdrop: never widens the page, at any width', async ({ page }) => {
  // A full-bleed decorative layer is exactly the kind of thing that quietly
  // adds a horizontal scrollbar. 320 is included because it is the narrowest
  // width the product supports and the one where it would show first.
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 })
    await page.goto('/welcome')
    await scrollThrough(page)
    await expectNoHorizontalOverflow(page, width)
  }
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
  await expect(hero.getByText('What fits today')).toBeVisible()
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

  /*
   * `offsetHeight`, not `getBoundingClientRect().height`, and the difference is
   * the whole point of this test. The opening act scatters the rows with a
   * `transform`, and a transform changes the bounding RECT while leaving the
   * LAYOUT box untouched. Measuring the rect would report the scale as a height
   * change and fail on the very mechanism that guarantees there is no reflow.
   * `offsetHeight` ignores transforms, so it answers the question actually
   * being asked: did anything move the layout?
   */
  const measure = async () => ({
    card: await card.evaluate((el) => (el as HTMLElement).offsetHeight),
    rows: await rows.evaluateAll((els) => els.map((el) => (el as HTMLElement).offsetHeight)),
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
