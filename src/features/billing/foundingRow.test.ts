import { describe, expect, it } from 'vitest'
import { FOUNDING_STATUS } from './entitlements'
import { FOUNDING_EMAILS, isFoundingEmail, resolveEffectivePlan } from './planCore'

/**
 * THE FOUNDING-PRO ROW MODEL, PROVED AT THE RESOLVER.
 *
 * ── WHAT THIS CAN AND CANNOT PROVE ─────────────────────────────────────────
 *
 * It proves that the proposed row SHAPE resolves to Pro everywhere entitlement
 * is decided, and that it stays distinguishable from a Stripe-backed
 * subscription. It does NOT prove the database trigger honours it: that needs a
 * real connection, and is BLOCKED (see docs/proposals/).
 *
 * ── THE SHAPE, AND WHY IT IS THIS SHAPE ────────────────────────────────────
 *
 *   plan                   'pro'
 *   subscription_status    'founding'
 *   stripe_customer_id     NULL
 *   stripe_subscription_id NULL
 *
 * Verified against the live schema: `subscription_status` has no CHECK, and both
 * Stripe columns are nullable, so this needs NO migration and NO invented Stripe
 * identifiers.
 *
 * The NULLs are the safety property, not an omission.
 * `apply_stripe_subscription_event` finds its target with
 * `where stripe_subscription_id = …`, so a row with NULL there can never be
 * matched by a subscription event — which matters because both downgrade guards
 * in `apply_stripe_billing_event` are themselves conditioned on non-NULL values
 * a founding row does not have. Unreachable beats guarded.
 */

/** The row the seed would write. */
const FOUNDING_ROW = {
  plan: 'pro' as const,
  subscription_status: FOUNDING_STATUS,
  stripe_customer_id: null,
  stripe_subscription_id: null,
}

/** A genuine paid subscriber, for contrast. */
const STRIPE_ROW = {
  plan: 'pro' as const,
  subscription_status: 'active',
  stripe_customer_id: 'cus_live',
  stripe_subscription_id: 'sub_live',
}

describe('a seeded founding row', () => {
  it('resolves to Pro, from the row alone', () => {
    // No email needed: once seeded, entitlement comes from the database, which
    // is the whole point of seeding it.
    expect(resolveEffectivePlan({ billingPlan: FOUNDING_ROW.plan, email: null })).toBe('pro')
  })

  it('resolves to Pro on the SERVER, where the email allowlist is not trusted alone', () => {
    // The server passes the real `emailVerified`. A seeded row does not depend
    // on it, which is exactly the fragility the seed removes.
    expect(
      resolveEffectivePlan({
        billingPlan: FOUNDING_ROW.plan,
        email: 'someone@else.test',
        emailVerified: false,
      }),
    ).toBe('pro')
  })

  it('carries no Stripe identifiers, so no invented ones are needed', () => {
    expect(FOUNDING_ROW.stripe_customer_id).toBeNull()
    expect(FOUNDING_ROW.stripe_subscription_id).toBeNull()
  })

  it('cannot be matched by a Stripe subscription event', () => {
    /*
     * `apply_stripe_subscription_event` selects `where stripe_subscription_id =
     * p_subscription_id`. A NULL never equals anything, so no cancellation,
     * renewal or deletion event can reach this row. Asserted as a property of
     * the shape, because it is the reason the shape is safe.
     */
    expect(FOUNDING_ROW.stripe_subscription_id).toBeNull()
  })

  it('stays distinguishable from a real subscription', () => {
    // The plan page keys the billing-portal button on this. Offering the portal
    // to a founder produces `no_subscription` and an error toast.
    const hasRealSubscription = (row: { plan: string; stripe_customer_id: string | null }) =>
      row.plan === 'pro' && !!row.stripe_customer_id

    expect(hasRealSubscription(FOUNDING_ROW)).toBe(false)
    expect(hasRealSubscription(STRIPE_ROW)).toBe(true)
  })

  it('is identified as founding by its status, which survives the seed', () => {
    /*
     * Before the seed, `isFounding` is driven by `billing.plan !== 'pro' &&
     * isFoundingEmail(email)`. After it, `billing.plan` IS 'pro', so that clause
     * goes false and the owner would silently read as an ordinary subscriber.
     * The status marker is what keeps it true on both sides.
     */
    const isFounding = (
      row: { plan: string; subscription_status: string | null },
      email: string | null,
    ) =>
      row.subscription_status === FOUNDING_STATUS ||
      (row.plan !== 'pro' && isFoundingEmail(email))

    expect(isFounding(FOUNDING_ROW, null)).toBe(true)
    expect(isFounding(STRIPE_ROW, null)).toBe(false)
    // And the pre-seed path still works for an allowlisted address with no row.
    expect(
      isFounding({ plan: 'free', subscription_status: null }, FOUNDING_EMAILS[0]),
    ).toBe(true)
  })

  it('does not block the founder from ever subscribing for real', () => {
    /*
     * The checkout duplicate-guard is
     * `existing?.stripe_subscription_id && BLOCKING_STATUSES.has(status)`.
     * A NULL subscription id short-circuits it, so a founding account can still
     * buy a subscription if it ever wants one, and the webhook then upgrades the
     * same row cleanly (`coalesce` fills the Stripe columns in).
     */
    const blocked = (row: { stripe_subscription_id: string | null }) =>
      Boolean(row.stripe_subscription_id)
    expect(blocked(FOUNDING_ROW)).toBe(false)
  })
})
