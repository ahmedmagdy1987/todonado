import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath, URL } from 'node:url'

/**
 * THE ROTATING PHRASE, PINNED TO ITS KEYFRAMES.
 *
 * The animation divides one 10s cycle into equal slots by hand, in CSS
 * percentages, while the number of slots lives in a TypeScript array. Those two
 * facts have to agree and nothing makes them: adding a fifth phrase renders
 * perfectly, type-checks, lints, and quietly puts two phrases on screen at once
 * for a quarter of every cycle. It is a pure content edit that breaks a visual
 * invariant, which is the exact shape of bug a build never catches.
 *
 * Source-level assertions rather than a rendered test, for the same reason
 * `landingMotion.test.ts` is: jsdom has no compositor and no CSS animation, so
 * it cannot answer a single question here. The rendered behaviour is covered by
 * Playwright in `e2e/landing.spec.ts`.
 */

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')

const css = read('../../index.css')
const section = read('./components/IdentitySection.tsx')

/**
 * Source with comments removed.
 *
 * Load-bearing for the forbidden-phrase check below, and the same trick
 * `landingMotion.test.ts` needs for the same reason: this repository explains
 * itself in long prose comments, and the comment above `IdentitySection`
 * NAMES the phrases the test forbids in order to explain why they are
 * forbidden. Matching the raw file fails on the documentation of the very rule
 * being enforced.
 */
const sectionCode = section.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

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

/** The phrases the heading rotates through, read out of the component. */
function behaviours(): string[] {
  const block = section.slice(section.indexOf('const BEHAVIOURS'))
  const arr = block.slice(0, block.indexOf('] as const'))
  return [...arr.matchAll(/'([^']+)'/g)].map((m) => m[1])
}

describe('the identity heading rotates honestly', () => {
  it('divides the cycle into exactly as many slots as it has phrases', () => {
    const count = behaviours().length
    expect(count).toBeGreaterThanOrEqual(3)

    // The keyframe hands each phrase a slot of 100/count percent. Read the
    // stop where a phrase begins to leave and require it to match.
    const frames = ruleBody(css, '@keyframes identity-cycle')
    const stops = [...frames.matchAll(/(\d+(?:\.\d+)?)%/g)].map((m) => Number(m[1]))
    const slot = 100 / count
    expect(
      stops,
      `with ${count} phrases each slot is ${slot}%, so the keyframe must hand over there`,
    ).toContain(slot)
  })

  it('holds each phrase long enough to read it', () => {
    // The visible window is [enter, exit]. Below about 1.5s a reader is being
    // shown a phrase they cannot finish, which is a worse experience than no
    // rotation at all.
    const frames = ruleBody(css, '@keyframes identity-cycle')
    const stops = [...frames.matchAll(/(\d+(?:\.\d+)?)%/g)].map((m) => Number(m[1]))
    const durationMatch = ruleBody(css, '.identity-cycle__word').match(
      /animation:[^;]*?(\d+(?:\.\d+)?)s/,
    )
    expect(durationMatch, 'the cycle must declare a duration').not.toBeNull()
    const cycleSeconds = Number(durationMatch?.[1])

    const enter = stops[1]
    const exit = stops[2]
    const visibleSeconds = ((exit - enter) / 100) * cycleSeconds
    expect(visibleSeconds).toBeGreaterThan(1.5)
    // And not so long that it reads as broken rather than rotating.
    expect(visibleSeconds).toBeLessThan(5)
  })

  it('never leaves the heading with no phrase at all', () => {
    /*
     * THE BUG THIS EXISTS TO CATCH, WHICH SHIPPED IN THE FIRST DRAFT.
     *
     * A phrase faded out at 22% while its successor did not begin until 25%,
     * so for 3% of every cycle — 0.6s out of every 2.5s, about a quarter of
     * the time — the heading read "Become the person who" and then stopped.
     * It rendered perfectly, typechecked, and passed every other assertion in
     * this file. A screenshot found it.
     *
     * The invariant: a phrase must still be fading out AFTER its successor has
     * started fading in, so the two overlap and the line is never empty.
     */
    const count = behaviours().length
    const slot = 100 / count
    const frames = ruleBody(css, '@keyframes identity-cycle')
    const stops = [...frames.matchAll(/(\d+(?:\.\d+)?)%/g)].map((m) => Number(m[1]))

    const holdsUntil = stops[2] // still fully opaque at this point
    const goneBy = stops[3] // fully transparent from here

    expect(holdsUntil, 'a phrase must stay opaque until its successor starts').toBeGreaterThanOrEqual(
      slot,
    )
    expect(goneBy, 'and must still be fading while the successor fades in').toBeGreaterThan(slot)
  })

  it('never moves the copy beneath it', () => {
    // A fixed height on the container is the entire reason this effect is
    // acceptable. Without it every phrase change reflows the section.
    const body = ruleBody(css, '.identity-cycle {')
    expect(body).toMatch(/height:\s*[\d.]+em/)
    expect(body).toMatch(/position:\s*relative/)
    expect(ruleBody(css, '.identity-cycle__word')).toMatch(/position:\s*absolute/)
  })

  it('animates only transform and opacity', () => {
    const body = ruleBody(css, '@keyframes identity-cycle')
    const props = [...body.matchAll(/^\s*([a-z-]+)\s*:/gm)].map((m) => m[1])
    expect(props.length).toBeGreaterThan(0)
    for (const prop of props) expect(['transform', 'opacity']).toContain(prop)
  })

  it('keeps every phrase in the DOM under reduced motion', () => {
    /*
     * The fallback renders the SAME array, joined, rather than showing the
     * first phrase and dropping three. Somebody who asked for less movement
     * should not also be given less content.
     */
    expect(section).toMatch(/BEHAVIOURS\.join/)
    expect(section).toMatch(/usePrefersReducedMotion/)
  })

  it('promises only what the software records', () => {
    /*
     * The guard rail for this section, enforced rather than remembered. Every
     * phrase below is an outcome Todonado cannot produce, and one of them in a
     * heading would change what kind of page this is.
     */
    const forbidden = [
      'top 1%',
      'top 1 percent',
      'change your life',
      '10x',
      'guaranteed',
      'transform your life',
      'unlock your potential',
    ]
    const lower = sectionCode.toLowerCase()
    for (const phrase of forbidden) {
      expect(lower, `the identity section must never promise "${phrase}"`).not.toContain(phrase)
    }
  })
})
