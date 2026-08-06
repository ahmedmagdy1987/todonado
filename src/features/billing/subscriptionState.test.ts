import { describe, expect, it } from 'vitest'
import { currentPeriodEndFor, type MinimalSubscription } from './webhookMapping'

/**
 * THE PERIOD END COMES FROM THE SUBSCRIPTION ITEM, AND FROM THE RIGHT ONE.
 *
 * Stripe moved `current_period_end` off the Subscription onto each
 * SubscriptionItem in API version 2025-03-31.basil. This project pins
 * stripe@22.3.0, whose `ApiVersion` is `2026-06-24.dahlia` and which sends
 * `Stripe-Version` on every request, so the Subscription this code receives has
 * no such field.
 *
 * Reading it yielded `undefined` forever, `p_set_period_end` was therefore
 * always false, and `billing.current_period_end` stayed NULL: no renewal date
 * for a paying customer, and no independent expiry signal for entitlement.
 *
 * The old fixtures fabricated the pre-basil shape, so the doubles agreed with
 * the code and both disagreed with Stripe. Every fixture below is the shape the
 * PINNED version actually returns.
 */

const MONTHLY = 'price_monthly_todonado'
const YEARLY = 'price_yearly_todonado'
const OURS = [MONTHLY, YEARLY] as const

const AUG = 1_780_000_000
const SEP = 1_782_600_000

const sub = (items: unknown[]): MinimalSubscription =>
  ({ id: 'sub_1', status: 'active', items: { data: items } }) as MinimalSubscription

describe('currentPeriodEndFor', () => {
  it('reads the period end from the ITEM, for a monthly subscription', () => {
    expect(currentPeriodEndFor(sub([{ price: { id: MONTHLY }, current_period_end: AUG }]), OURS)).toBe(AUG)
  })

  it('reads it for a yearly subscription too', () => {
    expect(currentPeriodEndFor(sub([{ price: { id: YEARLY }, current_period_end: SEP }]), OURS)).toBe(SEP)
  })

  it('IGNORES a top-level current_period_end, because the API does not send one', () => {
    /*
     * The exact regression. A subscription carrying the OLD shape and no item
     * period must yield null — not the stale top-level value — or the fix
     * would silently keep working off a field production never receives.
     */
    const legacy = {
      id: 'sub_1',
      status: 'active',
      current_period_end: AUG,
      items: { data: [{ price: { id: MONTHLY } }] },
    } as unknown as MinimalSubscription
    expect(currentPeriodEndFor(legacy, OURS)).toBeNull()
  })

  it('picks OUR item out of a multi-item subscription, never items[0]', () => {
    /*
     * This Stripe account carries other HBV products. `items.data[0]` is not
     * necessarily ours, and reporting another product's renewal date on a
     * Todonado plan page would be wrong in a way nobody would notice.
     */
    const mixed = sub([
      { price: { id: 'price_other_product' }, current_period_end: AUG },
      { price: { id: YEARLY }, current_period_end: SEP },
    ])
    expect(currentPeriodEndFor(mixed, OURS)).toBe(SEP)
  })

  it('takes the EARLIEST end when several of our own prices are present', () => {
    // Over-reporting entitlement is the failure that costs money.
    const both = sub([
      { price: { id: MONTHLY }, current_period_end: SEP },
      { price: { id: YEARLY }, current_period_end: AUG },
    ])
    expect(currentPeriodEndFor(both, OURS)).toBe(AUG)
  })

  it('falls back to a SINGLE unmatched item, which covers a price migration', () => {
    // A retired price still belongs to a subscription we bound.
    expect(
      currentPeriodEndFor(sub([{ price: { id: 'price_retired' }, current_period_end: AUG }]), OURS),
    ).toBe(AUG)
  })

  it('refuses to guess between SEVERAL unmatched items', () => {
    const foreign = sub([
      { price: { id: 'price_a' }, current_period_end: AUG },
      { price: { id: 'price_b' }, current_period_end: SEP },
    ])
    expect(currentPeriodEndFor(foreign, OURS)).toBeNull()
  })

  it('never fabricates a period end from a malformed payload', () => {
    for (const bad of [
      sub([]),
      sub([null]),
      sub([{ price: { id: MONTHLY } }]),
      sub([{ price: { id: MONTHLY }, current_period_end: null }]),
      sub([{ price: { id: MONTHLY }, current_period_end: 0 }]),
      sub([{ price: { id: MONTHLY }, current_period_end: -1 }]),
      sub([{ price: { id: MONTHLY }, current_period_end: Number.NaN }]),
      sub([{ price: { id: MONTHLY }, current_period_end: 'soon' }]),
      { id: 'sub_1' } as MinimalSubscription,
      null,
      undefined,
    ]) {
      expect(currentPeriodEndFor(bad as MinimalSubscription, OURS)).toBeNull()
    }
  })

  it('handles a deleted item shape without throwing', () => {
    expect(currentPeriodEndFor(sub([{ deleted: true }]), OURS)).toBeNull()
  })

  it('tolerates an empty configured-price list rather than crashing', () => {
    // Misconfiguration must not take the webhook down; a single item is still
    // usable, several are not.
    expect(currentPeriodEndFor(sub([{ price: { id: MONTHLY }, current_period_end: AUG }]), [])).toBe(AUG)
  })
})
