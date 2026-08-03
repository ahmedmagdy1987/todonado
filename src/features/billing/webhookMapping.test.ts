import { describe, expect, it } from 'vitest'
import {
  planForStatus,
  priceIdsForSubscription,
  type MinimalSubscription,
} from './webhookMapping'

/**
 * What this module still does — and what it deliberately no longer does.
 *
 * `mapStripeEventToBilling` is GONE, along with its tests. It resolved the user
 * from `metadata.user_id` and reported the purchase from a `metadata.price_id`
 * we stamped ourselves. Neither is evidence: anyone who can create an object in
 * this Stripe account (including by hand in the Dashboard) can set metadata,
 * and the account belongs to HBV Studio, which runs other products in it.
 *
 * Identity now comes from a server-created `checkout_attempts` row and from the
 * subscription id a verified checkout bound. What was purchased comes from the
 * Subscription retrieved from Stripe — which is what `priceIdsForSubscription`
 * reads.
 */

describe('planForStatus', () => {
  it('grants Pro for active/trialing/past_due, Free otherwise', () => {
    expect(planForStatus('active')).toBe('pro')
    expect(planForStatus('trialing')).toBe('pro')
    // Dunning keeps access — the customer has not cancelled, their card failed.
    expect(planForStatus('past_due')).toBe('pro')
    expect(planForStatus('canceled')).toBe('free')
    expect(planForStatus('unpaid')).toBe('free')
    expect(planForStatus('incomplete')).toBe('free')
    expect(planForStatus('paused')).toBe('free')
    expect(planForStatus(null)).toBe('free')
    expect(planForStatus(undefined)).toBe('free')
  })
})

describe('priceIdsForSubscription — the authoritative purchase', () => {
  const sub = (items: unknown): MinimalSubscription => ({ items }) as unknown as MinimalSubscription

  it('reads the price id from a single-item subscription', () => {
    expect(priceIdsForSubscription(sub({ data: [{ price: { id: 'price_a' } }] }))).toEqual([
      'price_a',
    ])
  })

  it('reports EVERY price on a multi-item subscription', () => {
    // The caller requires exactly one, so a bundle must stay visible as a
    // bundle rather than being silently reduced to its first item.
    expect(
      priceIdsForSubscription(
        sub({ data: [{ price: { id: 'price_todonado' } }, { price: { id: 'price_other_hbv' } }] }),
      ),
    ).toEqual(['price_todonado', 'price_other_hbv'])
  })

  it('de-duplicates a repeated price', () => {
    expect(
      priceIdsForSubscription(
        sub({ data: [{ price: { id: 'price_a' } }, { price: { id: 'price_a' } }] }),
      ),
    ).toEqual(['price_a'])
  })

  it('returns EMPTY for an unreadable subscription — never a false positive', () => {
    // Callers must read empty as "unverifiable", not as "fine".
    expect(priceIdsForSubscription(sub({ data: [] }))).toEqual([])
    expect(priceIdsForSubscription(sub(null))).toEqual([])
    expect(priceIdsForSubscription(sub({ data: [null] }))).toEqual([])
    expect(priceIdsForSubscription(sub({ data: [{ price: null }] }))).toEqual([])
    expect(priceIdsForSubscription(null)).toEqual([])
    expect(priceIdsForSubscription(undefined)).toEqual([])
  })

  it('ignores a non-string or empty price id rather than passing it on', () => {
    expect(
      priceIdsForSubscription(
        sub({ data: [{ price: { id: '' } }, { price: { id: 42 } }, { price: { id: 'price_ok' } }] }),
      ),
    ).toEqual(['price_ok'])
  })

  it('does NOT read metadata — metadata is intent, not proof', () => {
    const withMetadataOnly = {
      metadata: { price_id: 'price_claimed' },
      items: { data: [] },
    } as unknown as MinimalSubscription
    expect(priceIdsForSubscription(withMetadataOnly)).toEqual([])
  })
})
