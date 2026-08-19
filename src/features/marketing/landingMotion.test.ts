import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath, URL } from 'node:url'

/**
 * THE HERO'S MOTION SYSTEM, PINNED.
 *
 * These are source-level assertions rather than a rendered-DOM test, and that
 * is deliberate: what can actually regress here is not "does a div appear" but
 * the handful of CSS rules that keep the funnel cheap and accessible. jsdom has
 * no compositor, no layout and no `prefers-reduced-motion`, so it cannot answer
 * a single one of the questions below. The rendered behaviour is covered where
 * a real engine exists — `e2e/landing.spec.ts` (Playwright) drives an actual
 * browser at real viewports.
 *
 * -- THE BACKGROUND IS STRUCTURE NOW, AND THAT IS WHAT IS PINNED ------------
 *
 * This file used to pin an aurora of drifting blurred blobs and a "vortex" of
 * orbiting motes: roughly twenty rules about keeping animated decoration cheap.
 * Both layers are deleted. A pixel audit of the rendered page found the aurora
 * varied the background by delta-L* 3.34 across the whole hero (a WCAG ratio of
 * 1.083:1, below the level at which an edge is perceptible at all) while the
 * grain tile on top of it contributed per-pixel noise worth 30 to 50 percent of
 * that signal: colour with no form, which is the definition of a stain. The
 * vortex occupied 8.1% of the desktop first screen, returned 2.4% of the
 * headline's visual weight, and on a 390px phone rendered ZERO visible pixels
 * because its stage sat 37px below the fold.
 *
 * The rules below pin the opposite property: that the background is STATIC and
 * that the page's contrast lives in its MATERIALS rather than in an effect. A
 * motion rule cannot regress on a layer that does not move, so what is worth
 * defending is that nobody quietly adds one back.
 */

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')

const css = read('../../index.css')
const backdrop = read('./components/HeroBackdrop.tsx')
const landing = read('./LandingPage.tsx')
const section = read('./components/Section.tsx')

/**
 * Source with comments removed.
 *
 * Needed because this repo explains itself in long prose comments, and those
 * comments NAME the things the assertions below forbid ("a fixed table, never
 * `Math.random()`"). Matching the raw file would fail on the documentation of
 * the very rule being enforced.
 */
const stripComments = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

const backdropCode = stripComments(backdrop)

/** The block of CSS between a selector and its closing brace. */
function ruleBody(source: string, selector: string): string {
  const at = source.indexOf(selector)
  expect(at, `selector ${selector} must exist in index.css`).toBeGreaterThan(-1)
  const open = source.indexOf('{', at)
  let depth = 0
  for (let i = open; i < source.length; i++) {
    if (source[i] === '{') depth++
    else if (source[i] === '}') {
      depth--
      if (depth === 0) return source.slice(open + 1, i)
    }
  }
  throw new Error(`unterminated rule for ${selector}`)
}

