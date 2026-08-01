// Relative imports MUST carry .js — see the note in create-checkout-session.ts.
import { serverEnv, missingWebhookVars, configuredPriceIds } from './_lib/config.js'
import { getStripe } from './_lib/stripe.js'
import { getSupabaseAdmin } from './_lib/supabase.js'
import { apiError, json, redactSecrets, withErrorBoundary } from './_lib/http.js'
import { toNodeHandler } from './_lib/nodeAdapter.js'
// Leaf module from src/ (no `@/` imports) — safe for Vercel to bundle here.
import {
  mapStripeEventToBilling,
  priceIdsForEvent,
  type MinimalStripeEvent,
} from '../src/features/billing/webhookMapping.js'
import {
  decideWebhookWrite,
  type BillingRowState,
} from '../src/features/billing/webhookOrdering.js'

/** The columns the ordering decision reads — this string IS `BillingRowState`. */
const ORDERING_COLUMNS = 'plan, stripe_subscription_id, last_stripe_event_id, last_stripe_event_at'

/**
 * Does this failure mean `20260801140000_billing_event_ordering.sql` has not
 * been applied? Postgres raises 42703 for an undefined column and PostgREST can
 * surface a schema-cache miss instead, so both are matched — plus the column
 * name itself, which keeps an unrelated 42703 from being misreported as a
 * missing migration.
 */
function isMissingOrderingColumn(error: { code?: string; message?: string }): boolean {
  return (
    error.code === '42703' ||
    error.code === 'PGRST204' ||
    /last_stripe_event_(id|at)/.test(error.message ?? '')
  )
}

/**
 * POST /api/stripe-webhook
 *
 * RAW-body Stripe signature verification, then a READ → DECIDE → CONDITIONAL
 * WRITE against the caller's billing row via the SERVICE-ROLE key (bypasses
 * RLS). Handles:
 *   - checkout.session.completed
 *   - customer.subscription.updated
 *   - customer.subscription.deleted
 * Unknown events → 200 no-op. The Web-signature handler gives us the exact raw
 * body via req.text(), which is what constructEvent needs to verify.
 *
 * WHY IT IS NO LONGER A BLIND UPSERT (audit FLAG-3).
 *
 * It used to be `upsert(row, {onConflict:'user_id'})` and nothing else, which
 * means whatever arrives LAST wins. Stripe retries deliveries and retries
 * arrive out of order, so a redelivered `customer.subscription.deleted` landing
 * after a newer `checkout.session.completed` silently downgraded a paying
 * customer. That needs no attacker — it is Stripe's documented retry behaviour
 * meeting a write with no memory of what it already applied.
 *
 * The row now carries a high-water mark (`last_stripe_event_id`,
 * `last_stripe_event_at`). `webhookOrdering.ts` decides; this handler enforces
 * with a compare-and-swap so two concurrent deliveries cannot both win.
 */
