import { describe, expect, it } from 'vitest'
import {
  ALL_FEATURES,
  ALL_LIMITS,
  canCreate,
  canUseFeature,
  ENTITLEMENTS,
  featureAccess,
  getLimit,
  isGrandfathered,
  isUnlimited,
  limitDecision,
  shouldShowUpsell,
  UNLIMITED,
  type EntitlementStatus,
  type Feature,
  type LimitKey,
  type PlanTier,
} from './entitlements'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  THE ENTITLEMENT CONTRACT, ASSERTED.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ── WHAT THIS FILE IS FOR ──────────────────────────────────────────────────
 *
 * A product audit found the commercial rules spread across five places that
 * nothing connected, and they had drifted: the public pricing page claimed
 * features no gate produced, two Pro bullets mapped to nothing in code at all,
 * and a Free limit silently capped a counter that no copy anywhere mentioned.
 *
 * The rules are now one table. This file is the machine-readable statement of
 * what that table says, so that marketing, the UI and the server cannot drift
 * apart again without a red test. If a tier changes, this file changes with it
 * IN THE SAME COMMIT, and the diff is the review.
 *
 * ── THE FOUR THINGS IT PINS ────────────────────────────────────────────────
 *
 *   1. the matrix itself, feature by feature and limit by limit
 *   2. the three-state invariants (ported from the old `gate.test.ts`)
 *   3. grandfathering, which is what makes a packaging change safe for data
 *   4. the safety property that no Free number was LOWERED
 */

const TIERS: PlanTier[] = ['free', 'pro']
const STATUSES: EntitlementStatus[] = ['resolving', 'resolved']

/* ═══════════════════════════════════════════════════════════════════════════
 *  1. THE MATRIX
 * ═══════════════════════════════════════════════════════════════════════════ */

describe('the entitlement matrix', () => {
  /**
   * THE SNAPSHOT. Read this as the answer to "what does Pro buy?".
   *
   * Written out longhand rather than derived from ENTITLEMENTS, because a test
   * that computes its expectation from the thing under test asserts nothing.
   * Changing the product means changing both, deliberately, side by side.
   */
  const EXPECTED: Record<Feature, { free: boolean; pro: boolean }> = {
    'week.board': { free: false, pro: true },
    'week.autoPlan': { free: false, pro: true },
    'insights.dashboard': { free: false, pro: true },
    'insights.estimateAccuracy': { free: false, pro: true },
    'insights.weeklyReview': { free: false, pro: true },
    'insights.pointsBreakdown': { free: false, pro: true },
    'history.unlimited': { free: false, pro: true },
    'calendar.liveSync': { free: false, pro: true },
    'journal.voiceNotes': { free: false, pro: true },
    'digest.preplannedDay': { free: false, pro: true },
  }

  it.each(ALL_FEATURES)('%s matches the declared contract', (feature) => {
    expect(canUseFeature('free', feature)).toBe(EXPECTED[feature].free)
    expect(canUseFeature('pro', feature)).toBe(EXPECTED[feature].pro)
  })

  it('lists every feature exactly once, with no orphan in either direction', () => {
    expect([...ALL_FEATURES].sort()).toEqual(Object.keys(EXPECTED).sort())
    // Every Pro feature must be a known key: a typo in the tier table would
    // otherwise create a capability nothing can ever ask for.
    for (const f of ENTITLEMENTS.pro.features) expect(ALL_FEATURES).toContain(f)
  })

  it('gives Free no paid feature at all, which is what makes the split legible', () => {
    expect(ENTITLEMENTS.free.features).toEqual([])
  })

  /**
   * THE LIMITS, longhand for the same reason.
   *
   * `calendarSources` is deliberately identical on both tiers: it is an abuse
   * ceiling enforced by a database trigger, not a price lever. A future change
   * that "optimised" it into a Pro upsell would be raising a security cap for
   * money, and this row is here to make that impossible to do quietly.
   */
  const LIMITS: Record<LimitKey, { free: number; pro: number }> = {
    historyDays: { free: 30, pro: UNLIMITED },
    personalTemplates: { free: 5, pro: UNLIMITED },
    visionCards: { free: 5, pro: UNLIMITED },
    mindMaps: { free: 3, pro: UNLIMITED },
    quitHabits: { free: 3, pro: UNLIMITED },
    activeChallenges: { free: 1, pro: UNLIMITED },
    calendarSources: { free: 10, pro: 10 },
  }

  it.each(ALL_LIMITS)('%s matches the declared contract', (key) => {
    expect(getLimit('free', key)).toBe(LIMITS[key].free)
    expect(getLimit('pro', key)).toBe(LIMITS[key].pro)
  })

  it('lists every limit exactly once', () => {
    expect([...ALL_LIMITS].sort()).toEqual(Object.keys(LIMITS).sort())
  })

  it('keeps the calendar-source ceiling identical on both tiers', () => {
    // Security cap, not a commercial one. See the note above.
    expect(getLimit('free', 'calendarSources')).toBe(getLimit('pro', 'calendarSources'))
  })

  it('never caps capture: there is no task or project limit to find', () => {
    /*
     * The single most tempting lever in this category, and the one this product
     * refuses. Competitors cap projects (5) and boards (10) precisely because it
     * converts, but capping capture punishes the exact behaviour the product
     * exists to encourage, and a planner you cannot put your work into is not a
     * cheaper planner, it is a broken one.
     */
    const keys = ALL_LIMITS.map((k) => k.toLowerCase())
    for (const forbidden of ['task', 'project', 'section', 'subtask']) {
      expect(keys.some((k) => k.includes(forbidden))).toBe(false)
    }
  })
})

