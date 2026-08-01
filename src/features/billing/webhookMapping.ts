/**
 * Pure extractors over Stripe webhook shapes. NO React, NO I/O, and — importantly
 * — NO `@/` imports: this is a LEAF module so the Vercel serverless webhook
 * (api/stripe-webhook.ts) can import it by relative path and bundle it cleanly.
 *
 * WHAT THIS MODULE NO LONGER DOES, AND WHY.
 *
 * It used to export `mapStripeEventToBilling`, which resolved WHICH USER an
 * event belonged to from `metadata.user_id` and reported the purchased price
 * from a `metadata.price_id` we had stamped ourselves. Both were removed
 * because neither is evidence:
 *
 *  - `metadata.user_id` is settable by anyone who can create an object in this
 *    Stripe account, including by hand in the Dashboard. Identity now comes
 *    from a server-created `checkout_attempts` row, located by an unguessable
 *    uuid, and from the subscription id a verified checkout already bound.
 *  - `metadata.price_id` records what we INTENDED to sell. What was actually
 *    bought is read from the Subscription retrieved from Stripe — see
 *    `priceIdsForSubscription`.
 *
 * An earlier header here also claimed "design for idempotency + out-of-order
 * safety" on the grounds that upserting by user_id makes a replay a no-op. That
 * reasoning was wrong and audit FLAG-3 disproved it. Ordering is decided in SQL,
 * under a row lock, in 20260801140000_billing_event_ordering.sql.
 */

export type Plan = 'free' | 'pro'

/** Minimal structural shape of the Stripe Subscription fields we read. */
export interface MinimalSubscription {
  id?: string | null
  status?: string | null
  current_period_end?: number | null // unix seconds
  customer?: string | null
  items?: { data?: Array<{ price?: { id?: string | null } | null } | null> | null } | null
}

export interface MinimalStripeEvent {
  type: string
  data: { object: unknown }
  /** Stripe's event id (`evt_…`). Optional in the TYPE, required in practice. */
  id?: string
  /** Stripe's `created`, unix SECONDS. */
  created?: number
  /** Present on every Stripe event; checked against STRIPE_MODE. */
  livemode?: boolean
}

/** Statuses that still grant Pro access (past_due keeps access during dunning). */
const ACTIVE_STATUSES = new Set(['active', 'trialing', 'past_due'])

/** Plan implied by a Stripe subscription status. */
export function planForStatus(status: string | null | undefined): Plan {
  return status != null && ACTIVE_STATUSES.has(status) ? 'pro' : 'free'
}

/**
 * Every price id on a Subscription RETRIEVED FROM STRIPE.
 *
 * This is the authoritative answer to "what did they buy". The caller compares
 * it against the configured Todonado prices and requires EXACTLY ONE match — a
 * subscription bundling a Todonado price with another HBV Studio product is not
 * a Todonado subscription, and honouring it partially would be worse than
 * refusing it.
 *
 * Returns an empty array when there are no readable items, which callers must
 * treat as "unverifiable", never as "fine".
 */
export function priceIdsForSubscription(sub: MinimalSubscription | null | undefined): string[] {
  const ids: string[] = []
  for (const item of sub?.items?.data ?? []) {
    const id = item?.price?.id
    if (typeof id === 'string' && id.length > 0 && !ids.includes(id)) ids.push(id)
  }
  return ids
}
