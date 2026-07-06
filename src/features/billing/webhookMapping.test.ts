import { describe, expect, it } from 'vitest'
import {
  mapStripeEventToBilling,
  planForStatus,
  type MinimalStripeEvent,
} from './webhookMapping'

const UID = 'user-123'

describe('planForStatus', () => {
  it('grants Pro for active/trialing/past_due, Free otherwise', () => {
    expect(planForStatus('active')).toBe('pro')
    expect(planForStatus('trialing')).toBe('pro')
    expect(planForStatus('past_due')).toBe('pro')
    expect(planForStatus('canceled')).toBe('free')
    expect(planForStatus('unpaid')).toBe('free')
    expect(planForStatus(null)).toBe('free')
    expect(planForStatus(undefined)).toBe('free')
  })
})

describe('mapStripeEventToBilling', () => {
  it('checkout.session.completed → pro, ids set, no period end (partial upsert)', () => {
    const event: MinimalStripeEvent = {
      type: 'checkout.session.completed',
      data: {
        object: {
          customer: 'cus_1',
          subscription: 'sub_1',
          metadata: { user_id: UID },
        },
      },
    }
    expect(mapStripeEventToBilling(event)).toEqual({
      user_id: UID,
      plan: 'pro',
      stripe_customer_id: 'cus_1',
      stripe_subscription_id: 'sub_1',
      subscription_status: 'active',
    })
  })

  it('falls back to client_reference_id when metadata.user_id is absent', () => {
    const event: MinimalStripeEvent = {
      type: 'checkout.session.completed',
      data: { object: { customer: 'cus_1', subscription: 'sub_1', client_reference_id: UID } },
    }
    expect(mapStripeEventToBilling(event)?.user_id).toBe(UID)
  })

  it('customer.subscription.updated → pro + status + ISO period end', () => {
    const periodEnd = 1_800_000_000 // unix seconds
    const event: MinimalStripeEvent = {
      type: 'customer.subscription.updated',
      data: {
        object: {
          id: 'sub_1',
          status: 'active',
          current_period_end: periodEnd,
          customer: 'cus_1',
          metadata: { user_id: UID },
        },
      },
    }
    expect(mapStripeEventToBilling(event)).toEqual({
      user_id: UID,
      plan: 'pro',
      stripe_customer_id: 'cus_1',
      stripe_subscription_id: 'sub_1',
      subscription_status: 'active',
      current_period_end: new Date(periodEnd * 1000).toISOString(),
    })
  })

  it('a non-active updated status downgrades the plan to free', () => {
    const event: MinimalStripeEvent = {
      type: 'customer.subscription.updated',
      data: { object: { id: 'sub_1', status: 'unpaid', customer: 'cus_1', metadata: { user_id: UID } } },
    }
    const row = mapStripeEventToBilling(event)
    expect(row?.plan).toBe('free')
    expect(row?.subscription_status).toBe('unpaid')
  })

  it('customer.subscription.deleted → free + canceled', () => {
    const event: MinimalStripeEvent = {
      type: 'customer.subscription.deleted',
      data: { object: { id: 'sub_1', status: 'active', customer: 'cus_1', metadata: { user_id: UID } } },
    }
    const row = mapStripeEventToBilling(event)
    expect(row?.plan).toBe('free')
    expect(row?.subscription_status).toBe('canceled')
  })

  it('returns null for an event missing our user_id (no blind write)', () => {
    const event: MinimalStripeEvent = {
      type: 'customer.subscription.updated',
      data: { object: { id: 'sub_1', status: 'active', customer: 'cus_1' } },
    }
    expect(mapStripeEventToBilling(event)).toBeNull()
  })

  it('unknown events → null (webhook no-ops with 200)', () => {
    expect(mapStripeEventToBilling({ type: 'invoice.paid', data: { object: {} } })).toBeNull()
    expect(mapStripeEventToBilling({ type: 'payment_intent.succeeded', data: { object: {} } })).toBeNull()
  })

  it('is idempotent — the same event maps to the same row every time', () => {
    const event: MinimalStripeEvent = {
      type: 'customer.subscription.updated',
      data: { object: { id: 'sub_1', status: 'active', current_period_end: 1_800_000_000, customer: 'cus_1', metadata: { user_id: UID } } },
    }
    expect(mapStripeEventToBilling(event)).toEqual(mapStripeEventToBilling(event))
  })
})