/* ═══════════════════════════════════════════════════════════════════════════
 *  2. THREE-STATE INVARIANTS  (ported from the retired gate.test.ts)
 * ═══════════════════════════════════════════════════════════════════════════ */

describe('featureAccess never collapses the unknown state', () => {
  it.each(TIERS)('%s resolves to a real verdict only once settled', (plan) => {
    for (const feature of ALL_FEATURES) {
      expect(featureAccess('resolving', plan, feature)).toBe('resolving')
      expect(featureAccess('resolved', plan, feature)).toBe(
        canUseFeature(plan, feature) ? 'allowed' : 'locked',
      )
    }
  })

  it('NEVER answers `allowed` while resolving, for any tier or feature', () => {
    /*
     * The leak this replaces. Four surfaces wrote `isPro || billingLoading`, so
     * a Free user got the paid layer for the length of every cold load, on
     * Today, which is the app's default screen.
     */
    for (const plan of TIERS) {
      for (const feature of ALL_FEATURES) {
        expect(featureAccess('resolving', plan, feature)).not.toBe('allowed')
      }
    }
  })

  it('NEVER answers `locked` while resolving, so no subscriber sees a paywall', () => {
    // The opposite failure, and just as real: on the capped surfaces a premature
    // `locked` rendered an upsell that WROTE an `upgrade_intents` row, and that
    // table has no delete policy by design.
    for (const plan of TIERS) {
      for (const feature of ALL_FEATURES) {
        expect(featureAccess('resolving', plan, feature)).not.toBe('locked')
      }
    }
  })
})

describe('limitDecision', () => {
  const COUNTED: LimitKey[] = [
    'personalTemplates',
    'visionCards',
    'mindMaps',
    'quitHabits',
    'activeChallenges',
  ]

  /** Every combination of the four inputs that matter. */
  const combos = STATUSES.flatMap((status) =>
    TIERS.flatMap((plan) =>
      [true, false].flatMap((countKnown) =>
        [0, 1, 3, 5, 99].map((count) => ({ status, plan, countKnown, count })),
      ),
    ),
  )

  it('never refuses while either the plan or the count is unknown', () => {
    for (const key of COUNTED) {
      for (const c of combos) {
        const verdict = limitDecision({ ...c, key })
        if (c.status !== 'resolved' || !c.countKnown) {
          expect(verdict, JSON.stringify({ key, ...c })).toBe('resolving')
        }
      }
    }
  })

  it('an `atLimit` verdict IMPLIES both inputs were known, which is the invariant', () => {
    for (const key of COUNTED) {
      for (const c of combos) {
        if (limitDecision({ ...c, key }) === 'atLimit') {
          expect(c.status).toBe('resolved')
          expect(c.countKnown).toBe(true)
        }
      }
    }
  })

  it('never shows an upsell to a Pro user, at any count', () => {
    for (const key of COUNTED) {
      for (const count of [0, 1, 5, 99, 1000]) {
        expect(
          shouldShowUpsell({ status: 'resolved', plan: 'pro', key, count, countKnown: true }),
        ).toBe(false)
      }
    }
  })

  it('never shows an upsell while the plan is still resolving', () => {
    for (const key of COUNTED) {
      expect(
        shouldShowUpsell({ status: 'resolving', plan: 'free', key, count: 999, countKnown: true }),
      ).toBe(false)
    }
  })

  it('never lets a create through while the count is still loading', () => {
    for (const key of COUNTED) {
      expect(
        canCreate({ status: 'resolved', plan: 'free', key, count: 0, countKnown: false }),
      ).toBe(false)
      // Including for Pro: a write from a list that has not arrived is a bug on
      // any plan. This is the shape that once created a SECOND map on a one-map
      // plan, because a tap before the list landed saw `maps.length === 0`.
      expect(canCreate({ status: 'resolved', plan: 'pro', key, count: 0, countKnown: false })).toBe(
        false,
      )
    }
  })

  it('allows Free below the limit and stops it at the limit', () => {
    for (const key of COUNTED) {
      const limit = getLimit('free', key)
      const at = (count: number) =>
        limitDecision({ status: 'resolved', plan: 'free', key, count, countKnown: true })
      expect(at(limit - 1)).toBe('allowed')
      expect(at(limit)).toBe('atLimit')
      expect(at(limit + 1)).toBe('atLimit')
    }
  })

  it('never caps Pro, because every counted limit is unlimited there', () => {
    for (const key of COUNTED) {
      expect(isUnlimited(getLimit('pro', key))).toBe(true)
      expect(
        limitDecision({ status: 'resolved', plan: 'pro', key, count: 10_000, countKnown: true }),
      ).toBe('allowed')
    }
  })

  it('keeps the three helpers agreeing with each other', () => {
    for (const key of COUNTED) {
      for (const c of combos) {
        const input = { ...c, key }
        const verdict = limitDecision(input)
        expect(canCreate(input)).toBe(verdict === 'allowed')
        expect(shouldShowUpsell(input)).toBe(verdict === 'atLimit')
      }
    }
  })
})

