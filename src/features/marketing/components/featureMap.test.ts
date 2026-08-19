import { describe, expect, it } from 'vitest'
import { FEATURE_COUNT, PILLARS } from './FeatureMap'

/**
 * THE FEATURE MAP'S ORDER IS A CLAIM, SO IT IS PINNED.
 *
 * An audit of the map counted what a visitor actually meets first and found 26
 * of the 35 items, and the entire desktop first row, were office work before a
 * single habit, journal or breathing item appeared. Every item was true; the
 * ORDER was what made a product for organising a life look like project
 * management software.
 *
 * Nothing in the suite caught that, and nothing would have caught it being
 * undone. Ordering is exactly the kind of thing a later edit changes without
 * noticing, because reordering an array never fails a type check and never
 * looks like a claim.
 */

const LIFE_PILLARS = ['Wellbeing', 'Reflect']

describe('the feature map reads as a life, not an office', () => {
  it('puts a life pillar in the first three columns', () => {
    const firstThree = PILLARS.slice(0, 3).map((p) => p.name)
    expect(
      firstThree.some((name) => LIFE_PILLARS.includes(name)),
      `the first three columns are ${firstThree.join(', ')} with nothing personal among them`,
    ).toBe(true)
  })

  it('leads with planning rather than with folders', () => {
    // "Plan" is the differentiator and its vocabulary is life-neutral.
    // "Organize" is supporting machinery and should not open the map.
    expect(PILLARS[0].name).toBe('Plan')
    expect(PILLARS[0].name).not.toBe('Organize')
  })

  it('never opens a pillar with a paywall', () => {
    /*
     * A Pro badge at position one or two tells a scanner that the whole column
     * is paid. Reflect used to show one at position two, where three of its
     * four items are free.
     */
    for (const pillar of PILLARS) {
      const firstPaidIndex = pillar.items.findIndex((item) => item.pro)
      if (firstPaidIndex === -1) continue
      expect(
        firstPaidIndex,
        `"${pillar.name}" shows a Pro badge at position ${firstPaidIndex + 1}`,
      ).toBeGreaterThan(1)
    }
  })

  it('keeps the breadth it claims', () => {
    expect(PILLARS).toHaveLength(6)
    expect(FEATURE_COUNT).toBeGreaterThanOrEqual(35)
  })

  it('never names a capability the product does not ship', () => {
    /*
     * The owner has asked about budgets, expenses, world clocks and shopping
     * lists. None of them exist, and a task like "Review the budget" in the
     * hero is a thing a user schedules, not a feature. This fails the build if
     * one of them ever becomes a line on the feature map.
     */
    const text = PILLARS.flatMap((p) => p.items.map((i) => i.label))
      .join(' ')
      .toLowerCase()
    for (const claim of [
      'budget',
      'expense',
      'spending',
      'world clock',
      'time zone',
      'shopping list',
      'reminder',
      'push notification',
    ]) {
      expect(text, `"${claim}" is not shipped and must not be listed`).not.toContain(claim)
    }
  })
})
