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
 * Every rule here was paid for in measured frame time by the living background
 * (see index.css) and re-earned by the vortex. If one of these fails, the
 * landing has probably just lost 30fps on a mid-range phone.
 */

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')

const css = read('../../index.css')
const vortex = read('./components/VortexField.tsx')
const landing = read('./LandingPage.tsx')

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

const vortexCode = stripComments(vortex)

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

describe('vortex field: the rules that keep it cheap', () => {
  it('NEVER blurs a moving layer', () => {
    /*
     * The whole performance story, and it was measured not guessed: blurring
     * the aurora blobs took the landing from 60fps to 21, because a blurred
     * surface is re-rasterised every time it moves. Softness comes from
     * gradient alpha falloff instead.
     */
    for (const selector of ['.vortex__mote', '.vortex__core', '.vortex__ring', '.vortex__orbit']) {
      expect(ruleBody(css, selector)).not.toMatch(/filter:\s*blur/)
    }
  })

  it('animates ONLY transform and opacity', () => {
    // Anything else (width, top, box-shadow, background-position) would drag
    // layout or paint onto the main thread every frame.
    const animated = ['vortex-spin', 'vortex-core', 'hero-rise']
    for (const name of animated) {
      const body = ruleBody(css, `@keyframes ${name}`)
      const props = [...body.matchAll(/^\s*([a-z-]+)\s*:/gm)].map((m) => m[1])
      expect(props.length, `${name} declares properties`).toBeGreaterThan(0)
      for (const prop of props) {
        expect(['transform', 'opacity']).toContain(prop)
      }
    }
  })

  it('never scales, because scaling re-rasterises a gradient every frame', () => {
    for (const name of ['vortex-spin', 'vortex-core']) {
      expect(ruleBody(css, `@keyframes ${name}`)).not.toMatch(/scale\s*\(/)
    }
  })

  it('contains its paint so a ring can never widen the document', () => {
    // This is what keeps 320px free of horizontal scroll.
    expect(ruleBody(css, '.vortex {')).toMatch(/contain:\s*layout paint/)
    expect(ruleBody(css, '.vortex {')).toMatch(/overflow:\s*hidden/)
  })

  it('is inert to assistive tech and to the pointer', () => {
    expect(vortex).toMatch(/aria-hidden/)
    expect(ruleBody(css, '.vortex {')).toMatch(/pointer-events:\s*none/)
  })

  it('parks every animation when the tab is hidden', () => {
    expect(vortex).toMatch(/visibilitychange/)
    expect(css).toMatch(/\.vortex\[data-paused='true'\][\s\S]{0,120}animation-play-state:\s*paused/)
  })

  it('coalesces pointer work into at most one rAF and removes its listener', () => {
    expect(vortex).toMatch(/requestAnimationFrame/)
    expect(vortex).toMatch(/cancelAnimationFrame/)
    expect(vortex).toMatch(/removeEventListener\('pointermove'/)
    // Passive, so a move can never block scrolling.
    expect(vortex).toMatch(/'pointermove',\s*onMove,\s*\{\s*passive:\s*true\s*\}/)
  })

  it('never re-renders React per pointer frame', () => {
    // A useState write per pointermove is exactly the main-thread cost this
    // design exists to avoid; the frame handler must only touch style.
    expect(vortexCode).not.toMatch(/useState/)
    expect(vortexCode).toMatch(/style\.setProperty/)
  })

  it('uses a fixed table rather than Math.random, so screenshots stay comparable', () => {
    expect(vortexCode).not.toMatch(/Math\.random/)
  })
})

describe('reduced motion removes the motion, not the design', () => {
  it('stops the funnel and the pointer parallax without deleting them', () => {
    const reduced = css.slice(css.indexOf('.vortex {'))
    const block = reduced.slice(0, reduced.indexOf('/* ====='))
    expect(block).toMatch(/@media \(prefers-reduced-motion: reduce\)/)
    // The rings/core/motes are still rendered: nothing sets display:none.
    expect(block).not.toMatch(/\.vortex[^{]*\{[^}]*display:\s*none/)
    expect(block).toMatch(/\.vortex__orbit,\s*\n?\s*\.vortex__core\s*\{\s*animation:\s*none/)
  })

  it('never attaches the pointer listener under reduced motion', () => {
    // Not merely "the transform is zeroed" — the listener is never added, so a
    // reduced-motion user pays nothing at all for an effect they cannot see.
    expect(vortex).toMatch(/if\s*\(!el \|\| reduced\)\s*return/)
  })

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
   * THE HERO NO LONGER STAGGERS ITSELF IN, AND THAT IS THE POINT.
   *
   * This used to assert five or more `--rise-delay` values under 600ms, which
   * was the right rule for a hero whose content arrived in sequence. The hero
   * is now complete at first paint: the headline, the paragraph, both calls to
   * action and a finished product composition are all there on the first frame.
   *
   * What replaced the stagger rule is the rule that made the stagger
   * unnecessary. The hero visual must be STATIC: no timer, no interval, no
   * animation frame, no state. The page it replaced opened with an EMPTY
   * capacity meter that filled itself over about four seconds, so a visitor who
   * scrolled within two seconds saw a product with nothing in it. A finished
   * state explains the product to everybody; motion only explains it to people
   * who wait.
   */
  it('renders a hero visual that is finished on the first frame', () => {
    const shot = stripComments(read('./components/ProductShot.tsx'))
    for (const banned of ['useState', 'useEffect', 'setInterval', 'setTimeout', 'requestAnimationFrame']) {
      expect(shot, `the hero composition must not ${banned}`).not.toMatch(new RegExp(banned))
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
    expect(landing).toMatch(/href="#features"/)
    expect(landing).toMatch(/id="features"/)
  })

  it('renders the funnel behind the content, never over it', () => {
    // The vortex is emitted before <main z-10>, and main carries the stacking.
    expect(landing.indexOf('<VortexField />')).toBeLessThan(landing.indexOf('<h1'))
  })
})

describe('the landing adds no new dependency', () => {
  it('imports nothing outside the repo and its existing stack', () => {
    const imports = [...vortex.matchAll(/from '([^']+)'/g)].map((m) => m[1])
    for (const spec of imports) {
      const ok = spec === 'react' || spec.startsWith('.') || spec.startsWith('@/')
      expect(ok, `unexpected dependency ${spec}`).toBe(true)
    }
  })
})
