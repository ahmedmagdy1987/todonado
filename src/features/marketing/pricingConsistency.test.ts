import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath, URL } from 'node:url'
import {
  PRO_MONTHLY_TWELVE_USD,
  PRO_MONTHLY_USD,
  PRO_PRICE_COPY,
  PRO_YEARLY,
  PRO_YEARLY_PER_MONTH_USD,
  PRO_YEARLY_SAVING_PERCENT,
  PRO_YEARLY_SAVING_USD,
  PRO_YEARLY_USD,
  usd,
} from './pricing'
import { PLANS } from './plans'
import { priceIdFor } from '@/features/billing/stripeConfig'

/**
 * PRICING SAYS WHAT STRIPE CHARGES.
 *
 * The public pricing page displayed "$6 /mo · per month, billed yearly" while
 * Stripe was configured and live-tested at $5/month and $48/year. Nothing
 * connected the two: plans.ts carried a pricing HYPOTHESIS written before
 * Stripe existed, and no test compared a rendered price with anything.
 *
 * These tests are the connection. They are deliberately narrow — they assert
 * the Pro plan's amounts and the copy that surrounds them, and nothing about
 * unrelated numbers elsewhere in the app.
 */

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')

const PRO = PLANS.find((p) => p.id === 'pro')!
const FREE = PLANS.find((p) => p.id === 'free')!
const TEAM = PLANS.find((p) => p.id === 'team')!

describe('the amounts themselves', () => {
  it('monthly is $5', () => {
    expect(PRO_MONTHLY_USD).toBe(5)
    expect(usd(PRO_MONTHLY_USD)).toBe('$5')
  })

  it('yearly is $48', () => {
    expect(PRO_YEARLY_USD).toBe(48)
    expect(usd(PRO_YEARLY_USD)).toBe('$48')
  })

  it('the annual monthly equivalent is $4, and it is DERIVED', () => {
    // 48 / 12 = 4. Derived, so it cannot be edited out of step with the total.
    expect(PRO_YEARLY_PER_MONTH_USD).toBe(4)
    expect(PRO_YEARLY_PER_MONTH_USD).toBe(PRO_YEARLY_USD / 12)
    expect(usd(PRO_YEARLY_PER_MONTH_USD)).toBe('$4')
  })

  it('the annual saving is $12 and 20%, and both are DERIVED', () => {
    // 12 x $5 = $60;  $60 - $48 = $12;  $12 / $60 = 20%.
    expect(PRO_MONTHLY_TWELVE_USD).toBe(60)
    expect(PRO_YEARLY_SAVING_USD).toBe(12)
    expect(PRO_YEARLY_SAVING_PERCENT).toBe(20)
    expect(PRO_YEARLY_SAVING_USD).toBe(PRO_MONTHLY_USD * 12 - PRO_YEARLY_USD)
    expect(PRO_YEARLY_SAVING_PERCENT).toBe(
      Math.round((PRO_YEARLY_SAVING_USD / (PRO_MONTHLY_USD * 12)) * 100),
    )
  })

  it('formats whole amounts without decimals and part-amounts with two', () => {
    expect(usd(5)).toBe('$5')
    expect(usd(48)).toBe('$48')
    expect(usd(4.5)).toBe('$4.50')
  })
})

describe('the copy can never mislabel the annual plan', () => {
  it('never says $48/month, $4/year or $5/year', () => {
    const everyString = Object.values(PRO_PRICE_COPY).join(' | ')
    for (const wrong of ['$48/month', '$48 /month', '$4/year', '$4 /year', '$5/year', '$5 /year']) {
      expect(everyString, `copy must never contain "${wrong}"`).not.toContain(wrong)
    }
  })

  it('states the per-month equivalent ONLY together with "billed annually"', () => {
    /*
     * A bare "$4/month" is a price this product does not sell. The equivalent
     * and its qualifier are one string for exactly that reason.
     */
    expect(PRO_PRICE_COPY.yearlyPerMonth).toBe('$4/month billed annually')
    expect(PRO_PRICE_COPY.yearlySummary).toContain('billed annually')
    // `$4` NOT followed by another digit — otherwise "$48" matches "$4" and
    // the yearly total gets held to a rule that is only about the equivalent.
    const perMonthMentions = Object.entries(PRO_PRICE_COPY).filter(
      ([, v]) => typeof v === 'string' && /\$4(?!\d)/.test(v),
    )
    for (const [key, value] of perMonthMentions) {
      expect(String(value), `${key} mentions $4 without "billed annually"`).toMatch(/billed annually/)
    }
  })

  it('spells the periods once each, not twice', () => {
    // The old card rendered "/mo · per month, billed yearly".
    expect(PRO_PRICE_COPY.monthlySuffix).toBe('/month')
    expect(PRO_PRICE_COPY.yearlySuffix).toBe('/year')
    expect(PRO_PRICE_COPY.monthlySuffix).not.toMatch(/mo\b.*month/)
  })

  it('states the saving as $12 and 20%', () => {
    expect(PRO_PRICE_COPY.yearlySaving).toBe('Save $12 a year (20%)')
    expect(PRO_PRICE_COPY.yearlySummary).toContain('save 20%')
  })
})

