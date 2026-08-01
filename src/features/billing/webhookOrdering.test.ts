import { describe, expect, it } from 'vitest'
import {
  decideWebhookWrite,
  type BillingRowState,
  type WebhookDecision,
} from './webhookOrdering'
import type { MinimalStripeEvent } from './webhookMapping'

/**
 * Ordering + de-duplication rules (audit FLAG-3).
 *
 * Every case here is a REAL Stripe delivery pattern, not a hypothetical: Stripe
 * retries, and retries arrive out of order. The scenario that matters most is
 * the last describe block — a paying customer must never be downgraded by a
 * late event about a subscription they already replaced.
 */

const UID = 'user-123'

/** Seconds since epoch, so fixtures read like Stripe's own `created`. */
const T = {
  early: 1_800_000_000,
  mid: 1_800_000_100,
  late: 1_800_000_200,
} as const

function deletedEvent(opts: {
  id: string
  created: number
  subscription?: string
}): MinimalStripeEvent {
  return {
    id: opts.id,
    created: opts.created,
    type: 'customer.subscription.deleted',
    data: {
      object: {
        id: opts.subscription ?? 'sub_old',
        status: 'canceled',
        customer: 'cus_1',
        metadata: { user_id: UID },
      },
    },
  }
}

function updatedEvent(opts: {
  id: string
  created: number
  subscription?: string
  status?: string
}): MinimalStripeEvent {
  return {
    id: opts.id,
    created: opts.created,
    type: 'customer.subscription.updated',
    data: {
      object: {
        id: opts.subscription ?? 'sub_new',
        status: opts.status ?? 'active',
        current_period_end: opts.created + 2_592_000,
        customer: 'cus_1',
        metadata: { user_id: UID },
      },
    },
  }
}

/** A row for a customer who is currently paying. */
function proRow(over: Partial<BillingRowState> = {}): BillingRowState {
  return {
    plan: 'pro',
    stripe_subscription_id: 'sub_new',
    last_stripe_event_id: 'evt_applied',
    last_stripe_event_at: new Date(T.mid * 1000).toISOString(),
    ...over,
  }
}

const skipReason = (d: WebhookDecision) => (d.action === 'skip' ? d.reason : null)

describe('decideWebhookWrite — the first event for a user', () => {
  it('applies when there is no row yet (nothing to order against)', () => {
    const decision = decideWebhookWrite(updatedEvent({ id: 'evt_1', created: T.mid }), null)
    expect(decision.action).toBe('apply')
    if (decision.action !== 'apply') return
    expect(decision.upsert.plan).toBe('pro')
    expect(decision.eventId).toBe('evt_1')
    expect(decision.eventAt).toBe(new Date(T.mid * 1000).toISOString())
  })

  it('carries Stripe’s own created time as the high-water mark, not ours', () => {
    const decision = decideWebhookWrite(updatedEvent({ id: 'evt_1', created: T.early }), null)
    if (decision.action !== 'apply') throw new Error('expected apply')
    // The mark must be the EVENT's timestamp. If this ever reads as "now", the
    // implementation has gone back to ordering by arrival, which is the bug.
    expect(Date.parse(decision.eventAt)).toBe(T.early * 1000)
    expect(Date.parse(decision.eventAt)).not.toBeCloseTo(Date.now(), -4)
  })
})

describe('decideWebhookWrite — de-duplication of a redelivered event', () => {
  it('skips an event whose id was already applied', () => {
    const decision = decideWebhookWrite(
      updatedEvent({ id: 'evt_applied', created: T.late }),
      proRow(),
    )
    expect(skipReason(decision)).toBe('duplicate_event')
  })

  it('de-duplicates on the event id even when the payload would be a no-op anyway', () => {
    // Same id, identical resulting state. It must still be recognised as a
    // duplicate rather than "harmlessly" rewritten — a write that looks
    // idempotent still moves updated_at and still races other deliveries.
    const decision = decideWebhookWrite(
      updatedEvent({ id: 'evt_applied', created: T.mid }),
      proRow(),
    )
    expect(skipReason(decision)).toBe('duplicate_event')
  })

  it('does NOT treat a different event id at the same timestamp as a duplicate', () => {
    const decision = decideWebhookWrite(
      updatedEvent({ id: 'evt_other', created: T.mid }),
      proRow(),
    )
    expect(decision.action).toBe('apply')
  })
})

describe('decideWebhookWrite — ordering by Stripe’s clock', () => {
  it('skips an event older than the high-water mark', () => {
    const decision = decideWebhookWrite(
      updatedEvent({ id: 'evt_old', created: T.early }),
      proRow(),
    )
    expect(skipReason(decision)).toBe('stale_event')
  })

  it('applies an event newer than the high-water mark', () => {
    const decision = decideWebhookWrite(
      updatedEvent({ id: 'evt_new', created: T.late }),
      proRow(),
    )
    expect(decision.action).toBe('apply')
  })

  it('applies a NON-downgrade that ties the high-water mark', () => {
    // One-second granularity means ties are real. For an upgrade a tie is
    // harmless, so it is allowed; the downgrade block below refuses it.
    const decision = decideWebhookWrite(
      updatedEvent({ id: 'evt_tie', created: T.mid }),
      proRow({ plan: 'free' }),
    )
    expect(decision.action).toBe('apply')
  })
})