describe('the hero backdrop is structure, and it holds still', () => {
  const LAYERS = ['.hero-backdrop__lattice', '.hero-backdrop__spot', '.hero-backdrop__horizon']

  it('animates nothing at all', () => {
    /*
     * THE RULE THAT REPLACED TWENTY RULES.
     *
     * The cheapest animated layer is the one that is not there. Motion in the
     * background also competes with motion in the product story, and the story
     * is the thing a visitor has to read, so this is a hierarchy decision
     * before it is a performance one.
     */
    for (const selector of [...LAYERS, '.hero-backdrop {']) {
      const body = ruleBody(css, selector)
      expect(body, `${selector} must not animate`).not.toMatch(/animation/)
      expect(body, `${selector} must not transition`).not.toMatch(/transition/)
    }
  })

  it('never blurs anything, moving or not', () => {
    /*
     * Blur was already banned on MOVING layers for a measured reason: it took
     * the landing from 60fps to 21. The ban is now total. A survey of nine
     * production dark landing pages found none shipping a blur radius over
     * 36px, and softness here comes from gradient alpha falloff, which costs
     * one rasterisation ever.
     */
    for (const selector of [...LAYERS, '.hero-backdrop {']) {
      expect(ruleBody(css, selector)).not.toMatch(/filter:\s*blur/)
    }
  })

  it('is inert to assistive tech and to the pointer', () => {
    expect(backdrop).toMatch(/aria-hidden/)
    expect(ruleBody(css, '.hero-backdrop {')).toMatch(/pointer-events:\s*none/)
  })

  it('is pure markup: no state, no listener, no frame loop', () => {
    for (const banned of ['useState', 'useEffect', 'requestAnimationFrame', 'addEventListener']) {
      expect(backdropCode, `the backdrop must not use ${banned}`).not.toContain(banned)
    }
  })

  it('keeps the light inside the hero rather than washing the page', () => {
    // Absolute inside the hero section, never fixed. The aurora it replaces was
    // fixed to the viewport and bled through every section on the page.
    expect(ruleBody(css, '.hero-backdrop {')).toMatch(/position:\s*absolute/)
    expect(ruleBody(css, '.hero-backdrop {')).not.toMatch(/position:\s*fixed/)
  })

  it('puts the spotlight peak OUTSIDE the frame, so the light has no edge', () => {
    /*
     * Anchored at `50% 0%` the brightest point landed exactly on the hero's top
     * edge: measured L* 3.71 at y=60 and L* 15.77 at y=66. Six pixels, seventeen
     * points of lightness, straight across the full width, so it read as a lit
     * bar welded to the navigation. Every origin must sit above the box.
     */
    const spot = ruleBody(css, '.hero-backdrop__spot')
    const origins = [...spot.matchAll(/at\s+[\d.]+%\s+(-?[\d.]+)%/g)].map((m) => Number(m[1]))
    expect(origins.length, 'the spotlight declares radial origins').toBeGreaterThan(0)
    for (const y of origins) {
      expect(y, `a spotlight origin at ${y}% sits inside the frame`).toBeLessThan(0)
    }
  })

  it('lets the light pass behind the header instead of starting under it', () => {
    /*
     * The header is `sticky` and IN FLOW, so without this lift the hero's box
     * begins below it and `overflow-hidden` clips the light to a hard line at
     * the navigation's lower edge.
     *
     * The lift must EQUAL the header's full box - `h-16` plus the 1px
     * transparent border it carries at rest to avoid a shift on scroll - and
     * the padding must give the same amount back, or the composition moves.
     */
    const lift = landing.match(/-mt-\[(\d+)px\]/)
    const pad = landing.match(/\spt-\[(\d+)px\]/)
    expect(lift, 'the hero must lift its box behind the header').not.toBeNull()
    expect(pad, 'the hero must give the lifted space back as padding').not.toBeNull()
    expect(Number(pad?.[1])).toBe(Number(lift?.[1]))
    expect(Number(lift?.[1]), 'the lift must cover the header box, 64px + its 1px border').toBe(65)
  })
})

