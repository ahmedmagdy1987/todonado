// Relative imports MUST carry .js — see the note in create-checkout-session.ts.
import {
  serverEnv,
  missingWebhookVars,
  configuredPriceIds,
  livemodeMatches,
  stripeModeProblems,
} from './_lib/config.js'
import { getStripe } from './_lib/stripe.js'
import { getSupabaseAdmin } from './_lib/supabase.js'
import { apiError, json, redactSecrets, withErrorBoundary } from './_lib/http.js'
import { toNodeHandler } from './_lib/nodeAdapter.js'
// Leaf module from src/ (no `@/` imports) — safe for Vercel to bundle here.
import {
  planForStatus,
  priceIdsForSubscription,
  type MinimalStripeEvent,
  type MinimalSubscription,
} from '../src/features/billing/webhookMapping.js'

/** A uuid, and nothing else, is a usable attempt id. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Has one of the two pending billing migrations not been applied? */
function isMissingBillingSchema(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false
  const message = error.message ?? ''
  return (
    error.code === '42703' || // undefined column
    error.code === '42883' || // undefined function
    error.code === '42P01' || // undefined table
    error.code === 'PGRST202' ||
    error.code === 'PGRST204' ||
    error.code === 'PGRST205' ||
    /last_stripe_event_|apply_stripe_billing_event|checkout_attempts|bind_verified_checkout|apply_stripe_subscription_event/.test(
      message,
    )
  )
}

/**
 * POST /api/stripe-webhook
 *
 * RAW-body Stripe signature verification, then ONE atomic database call via the
 * SERVICE-ROLE key (bypasses RLS).
 *
 * IDENTITY COMES FROM OUR OWN DATABASE, NOT FROM STRIPE METADATA.
 *
 * This handler used to resolve the user from `metadata.user_id` and accept a
 * `metadata.price_id` we had stamped ourselves as proof of what was bought.
 * Both are proof of INTENT, not of purchase:
 *   - a Checkout Session created by hand in the Stripe Dashboard with
 *     `metadata.user_id` set would have granted that user Pro;
 *   - this Stripe account belongs to HBV Studio and holds other products, so
 *     any subscription carrying a `user_id` key could move a Todonado row.
 *
 * There are now exactly two ways a billing row can change:
 *
 *  1. `checkout.session.completed` — locates a SERVER-CREATED attempt row by
 *     its unguessable uuid, then RETRIEVES the Session and the Subscription
 *     from Stripe and verifies them before `bind_verified_checkout` consumes
 *     the attempt and writes billing, atomically.
 *
 *  2. `customer.subscription.*` — resolves the user by the subscription id that
 *     a verified checkout previously bound (`apply_stripe_subscription_event`).
 *     A subscription we never bound returns `unknown_subscription` and writes
 *     nothing, which is what keeps HBV's other products out.
 *
 * Ordering and downgrade rules are unchanged and still live only in
 * 20260801140000_billing_event_ordering.sql.
 */