describe('decideWebhookWrite — a stale delete must never downgrade a payer', () => {
  it('REQUIRED CASE: out-of-order deleted arriving after a newer update', () => {
    /*
     * The audit's exact scenario. The customer cancelled, then resubscribed;
     * the newer subscription is stored. Stripe now redelivers the cancel.
     * Before the fix this wrote plan='free' over a paying customer.
     */
    const decision = decideWebhookWrite(
      deletedEvent({ id: 'evt_cancel', created: T.early, subscription: 'sub_old' }),
      proRow(),
    )
    expect(decision.action).toBe('skip')
    expect(skipReason(decision)).toBe('stale_event')
  })

  it('REQUIRED CASE: a redelivery arriving after a newer event does not rewind', () => {
    const first = decideWebhookWrite(
      updatedEvent({ id: 'evt_renew', created: T.late, subscription: 'sub_new' }),
      proRow({ last_stripe_event_id: 'evt_prev', last_stripe_event_at: new Date(T.early * 1000).toISOString() }),
    )
    expect(first.action).toBe('apply')
    if (first.action !== 'apply') return

    // The row now reflects evt_renew. The older cancel is redelivered.
    const rowAfter = proRow({
      last_stripe_event_id: first.eventId,
      last_stripe_event_at: first.eventAt,
    })
    const second = decideWebhookWrite(
      deletedEvent({ id: 'evt_cancel', created: T.mid, subscription: 'sub_old' }),
      rowAfter,
    )
    expect(second.action).toBe('skip')
  })

  it('refuses a downgrade that merely TIES the high-water mark', () => {
    const decision = decideWebhookWrite(
      deletedEvent({ id: 'evt_cancel', created: T.mid, subscription: 'sub_new' }),
      proRow(),
    )
    expect(skipReason(decision)).toBe('stale_downgrade')
  })

  it('refuses a NEWER delete that names a subscription the user no longer holds', () => {
    /*
     * Clock-independent guard. The cancel is genuinely newer, but it is about
     * sub_old — the customer is now paying on sub_new. Ordering alone would
     * apply this and revoke access that was bought.
     */
    const decision = decideWebhookWrite(
      deletedEvent({ id: 'evt_cancel', created: T.late, subscription: 'sub_old' }),
      proRow({ stripe_subscription_id: 'sub_new' }),
    )
    expect(skipReason(decision)).toBe('downgrade_for_other_subscription')
  })

  it('still applies a newer delete for the subscription actually held', () => {
    // The guard must not be so tight that a real cancellation never lands.
    const decision = decideWebhookWrite(
      deletedEvent({ id: 'evt_cancel', created: T.late, subscription: 'sub_new' }),
      proRow({ stripe_subscription_id: 'sub_new' }),
    )
    expect(decision.action).toBe('apply')
    if (decision.action !== 'apply') return
    expect(decision.upsert.plan).toBe('free')
  })

  it('applies a delete when the row has no high-water mark yet, if the ids agree', () => {
    // The documented one-time window right after the migration lands.
    const decision = decideWebhookWrite(
      deletedEvent({ id: 'evt_cancel', created: T.late, subscription: 'sub_new' }),
      proRow({ last_stripe_event_id: null, last_stripe_event_at: null }),
    )
    expect(decision.action).toBe('apply')
  })

  it('the subscription guard holds even with no high-water mark', () => {
    const decision = decideWebhookWrite(
      deletedEvent({ id: 'evt_cancel', created: T.late, subscription: 'sub_old' }),
      proRow({ last_stripe_event_id: null, last_stripe_event_at: null }),
    )
    expect(skipReason(decision)).toBe('downgrade_for_other_subscription')
  })
})

describe('decideWebhookWrite — events it refuses to reason about', () => {
  it('skips an unknown event type', () => {
    const decision = decideWebhookWrite(
      { id: 'evt_x', created: T.late, type: 'invoice.paid', data: { object: {} } },
      proRow(),
    )
    expect(skipReason(decision)).toBe('unknown_event')
  })

  it('skips an event with no id — it can be neither ordered nor de-duplicated', () => {
    const event = updatedEvent({ id: 'evt_1', created: T.late })
    delete event.id
    expect(skipReason(decideWebhookWrite(event, proRow()))).toBe('missing_event_identity')
  })

  it('skips an event with no created timestamp', () => {
    const event = updatedEvent({ id: 'evt_1', created: T.late })
    delete event.created
    expect(skipReason(decideWebhookWrite(event, proRow()))).toBe('missing_event_identity')
  })

  it('fails CLOSED on a nameless event rather than applying it', () => {
    // The dangerous reading of "we cannot order this" is "so apply it".
    const event = deletedEvent({ id: 'evt_1', created: T.late, subscription: 'sub_new' })
    delete event.created
    const decision = decideWebhookWrite(event, proRow())
    expect(decision.action).toBe('skip')
  })
})
