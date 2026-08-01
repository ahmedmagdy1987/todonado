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

/**
 * Does this failure mean `20260801140000_billing_event_ordering.sql` has not
 * been applied? Postgres raises 42703 for an undefined column and 42883 for an
 * undefined function; PostgREST surfaces a schema-cache miss instead. All are
 * matched, plus the identifier names, which keeps an unrelated error of the
 * same code from being misreported as a missing migration.
 */
function isMissingOrderingSchema(error: { code?: string; message?: string }): boolean {
  const message = error.message ?? ''
  return (
    error.code === '42703' || // undefined column
    error.code === '42883' || // undefined function
    error.code === 'PGRST202' || // PostgREST: function not found in schema cache
    error.code === 'PGRST204' ||
    /last_stripe_event_(id|at)/.test(message) ||
    /apply_stripe_billing_event/.test(message)
  )
}

/**
 * POST /api/stripe-webhook
 *
 * RAW-body Stripe signature verification, then ONE atomic database call via the
 * SERVICE-ROLE key (bypasses RLS). Handles:
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
 * `last_stripe_event_at`), and EVERY ordering rule is evaluated inside
 * `apply_stripe_billing_event`, under a row lock.
 *
 * The first version of this fix decided in JavaScript between a SELECT and an
 * UPDATE. That held the ordering but not the downgrade guards, which are
 * derived from the row as READ: two instances that both saw `plan='free'`
 * would each skip the "a downgrade must name the subscription we hold" check,
 * and a cancel for an old subscription could revoke access bought seconds
 * earlier. Reproduced in api/stripeWebhookConcurrency.test.ts. There is now no
 * JavaScript decision on the write path at all — the rules live in exactly one
 * place, the SQL, and api/billingEventOrderingMigration.test.ts pins them there.
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

  // Maps the event to the columns it is authoritative for. Ordering is NOT
  // decided here — that is the SQL function's job, under a lock.
  const preview = mapStripeEventToBilling(event)
  if (!preview) return json(200, { received: true }) // unknown / no-op event

  const admin = getSupabaseAdmin(env.supabaseUrl, env.supabaseServiceRoleKey)

  /*
   * VERIFY WHAT WAS BOUGHT BEFORE GRANTING ANYTHING (audit FLAG-2).
   *
   * Asymmetric on purpose, the same asymmetry as the ordering rules: GRANTING
   * requires proof, REVOKING does not. A cancellation on a price we retired
   * must still be honoured or its subscribers keep Pro forever.
   */
  if (preview.plan === 'pro') {
    const allowed = configuredPriceIds(env)
    const purchased = priceIdsForEvent(event)
    const unrecognised = purchased.filter((id) => !allowed.includes(id))

    if (purchased.length === 0 || unrecognised.length > 0) {
      console.error(
        '[api/stripe-webhook] REFUSING to grant Pro — event ' +
          `${event.id ?? '<no id>'} (${event.type}) for user ${preview.user_id} ` +
          (purchased.length === 0
            ? 'carried no readable price id'
            : `named unconfigured price(s): ${unrecognised.join(', ')}`) +
          '. Check STRIPE_PRICE_MONTHLY / STRIPE_PRICE_YEARLY against the Stripe dashboard.',
      )
      return json(200, { received: true, skipped: 'unrecognised_price' })
    }
  }

  /*
   * IDENTITY THE EVENT MUST CARRY. Both are optional in the type so mapping
   * fixtures need not invent them, but every event Stripe signs has both, and
   * one we can neither order nor de-duplicate is exactly what must be refused.
   */
  const eventId = typeof event.id === 'string' && event.id.length > 0 ? event.id : null
  const createdMs =
    typeof event.created === 'number' && Number.isFinite(event.created)
      ? event.created * 1000
      : null
  if (eventId === null || createdMs === null) {
    console.error(
      `[api/stripe-webhook] refusing an event with no usable id/created (${event.type})`,
    )
    return json(200, { received: true, skipped: 'missing_event_identity' })
  }

  /*
   * ONE ATOMIC DATABASE OPERATION — see the header of
   * 20260801140000_billing_event_ordering.sql for the interleaving that forced
   * this. `apply_stripe_billing_event` takes a row lock and evaluates every
   * ordering rule against LIVE state, so two Vercel instances that read the
   * same snapshot cannot both act on it. There is no read-then-write here, and
   * deliberately no JavaScript decision on the write path: the rules live in
   * exactly one place.
   */
  const { data: outcome, error } = await admin.rpc('apply_stripe_billing_event', {
    p_user_id: preview.user_id,
    p_event_id: eventId,
    p_event_at: new Date(createdMs).toISOString(),
    p_plan: preview.plan ?? 'free',
    p_customer_id: preview.stripe_customer_id ?? null,
    p_subscription_id: preview.stripe_subscription_id ?? null,
    p_status: preview.subscription_status ?? null,
    p_period_end: preview.current_period_end ?? null,
    // `checkout.session.completed` omits the key entirely; anything else that
    // resolved it (even to null) is authoritative for that column.
    p_set_period_end: Object.hasOwn(preview, 'current_period_end'),
  })

  if (error) {
    /*
     * FAIL CLOSED IF THE MIGRATION IS NOT IN. There is deliberately no fallback
     * to the old unordered upsert: silently degrading to the behaviour that
     * caused FLAG-3 is worse than refusing, and Stripe retries a 503.
     */
    if (isMissingOrderingSchema(error)) {
      console.error(
        '[api/stripe-webhook] apply_stripe_billing_event is missing — apply ' +
          'supabase/migrations/20260801140000_billing_event_ordering.sql. ' +
          'Refusing to write. Detail:',
        redactSecrets(error.message ?? ''),
      )
      return apiError(503, 'billing_schema_outdated')
    }
    console.error('[api/stripe-webhook] billing write failed:', redactSecrets(error.message ?? ''))
    return apiError(500, 'billing_upsert_failed')
  }

  const result = typeof outcome === 'string' ? outcome : 'applied'
  if (result !== 'applied') {
    /*
     * A skip is a SUCCESS. Anything but 2xx makes Stripe retry a decision we
     * made on purpose, forever.
     */
    console.warn(
      `[api/stripe-webhook] ignoring event ${eventId} (${event.type}): ${result}`,
    )
    return json(200, { received: true, skipped: result })
  }

  return json(200, { received: true })
}

/** Web-shaped handler — exported for unit tests. */
export const webHandler = withErrorBoundary(webhook)
/** Vercel invokes the legacy (req, res) contract — see _lib/nodeAdapter.ts. */
export default toNodeHandler(webHandler)
