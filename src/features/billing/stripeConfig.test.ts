import { describe, expect, it } from 'vitest'
import { isBillingConfiguredFrom, priceIdFor } from './stripeConfig'

describe('isBillingConfiguredFrom', () => {
  it('is true only when publishable key AND both price IDs are present', () => {
    expect(
      isBillingConfiguredFrom({ publishableKey: 'pk_test_1', priceMonthly: 'price_m', priceYearly: 'price_y' }),
    ).toBe(true)
  })
  it('is false when anything is missing (the no-keys fallback path)', () => {
    expect(isBillingConfiguredFrom({ publishableKey: '', priceMonthly: '', priceYearly: '' })).toBe(false)
    expect(isBillingConfiguredFrom({ publishableKey: 'pk', priceMonthly: 'price_m', priceYearly: '' })).toBe(false)
    expect(isBillingConfiguredFrom({ publishableKey: 'pk', priceMonthly: '', priceYearly: 'price_y' })).toBe(false)
    expect(isBillingConfiguredFrom({ publishableKey: '', priceMonthly: 'price_m', priceYearly: 'price_y' })).toBe(false)
  })
})

describe('priceIdFor', () => {
  const config = { publishableKey: 'pk', priceMonthly: 'price_m', priceYearly: 'price_y' }
  it('picks the price for the interval', () => {
    expect(priceIdFor('monthly', config)).toBe('price_m')
    expect(priceIdFor('yearly', config)).toBe('price_y')
  })
})
