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
export interface MinimalSubscriptionItem {
  /** Unix seconds. Lives on the ITEM since Stripe API 2025-03-31.basil. */
  current_period_end?: number | null
  price?: { id?: string | null } | null
}

export interface MinimalSubscription {
  id?: string | null
  status?: string | null
  customer?: string | null
  items?: { data?: Array<MinimalSubscriptionItem | null> | null } | null
}

/**
 * The current period end, in unix seconds, or null.
 *
 * ── WHY THIS IS NOT `subscription.current_period_end` ──────────────────────
 *
 * IT ISN'T THERE. Stripe moved `current_period_end` off the Subscription and
 * onto each SubscriptionItem in API version 2025-03-31.basil. This project
 * pins stripe@22.3.0, whose `ApiVersion` is `2026-06-24.dahlia` and which
 * sends `Stripe-Version` on every request, so the Subscription this code
 * receives has no such field. Reading it yielded `undefined` forever, the
 * write became a no-op (`p_set_period_end` false), and `billing`'s column
 * stayed NULL — so a paying customer never saw a renewal date and entitlement
 * had no independent expiry signal.
 *
 * It compiled because the retrieved object is cast to this hand-written
 * interface, whose field was optional. The real `Stripe.Subscription` type
 * would have failed the build. That is why the field is now modelled ONLY on
 * the item: the shape of this interface is what makes the mistake unrepeatable.
 *
 * ── WHY THE PRICE ID MATTERS ───────────────────────────────────────────────
 *
 * A subscription can carry several items, and `items.data[0]` is not
 * necessarily ours — a customer could hold another product from the same
 * Stripe account on one subscription. We take the period end from the item
 * whose price is one WE configured; only if no item matches (and there is
 * exactly one item) do we fall back to it, which covers a legitimate price
 * migration without ever silently reporting an unrelated product's dates.
 *
 * Returns null rather than inventing a value. A missing period end is
 * recorded as "unknown" (the SQL leaves the column alone), never as a
 * fabricated date.
 */
export function currentPeriodEndFor(
  subscription: MinimalSubscription | null | undefined,
  configuredPriceIds: readonly string[],
): number | null {
  const items = (subscription?.items?.data ?? []).filter(
    (i): i is MinimalSubscriptionItem => i != null,
  )
  if (items.length === 0) return null

  const usable = (i: MinimalSubscriptionItem): number | null => {
    const v = i.current_period_end
    return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null
  }

  const wanted = new Set(configuredPriceIds.filter((p): p is string => typeof p === 'string' && !!p))
  const mine = items.filter((i) => typeof i.price?.id === 'string' && wanted.has(i.price.id))

  if (mine.length > 0) {
    /*
     * If several of our own prices are on one subscription (a plan change that
     * has not settled, say), take the EARLIEST end: that is the first moment
     * access could lapse, and over-reporting entitlement is the failure that
     * costs money.
     */
    const ends = mine.map(usable).filter((v): v is number => v != null)
    return ends.length > 0 ? Math.min(...ends) : null
  }

  // No item matches a configured price. Only trust a single-item subscription.
  return items.length === 1 ? usable(items[0]) : null
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