async function webhook(req: Request): Promise<Response> {
  if (req.method !== 'POST') return apiError(405, 'method_not_allowed')

  const env = serverEnv()
  /*
   * NAMES GO TO THE LOG, NOT TO THE CALLER. This endpoint's caller is Stripe,
   * identified by a signature it cannot check until STRIPE_WEBHOOK_SECRET is
   * set — one of the very variables in question — so there is no point at which
   * a trusted caller exists and the list must not be in the response.
   */
  const missing = missingWebhookVars(env)
  if (missing.length > 0) {
    console.error('[api/stripe-webhook] not configured, missing:', missing.join(', '))
    return apiError(503, 'not_configured')
  }

  const modeProblems = stripeModeProblems(env)
  if (modeProblems.length > 0) {
    /*
     * REFUSE RATHER THAN GUESS. A mode-inconsistent deployment must not write
     * billing at all — in particular it must never DOWNGRADE an existing payer
     * because a misconfiguration made their subscription look foreign.
     */
    console.error('[api/stripe-webhook] Stripe mode inconsistency:', modeProblems.join(', '))
    return apiError(503, 'billing_misconfigured')
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
   * A TEST EVENT MUST NOT TOUCH LIVE BILLING, AND VICE VERSA. Both endpoints
   * can be armed at once during a switch, and a signature only proves the event
   * came from Stripe — not from the mode we are running.
   */
  if (!livemodeMatches(event.livemode, env)) {
    console.error(
      `[api/stripe-webhook] refusing event ${event.id ?? '<no id>'}: livemode=${String(
        event.livemode,
      )} does not match STRIPE_MODE=${env.stripeMode}`,
    )
    return json(200, { received: true, skipped: 'livemode_mismatch' })
  }

  const eventId = typeof event.id === 'string' && event.id.length > 0 ? event.id : null
  const createdMs =
    typeof event.created === 'number' && Number.isFinite(event.created)
      ? event.created * 1000
      : null
  if (eventId === null || createdMs === null) {
    console.error(`[api/stripe-webhook] event with no usable id/created (${event.type})`)
    return json(200, { received: true, skipped: 'missing_event_identity' })
  }
  const eventAt = new Date(createdMs).toISOString()

  const admin = getSupabaseAdmin(env.supabaseUrl, env.supabaseServiceRoleKey)

  if (event.type === 'checkout.session.completed') {
    return await handleCheckoutCompleted(event, { admin, stripe, env, eventId, eventAt })
  }
  if (event.type === 'customer.subscription.updated' || event.type === 'customer.subscription.deleted') {
    return await handleSubscriptionLifecycle(event, { admin, eventId, eventAt })
  }

  // Anything else is acknowledged and ignored — never retried forever.
  return json(200, { received: true, skipped: 'unhandled_event_type' })
}

interface Ctx {
  admin: ReturnType<typeof getSupabaseAdmin>
  stripe: ReturnType<typeof getStripe>
  env: ReturnType<typeof serverEnv>
  eventId: string
  eventAt: string
}

/**
 * The only path that may GRANT Pro.
 *
 * Every fact used here is retrieved from Stripe, not read from the event
 * payload. The event tells us WHICH session to look at; Stripe tells us what
 * that session actually is.
 */
async function handleCheckoutCompleted(
  event: MinimalStripeEvent,
  { admin, stripe, env, eventId, eventAt }: Ctx,
): Promise<Response> {
  const object = event.data.object as {
    id?: string | null
    metadata?: { attempt_id?: string | null } | null
    client_reference_id?: string | null
  }

  const sessionId = typeof object.id === 'string' ? object.id : null
  const attemptId = object.metadata?.attempt_id ?? object.client_reference_id ?? null

  if (!sessionId) {
    console.error('[api/stripe-webhook] checkout.session.completed with no session id')
    return json(200, { received: true, skipped: 'missing_session_id' })
  }

  /*
   * NO ATTEMPT ID, NO GRANT. This is what stops a Session created by hand in
   * the Stripe Dashboard, or by another HBV integration, from buying Todonado
   * Pro: neither can produce a uuid that exists in our checkout_attempts table.
   */
  if (typeof attemptId !== 'string' || !UUID_RE.test(attemptId)) {
    console.error(
      `[api/stripe-webhook] session ${sessionId} carries no valid attempt id — refusing to grant`,
    )
    return json(200, { received: true, skipped: 'missing_attempt' })
  }

  let session: {
    id: string
    mode?: string | null
    status?: string | null
    livemode?: boolean | null
    customer?: string | null
    subscription?: string | null
  }
  let subscription: MinimalSubscription & { livemode?: boolean | null }

  try {
    session = (await stripe.checkout.sessions.retrieve(sessionId)) as typeof session

    if (session.mode !== 'subscription') {
      console.error(`[api/stripe-webhook] session ${sessionId} is mode=${session.mode}, not subscription`)
      return json(200, { received: true, skipped: 'not_a_subscription_session' })
    }
    if (session.status !== 'complete') {
      console.error(`[api/stripe-webhook] session ${sessionId} status=${session.status}, not complete`)
      return json(200, { received: true, skipped: 'session_not_complete' })
    }
    if (!livemodeMatches(session.livemode, env)) {
      console.error(`[api/stripe-webhook] session ${sessionId} livemode does not match STRIPE_MODE`)
      return json(200, { received: true, skipped: 'livemode_mismatch' })
    }

    const customerId = typeof session.customer === 'string' ? session.customer : null
    const subscriptionId = typeof session.subscription === 'string' ? session.subscription : null
    if (!customerId || !subscriptionId) {
      console.error(`[api/stripe-webhook] session ${sessionId} lacks a real customer/subscription`)
      return json(200, { received: true, skipped: 'incomplete_session_objects' })
    }

    subscription = (await stripe.subscriptions.retrieve(subscriptionId)) as typeof subscription
    if (!livemodeMatches(subscription.livemode, env)) {
      console.error(`[api/stripe-webhook] subscription ${subscriptionId} livemode mismatch`)
      return json(200, { received: true, skipped: 'livemode_mismatch' })
    }

    /*
     * THE SUBSCRIPTION'S OWN ITEMS ARE THE PROOF OF PURCHASE. Not the event,
     * not our metadata. Exactly one item, and its price must be one we sell —
     * a bundle containing a Todonado price alongside another HBV product is
     * not a Todonado subscription and is refused rather than partially honoured.
     */
    const purchased = priceIdsForSubscription(subscription)
    const allowed = configuredPriceIds(env)
    if (purchased.length !== 1 || !allowed.includes(purchased[0])) {
      console.error(
        `[api/stripe-webhook] REFUSING to grant Pro — subscription ${subscriptionId} carries ` +
          `price(s) [${purchased.join(', ')}], which is not exactly one configured Todonado price.`,
      )
      return json(200, { received: true, skipped: 'unrecognised_price' })
    }

    /*
     * ENTITLEMENT COMES FROM THE SUBSCRIPTION'S CURRENT STATUS, NOT FROM THE
     * FACT THAT A SESSION COMPLETED.
     *
     * A Session can be `complete` while the Subscription it created is
     * `incomplete` (SCA never finished), `unpaid`, `paused`, or already
     * `canceled` by the time this webhook is processed. Binding and granting
     * are two different decisions: the binding always happens so the attempt is
     * consumed and the subscription id is recorded, but the plan is whatever
     * `planForStatus` says about the status Stripe reports right now.
     */
    const grantedPlan = planForStatus(subscription.status)

    const { data: outcome, error } = await admin.rpc('bind_verified_checkout', {
      p_attempt_id: attemptId,
      p_event_id: eventId,
      p_event_at: eventAt,
      p_customer_id: customerId,
      p_subscription_id: subscriptionId,
      p_price_id: purchased[0],
      p_status: subscription.status ?? null,
      p_period_end: toIso(subscription.current_period_end),
      p_plan: grantedPlan,
    })

    if (error) return schemaOrServerError(error, 'bind_verified_checkout')

    const result = typeof outcome === 'string' ? outcome : 'applied'
    if (result !== 'applied') {
      console.warn(`[api/stripe-webhook] event ${eventId} not applied: ${result}`)
      return json(200, { received: true, skipped: result })
    }
    if (grantedPlan !== 'pro') {
      // Bound, consumed, and deliberately NOT entitled. Recorded loudly because
      // the customer completed a checkout and does not have Pro; a later
      // customer.subscription.updated is what upgrades them.
      console.warn(
        `[api/stripe-webhook] bound ${subscriptionId} for attempt ${attemptId} but the ` +
          `subscription is '${subscription.status}', so the plan stays free`,
      )
    }
    return json(200, { received: true, plan: grantedPlan })
  } catch (err) {
    console.error(
      `[api/stripe-webhook] could not verify session ${sessionId}:`,
      redactSecrets(err instanceof Error ? err.message : 'unknown'),
    )
    // 500 so Stripe retries — a transient Stripe read must not silently drop a
    // real purchase.
    return apiError(500, 'billing_read_failed')
  }
}

/**
 * Lifecycle events, resolved through the subscription WE bound.
 *
 * This function cannot create a binding. If the subscription is not one a
 * verified checkout already bound, it writes nothing at all — which is exactly
 * what keeps HBV Studio's other products, and other subscriptions belonging to
 * the same Stripe customer, out of Todonado's billing row.
 */
async function handleSubscriptionLifecycle(
  event: MinimalStripeEvent,
  { admin, eventId, eventAt }: Omit<Ctx, 'stripe' | 'env'>,
): Promise<Response> {
  const sub = event.data.object as MinimalSubscription & { livemode?: boolean | null }
  const subscriptionId = typeof sub.id === 'string' ? sub.id : null
  if (!subscriptionId) {
    return json(200, { received: true, skipped: 'missing_subscription_id' })
  }

  const deleted = event.type === 'customer.subscription.deleted'
  const status = deleted ? 'canceled' : (sub.status ?? null)

  /*
   * A REVOCATION IS HONOURED REGARDLESS OF PRICE. Retiring a price must not
   * strand its subscribers on Pro forever, and the subscription id has already
   * proven this is our subscription. Grants are the asymmetric case and they
   * only ever happen in handleCheckoutCompleted.
   */
  const { data: outcome, error } = await admin.rpc('apply_stripe_subscription_event', {
    p_subscription_id: subscriptionId,
    p_event_id: eventId,
    p_event_at: eventAt,
    p_plan: deleted ? 'free' : planForStatus(status),
    p_customer_id: typeof sub.customer === 'string' ? sub.customer : null,
    p_status: status,
    p_period_end: toIso(sub.current_period_end),
    p_set_period_end: sub.current_period_end != null,
  })

  if (error) return schemaOrServerError(error, 'apply_stripe_subscription_event')

  const result = typeof outcome === 'string' ? outcome : 'applied'
  if (result !== 'applied') {
    console.warn(
      `[api/stripe-webhook] ${event.type} ${subscriptionId} not applied: ${result}`,
    )
    return json(200, { received: true, skipped: result })
  }
  return json(200, { received: true })
}

function schemaOrServerError(error: { code?: string; message?: string }, fn: string): Response {
  if (isMissingBillingSchema(error)) {
    console.error(
      `[api/stripe-webhook] ${fn} is unavailable — apply the pending billing migrations ` +
        '(20260801140000_billing_event_ordering, 20260801150000_checkout_attempts). ' +
        'Refusing to write. Detail:',
      redactSecrets(error.message ?? ''),
    )
    return apiError(503, 'billing_schema_outdated')
  }
  console.error(`[api/stripe-webhook] ${fn} failed:`, redactSecrets(error.message ?? ''))
  return apiError(500, 'billing_upsert_failed')
}

/** Unix seconds → ISO, or null. */
function toIso(unixSeconds: number | null | undefined): string | null {
  if (unixSeconds == null || !Number.isFinite(unixSeconds)) return null
  return new Date(unixSeconds * 1000).toISOString()
}

/** Web-shaped handler — exported for unit tests. */
export const webHandler = withErrorBoundary(webhook)
/** Vercel invokes the legacy (req, res) contract — see _lib/nodeAdapter.ts. */
export default toNodeHandler(webHandler)