describe('the page separates its sections with material, not with atmosphere', () => {
  it('spends the loud tonal step on exactly ONE boundary', () => {
    /*
     * THE MEASURED CORE DEFECT AND THE MEASURED OVERCORRECTION, BOTH PINNED.
     *
     * The defect: `panel` was `bg-surface` (#0F172A, L* 7.96) on a `#0A0D16`
     * page (L* 3.66), a step of delta-L* 4.30 or 1.09:1. An audit of the
     * rendered first screen found 92.2% of it inside a six-L* band out of a
     * hundred and concluded the page read as one long dark wash.
     *
     * The overcorrection: moving `panel` itself to `bg-surface-2` lifted every
     * panel section at once, and a visual review rejected it while every number
     * said it had improved. It left the cards inside those sections 8.4 and
     * 12.7 L* BELOW their own ground so they stopped reading as cards; it
     * covered 2.6 to 3.3 times the hero panel's area in the hero panel's own
     * fill, so the product's signature surface stopped meaning anything; and it
     * gave the page a rhythm it abandoned after two beats.
     *
     * So `chapter` exists and is used ONCE, on the boundary directly under the
     * fold, which is the one that was actually complained about. This test
     * fails if a second section reaches for it.
     */
    expect(section, 'the loud step must exist as its own material').toMatch(
      /chapter: 'bg-surface-2/,
    )
    expect(section, 'panel must go back to being the quiet surface').toMatch(
      /panel: 'bg-surface',/,
    )

    const chapters = landing.match(/material="chapter"/g) ?? []
    expect(
      chapters.length,
      `the loud step is used ${chapters.length} times; it is only legible as an event while it is rare`,
    ).toBe(1)
  })

  it('never leaves a card darker than the material it sits on', () => {
    /*
     * The failure this exists to prevent is not hypothetical: it shipped. The
     * three cards in the chapter section stayed at `bg-surface` when the
     * section moved to `bg-surface-2`, which put them 8.4 L* below their own
     * ground. A review of the rendered page reported the row as "a hole with
     * dividers in it" rather than as three cards.
     */
    const differentiators = read('./components/Differentiators.tsx')
    expect(
      differentiators,
      'a card on the chapter material must be lifted above it, never left at panel value',
    ).not.toMatch(/<li[^>]*className="bg-surface /)
  })

  it('never re-introduces a full-page atmospheric wash', () => {
    /*
     * The aurora was fixed behind every section at once, which is what made
     * five different materials read as one.
     *
     * The markup check runs on COMMENT-STRIPPED source, because this page
     * explains at length why both layers were removed and naming a thing in a
     * comment is not mounting it.
     */
    const mounted = stripComments(landing)
    for (const [css_class, component] of [
      ['.living-bg', 'LivingBackground'],
      ['.vortex', 'VortexField'],
    ]) {
      expect(css, `${css_class} was deleted deliberately`).not.toContain(css_class)
      expect(mounted, `${component} must not be re-mounted`).not.toContain(component)
    }
  })

  it('does not fade the hero back to page-dark right at the boundary', () => {
    /*
     * `.hero-settle::after` faded the hero's final 160px to #0A0D16 to keep the
     * step uniform while the aurora drifted underneath it. It worked, in the
     * sense that it made the step uniformly invisible: it was deleting the only
     * contrast the boundary had. With a real material step there is nothing
     * left for it to hide.
     */
    expect(css).not.toContain('hero-settle')
  })
})

describe('reduced motion removes the motion, not the design', () => {
  it('collapses the hero stagger DELAY, not just its duration', () => {
    /*
     * The global prefers-reduced-motion rule sets animation-duration to
     * 0.01ms but says nothing about delay. Left alone, a 520ms delay with
     * `fill-mode: both` holds the element at `from` — opacity 0 — for half a
     * second: a flash of MISSING content, which is worse than the animation it
     * was meant to remove. The scoped override is what prevents that.
     */
    const heroRise = css.slice(css.indexOf('.hero-rise {'))
    const block = heroRise.slice(0, heroRise.indexOf('/* ====='))
    expect(block).toMatch(/@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.hero-rise\s*\{[\s\S]*?animation:\s*none/)
    expect(block).toMatch(/@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.hero-rise\s*\{[\s\S]*?opacity:\s*1/)
  })

  it('holds the hero stagger hidden during its delay in the normal case', () => {
    // `both` is load-bearing: without it a delayed element paints at full
    // opacity first and then snaps to hidden when its animation starts.
    expect(ruleBody(css, '.hero-rise {')).toMatch(/animation:[^;]*\bboth\b/)
  })

  it('shows the section thread at full length with no transition', () => {
    const thread = css.slice(css.indexOf('.section-thread {'))
    const block = thread.slice(0, thread.indexOf('/* ====='))
    expect(block).toMatch(/@media \(prefers-reduced-motion: reduce\)[\s\S]*?transform:\s*scaleY\(1\)/)
  })
})

describe('the hero keeps its semantics while it animates', () => {
  it('still has exactly one h1, and it still reads as two lines', () => {
    /*
     * The headline changed in Homepage V2, from "Plan a realistic day. / Not a
     * wish-list." to the line below. Both halves are pinned for the same reason
     * as before: each is its own animated span, and a refactor that merges them
     * into one node silently drops a beat from the stagger while rendering
     * identically at rest.
     */
    const h1Open = (landing.match(/<h1\b/g) ?? []).length
    expect(h1Open).toBe(1)
    expect(landing).toMatch(/Your list is infinite\./)
    expect(landing).toMatch(/Your day is not\./)
  })

  /*
   * THE HERO IS A COMPLETION STORY NOW, AND THESE ARE ITS RULES.
   *
   * This slot has held two different rules, and the history is worth keeping.
   * It first pinned a five-element entrance stagger. That was replaced by
   * "nothing in the hero animates at all", because the version before it opened
   * with an EMPTY capacity meter that filled over four seconds, so anybody who
   * scrolled in the first two saw a product with nothing in it.
   *
   * The static version fixed that and introduced a different problem the owner
   * caught on the live site: the card showed "92% planned" and stopped there,
   * so the hero's final state was an amber "nearly full" warning. The number it
   * tracked could only ever approach full, which is not an ending.
   *
   * The hero now plays a day being FINISHED. That is motion again, so the rule
   * that made the static version safe has to be re-stated in a form that
   * survives: the meaningful state must be reachable without waiting, the
   * sequence must end, and it must end on the payoff rather than resetting.
   */
  it('shows the FINISHED day under reduced motion, never a frozen storm', () => {
    const shot = stripComments(read('./components/ProductShot.tsx'))
    /*
     * Both pieces of state open at their finished values when motion is
     * reduced: the act is `done` (so the storm never happens and no scatter
     * transform is applied) and every task is complete. A frozen tornado would
     * explain nothing; the composed, finished plan is the state that actually
     * describes the product.
     */
    expect(shot).toMatch(/useState<Act>\(reduced \? 'done' : 'storm'\)/)
    expect(shot).toMatch(/useState\(reduced \? total : 0\)/)
    expect(shot).toMatch(/if \(reduced\) \{[\s\S]{0,120}setAct\('done'\)[\s\S]{0,60}setDone\(total\)/)
  })

  it('runs the completion sequence ONCE and rests on the finished state', () => {
    const shot = stripComments(read('./components/ProductShot.tsx'))
    // The interval clears itself at the end of the day and settles the act.
    expect(shot).toMatch(/if \(step >= total\) \{[\s\S]{0,120}clearInterval\(interval\)/)
    expect(shot).toMatch(/setAct\('done'\)/)
    /*
     * And nothing restarts it. Counting the timers is the precise way to say
     * that: ONE lead delay before the first completion and ONE interval driving
     * the rest. A replay would need a second timer or a wrap, and both are
     * excluded. (An earlier version of this assertion searched for `setDone(0)`
     * near a `setTimeout` and failed on the component's own STARTING state,
     * which is exactly that pair.)
     */
    expect(shot.match(/window\.setInterval\(/g) ?? []).toHaveLength(1)
    // Two timeouts, and only two: one to settle the storm, one to start the
    // work. A replay would need a third, or a wrap; both are excluded.
    expect(shot.match(/window\.setTimeout\(/g) ?? []).toHaveLength(2)
    expect(shot).not.toMatch(/%\s*total/)
    // Every timer is torn down on unmount, so a navigation mid-storm cannot
    // leave one running. They are collected in one array and cleared together,
    // which is what stops a new act's timer being the one that gets forgotten.
    expect(shot).toMatch(/timers\.forEach\(\(t\) => window\.clearTimeout\(t\)\)/)
  })

  it('ends at exactly 100 percent, not at a rounded 99', () => {
    // The progress maths is pure and unit-tested next door; this pins the one
    // property the hero's whole payoff depends on.
    const day = stripComments(read('./demo/heroDay.ts'))
    expect(day).toMatch(/if \(clamped === HERO_DAY\.length\) return 100/)
  })

  it('never animates a layout property, so a completing task cannot reflow the card', () => {
    const shot = stripComments(read('./components/ProductShot.tsx'))
    // Rows are a fixed height and the duration cell a fixed width.
    expect(shot).toMatch(/h-9/)
    expect(shot).toMatch(/w-\[52px\]/)
    // Transitions are colours and the bar's width only.
    const transitions = shot.match(/transition-\[[^\]]+\]|transition-colors/g) ?? []
    expect(transitions.length).toBeGreaterThan(0)
    for (const t of transitions) {
      expect(t, `"${t}" animates something other than colour or the bar width`).toMatch(
        /transition-colors|transition-\[width,background-color\]/,
      )
    }
  })

  it('keeps both hero CTAs and their destinations', () => {
    /*
     * The secondary CTA points at the FEATURES section, because the question a
     * stranger has after the headline is "what is it", not "what does it cost".
     *
     * A REAL ANCHOR is the part worth pinning: a scroll handler would break
     * keyboard use and stop working without JavaScript, and it is the kind of
     * thing a refactor swaps in without noticing. The anchor must also point at
     * a section that exists on this page.
     */
    expect(landing).toMatch(/onClick=\{startFree\}/)
    expect(landing).toMatch(/href="#how-it-works"/)
    expect(landing).toMatch(/id="how-it-works"/)
  })

  it('renders the backdrop behind the content, never over it', () => {
    /*
     * `indexOf` returns -1 for a missing element, which a naive `toBeLessThan`
     * happily passes. That is exactly how this test stayed green after the
     * vortex stopped being rendered, so presence is asserted first.
     */
    const at = landing.indexOf('<HeroBackdrop />')
    expect(at, 'the hero must render a backdrop').toBeGreaterThan(-1)
    expect(at).toBeLessThan(landing.indexOf('<h1'))
  })
})

describe('the landing adds no new dependency', () => {
  it('imports nothing outside the repo and its existing stack', () => {
    const imports = [...backdrop.matchAll(/from '([^']+)'/g)].map((m) => m[1])
    for (const spec of imports) {
      const ok = spec === 'react' || spec.startsWith('.') || spec.startsWith('@/')
      expect(ok, `unexpected dependency ${spec}`).toBe(true)
    }
  })
})
