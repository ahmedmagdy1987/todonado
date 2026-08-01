/**
 * Pure mapping from a Stripe webhook event to a `billing` upsert. NO React, NO
 * I/O, and — importantly — NO `@/` imports: this is a LEAF module so the Vercel
 * serverless webhook (api/stripe-webhook.ts) can import it by relative path and
 * bundle it cleanly. Unit-tested with mocked Stripe event shapes.
 *
 * What this module guarantees:
 *  - Each event returns ONLY the columns it is authoritative for (a PARTIAL
 *    upsert), so e.g. `checkout.session.completed` (which has no period end)
 *    never nulls a `current_period_end` that a `customer.subscription.updated`
 *    already wrote.
 *  - Unknown events map to `null` → the webhook returns 200 and writes nothing.
 *
 * WHAT IT DELIBERATELY DOES *NOT* GUARANTEE — and where that lives instead.
 * This header used to claim "design for idempotency + out-of-order safety" on
 * the grounds that upserting by user_id makes a replay a no-op. That reasoning
 * was wrong and audit FLAG-3 demonstrated it: an upsert keyed on user_id makes
 * whatever arrives LAST win, which is the opposite of order-safety. Replaying
 * the same event is harmless only because it writes the same values; replaying
 * an OLDER event overwrites a newer state and downgrades a paying customer.
 *
 * This module is a pure per-event mapping and has no way to know what is
 * already stored, so ordering cannot be decided here. It is decided in
 * `webhookOrdering.ts`, which compares the event against the current row, and
 * enforced by the conditional write in `api/stripe-webhook.ts`.
 */

export type Plan = 'free' | 'pro'

/** A partial `billing` row to upsert (only the columns this event owns). */
export interface BillingUpsert {
  user_id: string
  plan?: Plan
  stripe_customer_id?: string | null
  stripe_subscription_id?: string | null
  subscription_status?: string | null
  current_period_end?: string | null
}

// Minimal structural shapes of the Stripe objects we read (the real Stripe
// event objects satisfy these). Keeping them local avoids a stripe import here.
interface MinimalSubscription {
  id?: string | null
  status?: string | null
  current_period_end?: number | null // unix seconds
  customer?: string | null
  metadata?: { user_id?: string | null } | null
}
interface MinimalCheckoutSession {
  customer?: string | null
  subscription?: string | null
  client_reference_id?: string | null
  metadata?: { user_id?: string | null } | null
}
export interface MinimalStripeEvent {
  type: string
  data: { object: unknown }
  /**
   * Stripe's event id (`evt_…`). Optional in the TYPE, required in PRACTICE:
   * every event Stripe signs carries one, and `webhookOrdering.ts` refuses to
   * apply an event without it rather than guessing. Optional here so a fixture
   * that only exercises the mapping does not have to invent one.
   */
  id?: string
  /** Stripe's `created`, unix SECONDS. Same optional-in-type rule as `id`. */
  created?: number
}

/** Statuses that still grant Pro access (past_due keeps access during dunning). */
const ACTIVE_STATUSES = new Set(['active', 'trialing', 'past_due'])

/** Plan implied by a Stripe subscription status. */
export function planForStatus(status: string | null | undefined): Plan {
  return status != null && ACTIVE_STATUSES.has(status) ? 'pro' : 'free'
}

/** Unix seconds → ISO string, or null. */
function toIso(unixSeconds: number | null | undefined): string | null {
  if (unixSeconds == null || !Number.isFinite(unixSeconds)) return null
  return new Date(unixSeconds * 1000).toISOString()
}

/**
 * Map a verified Stripe event to a partial `billing` upsert, or null for a
 * no-op (unknown event, or an event missing our user_id). The webhook resolves
 * user_id from metadata.user_id (set on both the checkout session and, via
 * subscription_data.metadata, the subscription itself) so no DB lookup is needed.
 */
export function mapStripeEventToBilling(event: MinimalStripeEvent): BillingUpsert | null {
  switch (event.type) {
    case 'checkout.session.completed': {
      const s = event.data.object as MinimalCheckoutSession
      const userId = s.metadata?.user_id ?? s.client_reference_id ?? null
      if (!userId) return null
      // Authoritative status + period end arrive via customer.subscription.updated;
      // deliberately omit current_period_end so we don't null a value already set.
      return {
        user_id: userId,
        plan: 'pro',
        stripe_customer_id: s.customer ?? null,
        stripe_subscription_id: s.subscription ?? null,
        subscription_status: 'active',
      }
    }
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted': {
      const sub = event.data.object as MinimalSubscription
      const userId = sub.metadata?.user_id ?? null
      if (!userId) return null
      const deleted = event.type === 'customer.subscription.deleted'
      const status = deleted ? 'canceled' : (sub.status ?? null)
      return {
        user_id: userId,
        plan: deleted ? 'free' : planForStatus(status),
        stripe_customer_id: sub.customer ?? null,
        stripe_subscription_id: sub.id ?? null,
        subscription_status: status,
        current_period_end: toIso(sub.current_period_end),
      }
    }
    default:
      return null
  }
}
