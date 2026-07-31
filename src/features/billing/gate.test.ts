import { describe, expect, it } from 'vitest'
import { canCreate, capDecision, shouldShowUpsell, type CapInput } from './gate'

/**
 * The load-order rule, proved by ENUMERATION rather than by reading source.
 *
 * This bug class has now shipped three times — `checkIn` before its habit
 * existed, `MindMapsPage`/`VisionPage` creating past a cap because the count
 * had not arrived, and six surfaces refusing a paying subscriber because the
 * PLAN had not arrived. Every one of them was invisible to typecheck, lint and
 * the suite, because "not loaded yet" and "loaded, and the answer is no" are
 * both `false`.
 *
 * A grep-shaped test cannot catch this: the defect is not a missing token, it
 * is a missing DISTINCTION. So the whole decision lives in one pure function
 * and the test walks every combination of its inputs, asserting the property
 * that matters — a refusal requires knowledge.
 */

const ALL_BOOLS = [false, true]
/** Around a limit of 2: empty, under, exactly at, and over. */
const COUNTS = [0, 1, 2, 3]
const LIMIT = 2

function everyInput(): CapInput[] {
  const out: CapInput[] = []
  for (const planKnown of ALL_BOOLS)
    for (const countKnown of ALL_BOOLS)
      for (const isPro of ALL_BOOLS)
        for (const count of COUNTS) out.push({ planKnown, countKnown, isPro, count, limit: LIMIT })
  return out
}

describe('a cap has three answers, and `unknown` is not a soft `capped`', () => {
  it('covers every combination of its inputs', () => {
    expect(everyInput()).toHaveLength(2 * 2 * 2 * 4)
  })

  it('NEVER refuses while either the plan or the count is unknown', () => {
    const wrong = everyInput()
      .filter((i) => !i.planKnown || !i.countKnown)
      .filter((i) => capDecision(i) !== 'unknown')
    expect(
      wrong,
      'these refuse (or allow) on information that has not arrived:\n' + JSON.stringify(wrong),
    ).toEqual([])
  })

  it('a `capped` verdict IMPLIES both inputs were known — the whole invariant', () => {
    for (const input of everyInput()) {
      if (capDecision(input) === 'capped') {
        expect(input.planKnown, JSON.stringify(input)).toBe(true)
        expect(input.countKnown, JSON.stringify(input)).toBe(true)
      }
    }
  })

  it('NEVER shows an upsell — and so never writes an undeletable intent row — to a Pro user', () => {
    const shown = everyInput().filter((i) => i.isPro && shouldShowUpsell(i))
    expect(shown, 'an upsell was offered to a subscriber:\n' + JSON.stringify(shown)).toEqual([])
  })

  it('NEVER shows an upsell while the plan is still loading', () => {
    // THE EXACT REGRESSION: a paying subscriber at the Free limit, mid-round-trip.
    // `isPro` is false here because usePlan fails closed — that is the trap.
    const midFlight: CapInput = {
      planKnown: false,
      countKnown: true,
      isPro: false,
      count: 5,
      limit: LIMIT,
    }
    expect(capDecision(midFlight)).toBe('unknown')
    expect(shouldShowUpsell(midFlight)).toBe(false)
    expect(canCreate(midFlight)).toBe(false)
  })

  it('NEVER lets a create through while the count is still loading', () => {
    // The mirror-image failure, which is how a one-map plan got a second map.
    const midFlight: CapInput = {
      planKnown: true,
      countKnown: false,
      isPro: false,
      count: 0,
      limit: LIMIT,
    }
    expect(capDecision(midFlight)).toBe('unknown')
    expect(canCreate(midFlight)).toBe(false)
  })
})

describe('once both are known it decides normally', () => {
  const known = (over: Partial<CapInput>): CapInput => ({
    planKnown: true,
    countKnown: true,
    isPro: false,
    count: 0,
    limit: LIMIT,
    ...over,
  })

  it('Pro is never capped, at any count', () => {
    for (const count of [0, 2, 99]) {
      expect(capDecision(known({ isPro: true, count }))).toBe('allowed')
    }
  })

  it('Free is allowed below the limit and capped at or above it', () => {
    expect(capDecision(known({ count: 0 }))).toBe('allowed')
    expect(capDecision(known({ count: 1 }))).toBe('allowed')
    expect(capDecision(known({ count: 2 }))).toBe('capped')
    expect(capDecision(known({ count: 3 }))).toBe('capped')
  })

  it('a limit of one — the shape of quit habits, mind maps and challenges', () => {
    expect(capDecision(known({ count: 0, limit: 1 }))).toBe('allowed')
    expect(capDecision(known({ count: 1, limit: 1 }))).toBe('capped')
  })

  it('the three helpers agree with each other', () => {
    for (const input of everyInput()) {
      const decision = capDecision(input)
      expect(canCreate(input)).toBe(decision === 'allowed')
      expect(shouldShowUpsell(input)).toBe(decision === 'capped')
      // The two can never both be true, and both false means `unknown`.
      expect(canCreate(input) && shouldShowUpsell(input)).toBe(false)
    }
  })
})
