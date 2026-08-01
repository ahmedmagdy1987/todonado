/**
 * Should this Stripe webhook event be applied to the billing row we already
 * hold? Pure decision, no I/O, no `@/` imports — a LEAF module so the Vercel
 * serverless webhook can import it by relative path (see webhookMapping.ts).
 *
 * WHY THIS EXISTS (audit FLAG-3)
 *
 * The webhook used to upsert on user_id and let the last write win. Stripe
 * retries deliveries and retries arrive out of order, so a redelivered
 * `customer.subscription.deleted` landing after a newer
 * `checkout.session.completed` silently downgraded a paying customer. No
 * attacker required — Stripe's own retry behaviour is enough.
 *
 * TIME COMES FROM STRIPE, NEVER FROM US. Every comparison is against
 * `event.created` from the signed payload. Arrival time is precisely the
 * ordering that is wrong in the bug, so it is never consulted.
 *
 * THE ASYMMETRY IS DELIBERATE: A DOWNGRADE IS HELD TO A STRICTER TEST.
 * The two failure directions do not cost the same. Wrongly granting Pro for a
 * few minutes until the next event corrects it is a rounding error. Wrongly
 * revoking Pro from someone who is paying is the bug in the audit — they lose
 * access they bought, and nothing in the system notices. So an event that
 * would take an active subscriber to Free must be strictly newer than what we
 * applied last (a same-second tie is refused) AND must name the subscription
 * we are actually holding. Everything else only has to be not-older.
 */

import {
  mapStripeEventToBilling,
  type BillingUpsert,
  type MinimalStripeEvent,
  type Plan,
} from './webhookMapping.js'

/**
 * The columns the decision reads. A subset of the `billing` row — the webhook
 * selects exactly these, so this interface IS the query.
 */
export interface BillingRowState {
  plan?: Plan | null
  stripe_subscription_id?: string | null
  last_stripe_event_id?: string | null
  /** ISO timestamptz as PostgREST returns it. */
  last_stripe_event_at?: string | null
}

export type SkipReason =
  /** Not an event we act on (mapping returned null). */
  | 'unknown_event'
  /** No usable `event.id` / `event.created` — cannot order or de-duplicate. */
  | 'missing_event_identity'
  /** This exact event id was already applied. Stripe redelivery. */
  | 'duplicate_event'
  /** Older than the high-water mark. */
  | 'stale_event'
  /** A downgrade that is not strictly newer than what we applied last. */
  | 'stale_downgrade'
  /** A downgrade naming a subscription this user no longer holds. */
  | 'downgrade_for_other_subscription'

export type WebhookDecision =
  | { action: 'apply'; upsert: BillingUpsert; eventId: string; eventAt: string }
  | { action: 'skip'; reason: SkipReason }

/** Parse a PostgREST timestamptz to epoch ms, or null when absent/unparseable. */
function parseIsoMs(value: string | null | undefined): number | null {
  if (!value) return null
  const ms = Date.parse(value)
  return Number.isFinite(ms) ? ms : null
}

/**
 * Decide whether `event` may be written over `current`.
 *
 * `current` is the billing row as it stands, or null when the user has none
 * yet (their first event — nothing to order against, so it is applied).
 */
export function decideWebhookWrite(
  event: MinimalStripeEvent,
  current: BillingRowState | null,
): WebhookDecision {
  const upsert = mapStripeEventToBilling(event)
  if (!upsert) return { action: 'skip', reason: 'unknown_event' }

  /*
   * FAIL CLOSED ON A NAMELESS EVENT.
   *
   * Both fields are optional in the type so mapping fixtures need not invent
   * them, but an event that reached here has a verified Stripe signature and
   * every such event carries both. Missing them means something is deeply
   * wrong upstream, and an event we can neither order nor de-duplicate is
   * exactly the input this module exists to refuse. Skipping is safe: Stripe
   * retries, and the dashboard shows the delivery as unacknowledged.
   */
  const eventId = typeof event.id === 'string' && event.id.length > 0 ? event.id : null
  const createdMs =
    typeof event.created === 'number' && Number.isFinite(event.created)
      ? event.created * 1000
      : null
  if (eventId === null || createdMs === null) {
    return { action: 'skip', reason: 'missing_event_identity' }
  }
  const eventAt = new Date(createdMs).toISOString()

  // First event for this user: no history, nothing to contradict.
  if (!current) return { action: 'apply', upsert, eventId, eventAt }

  // 1 — Exact redelivery of an event we already applied.
  if (current.last_stripe_event_id && current.last_stripe_event_id === eventId) {
    return { action: 'skip', reason: 'duplicate_event' }
  }

  const markMs = parseIsoMs(current.last_stripe_event_at)

  // 2 — Strictly older than the high-water mark, whatever it would do.
  if (markMs !== null && createdMs < markMs) {
    return { action: 'skip', reason: 'stale_event' }
  }

  // 3 — Downgrades face the stricter test described in the header.
  const isDowngrade = upsert.plan === 'free' && current.plan === 'pro'
  if (isDowngrade) {
    /*
     * A TIE IS NOT GOOD ENOUGH TO REVOKE ACCESS.
     *
     * `event.created` has one-second granularity, so a cancel and the renewal
     * that superseded it can share a timestamp. Rule 2 lets a tie through
     * because for an upgrade that is harmless. For a downgrade it is the exact
     * race that costs a paying customer their access, so a tie is refused.
     */
    if (markMs !== null && createdMs <= markMs) {
      return { action: 'skip', reason: 'stale_downgrade' }
    }

    /*
     * THE SUBSCRIPTION MUST BE THE ONE WE ARE HOLDING.
     *
     * Cancel-then-resubscribe produces a NEW subscription id. The old
     * subscription's `deleted` event is still queued and still legitimate for
     * that object — it simply says nothing about the subscription now paying.
     * Applying it would revoke access bought seconds earlier. This guard is
     * independent of the clock, so it holds even for a row whose high-water
     * mark is still NULL (the one-time window after the migration lands).
     *
     * Both ids must be known to compare: a null on either side is missing
     * information, not evidence of a mismatch, and rule 2 has already covered
     * the ordering question by that point.
     */
    const heldSubscription = current.stripe_subscription_id ?? null
    const eventSubscription = upsert.stripe_subscription_id ?? null
    if (
      heldSubscription !== null &&
      eventSubscription !== null &&
      heldSubscription !== eventSubscription
    ) {
      return { action: 'skip', reason: 'downgrade_for_other_subscription' }
    }
  }

  return { action: 'apply', upsert, eventId, eventAt }
}