describe('the plan data uses those amounts', () => {
  it('Pro carries $5/month plus the annual alternative', () => {
    expect(PRO.priceMonthly).toBe(PRO_MONTHLY_USD)
    expect(PRO.priceNote).toBe('per month')
    expect(PRO.yearly).toEqual(PRO_YEARLY)
    expect(PRO.yearly?.totalUsd).toBe(48)
    expect(PRO.yearly?.perMonthUsd).toBe(4)
    expect(PRO.yearly?.savingPercent).toBe(20)
  })

  it('Pro no longer claims its monthly figure is billed yearly', () => {
    // The exact contradiction that shipped: a per-month number labelled annual.
    expect(PRO.priceNote).not.toMatch(/billed yearly|billed annually/i)
  })

  it('Free and Team have NO annual block, so they cannot render one', () => {
    expect(FREE.yearly).toBeUndefined()
    expect(TEAM.yearly).toBeUndefined()
    expect(FREE.priceMonthly).toBe(0)
    expect(TEAM.priceMonthly).toBeNull()
  })
})

describe('display amounts and Stripe price IDs stay separate but consistent', () => {
  it('the monthly and yearly CTAs select DIFFERENT price IDs', () => {
    const config = { publishableKey: 'pk', priceMonthly: 'price_m', priceYearly: 'price_y' }
    expect(priceIdFor('monthly', config)).toBe('price_m')
    expect(priceIdFor('yearly', config)).toBe('price_y')
    expect(priceIdFor('monthly', config)).not.toBe(priceIdFor('yearly', config))
  })

  it('the intervals cannot be swapped', () => {
    const config = { publishableKey: 'pk', priceMonthly: 'MONTHLY_ID', priceYearly: 'YEARLY_ID' }
    // A swap would make the monthly button charge the yearly price.
    expect(priceIdFor('monthly', config)).not.toBe('YEARLY_ID')
    expect(priceIdFor('yearly', config)).not.toBe('MONTHLY_ID')
  })

  it('the pricing module contains NO Stripe price id', () => {
    /*
     * Deliberate separation: price IDs select the product Stripe charges for,
     * display amounts only describe it. Coupling them would let a copy edit
     * change what a customer is billed.
     */
    expect(read('./pricing.ts')).not.toMatch(/price_[A-Za-z0-9]{6,}/)
  })
})

describe('no stale pricing survives in the rendered pricing surfaces', () => {
  /*
   * A NARROW guard, on purpose. It scans only the files that render a price,
   * and only for the specific wrong values found in the 2026-08-06 audit —
   * not for arbitrary numbers, which would fire on capacity minutes, feature
   * caps and every other legitimate figure in the app.
   */
  const SURFACES = [
    './pricing.ts',
    './plans.ts',
    './PricingPage.tsx',
    './components/PricingTeaser.tsx',
    '../settings/PlanPage.tsx',
  ]

  /** The value that actually shipped, plus the classic mislabellings. */
  const STALE = ['$6', '$7', '$9', '$12/mo', '$60/year', 'per month, billed yearly']

  it.each(SURFACES)('%s carries no stale price', (rel) => {
    const source = read(rel)
    // Comments explain the old value on purpose; only live code is scanned.
    const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
    for (const stale of STALE) {
      expect(code, `${rel} still contains the stale value ${stale}`).not.toContain(stale)
    }
  })

  it('no surface hard-codes a bare dollar amount any more', () => {
    // Every displayed amount must come through `usd(...)` or PRO_PRICE_COPY,
    // which is what makes one edit enough.
    for (const rel of ['./PricingPage.tsx', './components/PricingTeaser.tsx', '../settings/PlanPage.tsx']) {
      const code = read(rel)
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\/\/.*$/gm, '')
      const literals = code.match(/\$\d+(\.\d+)?/g) ?? []
      expect(literals, `${rel} hard-codes ${literals.join(', ')}`).toEqual([])
    }
  })
})