/* ═══════════════════════════════════════════════════════════════════════════
 *  3. GRANDFATHERING — the property that makes a packaging change safe
 * ═══════════════════════════════════════════════════════════════════════════ */

describe('an account already over a limit', () => {
  it('is refused a NEW one and keeps everything it has', () => {
    /*
     * The only sanctioned way a limit may act is to refuse the next create.
     * Nothing in this module can delete, hide, archive or downgrade an existing
     * item, and nothing may be added that can: user data is not a monetisation
     * lever. A Free account holding six mind maps against a limit of three keeps
     * all six and simply cannot make a seventh.
     */
    const over = { status: 'resolved', plan: 'free', key: 'mindMaps', count: 6, countKnown: true } as const
    expect(limitDecision(over)).toBe('atLimit')
    expect(canCreate(over)).toBe(false)
    expect(isGrandfathered({ plan: 'free', key: 'mindMaps', count: 6 })).toBe(true)
  })

  it('is recognised as grandfathered only when genuinely over', () => {
    expect(isGrandfathered({ plan: 'free', key: 'mindMaps', count: 3 })).toBe(false)
    expect(isGrandfathered({ plan: 'free', key: 'mindMaps', count: 4 })).toBe(true)
    // Never for Pro: an unlimited ceiling cannot be exceeded.
    expect(isGrandfathered({ plan: 'pro', key: 'mindMaps', count: 10_000 })).toBe(false)
  })

  it('becomes allowed again the moment they upgrade', () => {
    const count = 6
    expect(
      canCreate({ status: 'resolved', plan: 'free', key: 'mindMaps', count, countKnown: true }),
    ).toBe(false)
    expect(
      canCreate({ status: 'resolved', plan: 'pro', key: 'mindMaps', count, countKnown: true }),
    ).toBe(true)
  })
})

/* ═══════════════════════════════════════════════════════════════════════════
 *  4. NO FREE NUMBER WAS EVER LOWERED
 * ═══════════════════════════════════════════════════════════════════════════ */

describe('data safety: the Free tier only ever got more generous', () => {
  /**
   * What Free shipped with before the packaging change, read off the constants
   * that were live on `main` at f92e9e7.
   *
   * This is the property that makes the change safe to deploy without a
   * migration, a backfill or a communication: because every ceiling went UP,
   * no existing account can become newly over-limit, so nobody loses access to
   * anything they already made. If a future change wants to LOWER one of these,
   * this test fails, and it should: that is a decision that needs a plan for the
   * people already above the new line, not a constant edit.
   */
  const SHIPPED_BEFORE: Partial<Record<LimitKey, number>> = {
    historyDays: 14,
    personalTemplates: 3,
    visionCards: 3,
    mindMaps: 1,
    quitHabits: 1,
    activeChallenges: 1,
    calendarSources: 10,
  }

  it.each(Object.entries(SHIPPED_BEFORE))('%s is not lower than it used to be', (key, before) => {
    expect(getLimit('free', key as LimitKey)).toBeGreaterThanOrEqual(before as number)
  })

  it('raised the four that the audit found too tight to be usable', () => {
    // A cap of 1 lets a feature be sampled, never used. That is a demo, not a
    // ladder, and one quit habit is not a product.
    expect(getLimit('free', 'mindMaps')).toBeGreaterThan(1)
    expect(getLimit('free', 'quitHabits')).toBeGreaterThan(1)
    expect(getLimit('free', 'personalTemplates')).toBeGreaterThan(3)
    expect(getLimit('free', 'visionCards')).toBeGreaterThan(3)
  })

  it('gives Free a full month of history, not a fortnight', () => {
    expect(getLimit('free', 'historyDays')).toBe(30)
    // And it stays a VIEW window on both tiers: nothing is ever deleted, so this
    // number can only ever change what is painted, never what exists.
    expect(isUnlimited(getLimit('pro', 'historyDays'))).toBe(true)
  })
})