async function webhook(req: Request): Promise<Response> {
  if (req.method !== 'POST') return apiError(405, 'method_not_allowed')

  const env = serverEnv()
  /*
   * NAMES GO TO THE LOG, NOT TO THE CALLER.
   *
   * The other endpoints can name the unset variables once they know who is
   * asking. This one never does: its caller is Stripe, identified by a
   * signature it cannot check until `STRIPE_WEBHOOK_SECRET` is set — which is
   * one of the very variables in question. So there is no point at which a
   * trusted caller exists, and the list simply must not be in the response.
   */
  const missing = missingWebhookVars(env)
  if (missing.length > 0) {
    console.error('[api/stripe-webhook] not configured, missing:', missing.join(', '))
    return apiError(503, 'not_configured')
  }

  const signature = req.headers.get('stripe-signature')
  if (!signature) return apiError(400, 'missing_signature')

  const rawBody = await req.text()
  const stripe = getStripe(env.stripeSecretKey)

  let event: MinimalStripeEvent
  try {
    event = stripe.webhooks.constructEvent(
      rawBody,
      signature,
      env.stripeWebhookSecret,
    ) as unknown as MinimalStripeEvent
  } catch (err) {
    const message = redactSecrets(err instanceof Error ? err.message : 'Invalid signature')
    console.error('[api/stripe-webhook] signature verification failed:', message)
    return apiError(400, 'invalid_signature')
  }

  /*
   * Mapped once here only to learn WHOSE row to read; the authoritative mapping
   * happens inside decideWebhookWrite, which owns the whole decision.
   */
  const preview = mapStripeEventToBilling(event)
  if (!preview) return json(200, { received: true }) // unknown / no-op event

  const admin = getSupabaseAdmin(env.supabaseUrl, env.supabaseServiceRoleKey)

  // READ — the state we are about to reason against.
  const { data: current, error: readError } = await admin
    .from('billing')
    .select(ORDERING_COLUMNS)
    .eq('user_id', preview.user_id)
    .maybeSingle()

  if (readError) {
    /*
     * FAIL CLOSED IF THE MIGRATION IS NOT IN. There is deliberately no
     * fallback to the old blind upsert: this is the billing path, and silently
     * degrading to the behaviour that caused FLAG-3 is worse than refusing.
     * Stripe retries a 503, so once the migration lands the queued events
     * deliver normally and nothing is lost.
     */
    if (isMissingOrderingColumn(readError)) {
      console.error(
        '[api/stripe-webhook] billing is missing the event-ordering columns — apply ' +
          'supabase/migrations/20260801140000_billing_event_ordering.sql. ' +
          'Refusing to write. Detail:',
        redactSecrets(readError.message),
      )
      return apiError(503, 'billing_schema_outdated')
    }
    console.error('[api/stripe-webhook] billing read failed:', redactSecrets(readError.message))
    return apiError(500, 'billing_read_failed')
  }

  // DECIDE — pure, and unit-tested in webhookOrdering.test.ts.
  const decision = decideWebhookWrite(event, current as BillingRowState | null)
  if (decision.action === 'skip') {
    /*
     * A skip is a SUCCESS. Answering anything but 2xx would make Stripe retry
     * an event we have deliberately declined, forever.
     */
    console.warn(
      `[api/stripe-webhook] ignoring event ${event.id ?? '<no id>'} (${event.type}): ${decision.reason}`,
    )
    return json(200, { received: true, skipped: decision.reason })
  }

  /*
   * VERIFY WHAT WAS BOUGHT BEFORE GRANTING ANYTHING (audit FLAG-2).
   *
   * The webhook used to grant `plan: 'pro'` for any completed checkout without
   * inspecting the purchase. Paired with a checkout endpoint that accepted any
   * price id, that meant a subscription at ANY recurring price in the account
   * bought the full paid tier.
   *
   * The check is asymmetric on purpose, and it is the same asymmetry as the
   * ordering guard: GRANTING requires proof, REVOKING does not. A cancellation
   * of a subscription on a price we no longer sell must still be honoured, or
   * retiring a price would strand its subscribers on Pro forever.
   */
  if (decision.upsert.plan === 'pro') {
    const allowed = configuredPriceIds(env)
    const purchased = priceIdsForEvent(event)
    const unrecognised = purchased.filter((id) => !allowed.includes(id))

    if (purchased.length === 0 || unrecognised.length > 0) {
      // LOUDLY: this is either a misconfiguration or someone buying something
      // we do not sell, and both need a human to look.
      console.error(
        '[api/stripe-webhook] REFUSING to grant Pro — event ' +
          `${event.id ?? '<no id>'} (${event.type}) for user ${decision.upsert.user_id} ` +
          (purchased.length === 0
            ? 'carried no readable price id'
            : `named unconfigured price(s): ${unrecognised.join(', ')}`) +
          '. Check STRIPE_PRICE_MONTHLY / STRIPE_PRICE_YEARLY against the Stripe dashboard.',
      )
      return json(200, { received: true, skipped: 'unrecognised_price' })
    }
  }

  const row = {
    ...decision.upsert,
    last_stripe_event_id: decision.eventId,
    last_stripe_event_at: decision.eventAt,
  }

  // WRITE — compare-and-swap, so a concurrent newer delivery cannot be undone.
  if (current === null) {
    const { error } = await admin.from('billing').insert(row)
    if (error) {
      /*
       * 23505 means another delivery inserted this user's row between our read
       * and our write. That delivery applied its own ordering decision, so the
       * safe move is to let it stand — Stripe will redeliver ours if it still
       * matters, and by then there is a row to compare against.
       */
      if (error.code === '23505') {
        console.warn('[api/stripe-webhook] lost the insert race, deferring to the concurrent write')
        return json(200, { received: true, skipped: 'insert_race' })
      }
      console.error('[api/stripe-webhook] billing insert failed:', redactSecrets(error.message))
      return apiError(500, 'billing_upsert_failed')
    }
    return json(200, { received: true })
  }

  const { data: updated, error } = await admin
    .from('billing')
    .update(row)
    .eq('user_id', row.user_id)
    // The guard repeats the ordering check IN THE STATEMENT, so a newer event
    // that landed since our read cannot be overwritten by this one.
    .or(`last_stripe_event_at.is.null,last_stripe_event_at.lte.${decision.eventAt}`)
    .select('user_id')

  if (error) {
    console.error('[api/stripe-webhook] billing update failed:', redactSecrets(error.message))
    return apiError(500, 'billing_upsert_failed')
  }
  if (!updated || updated.length === 0) {
    // Lost the race to a newer event. Correct, and not a failure.
    console.warn(
      `[api/stripe-webhook] event ${decision.eventId} superseded by a newer write, no-op`,
    )
    return json(200, { received: true, skipped: 'superseded' })
  }

  return json(200, { received: true })
}

/** Web-shaped handler — exported for unit tests. */
export const webHandler = withErrorBoundary(webhook)
/** Vercel invokes the legacy (req, res) contract — see _lib/nodeAdapter.ts. */
export default toNodeHandler(webHandler)
