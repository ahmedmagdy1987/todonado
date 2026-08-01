// NOTE: relative imports MUST carry the .js extension. package.json is
// `"type": "module"`, so these compile to ESM, and Node's ESM resolver does not
// do extension guessing — an extensionless specifier throws ERR_MODULE_NOT_FOUND
// at module load, which Vercel surfaces as FUNCTION_INVOCATION_FAILED (a bare
// 500 on EVERY request, before any handler code runs).
import {
  serverEnv,
  missingServerBillingVars,
  isValidPriceId,
  isConfiguredPriceId,
  resolveAppBaseUrl,
  stripeModeProblems,
  livemodeMatches,
} from './_lib/config.js'
import { getStripe } from './_lib/stripe.js'
import { getSupabaseAdmin, getUserFromAuthHeader } from './_lib/supabase.js'
import { apiError, json, redactSecrets, withErrorBoundary } from './_lib/http.js'
import { toNodeHandler } from './_lib/nodeAdapter.js'
import { enforceRateLimit } from './_lib/rateLimit.js'

/**
 * Stripe subscription statuses that mean "this user already has a subscription
 * we must not duplicate".
 *
 * DELIBERATELY WIDER THAN THE STATUSES THAT GRANT PRO. `incomplete` and
 * `unpaid` do not buy anything, but a second Checkout Session while one of them
 * is outstanding is exactly how a customer ends up paying twice — the first
 * subscription can still transition to active on its own. Only genuinely
 * TERMINAL states (`canceled`, `incomplete_expired`) release the block.
 */
const BLOCKING_SUBSCRIPTION_STATUSES = new Set([
  'active',
  'trialing',
  'past_due',
  'unpaid',
  'paused',
  'incomplete',
])

/** Attempt states that still occupy the one-open-attempt slot. */
type AttemptRow = {
  id: string
  user_id: string
  price_id: string
  status: string
  stripe_session_id: string | null
}

/**
 * POST /api/create-checkout-session
 * Body: { priceId: string }
 *
 * Verifies the caller's Supabase JWT, reserves a DURABLE checkout attempt in
 * Postgres, then creates (or recovers) exactly one Stripe Checkout Session for
 * it. Returns { url }.
 *
 * WHY THERE IS A DATABASE ROW BEFORE STRIPE IS CALLED.
 *
 * The previous design refused a duplicate purchase by reading the `billing`
 * row, which only reflects reality after a webhook lands, and de-duplicated
 * with a Stripe idempotency key derived from a 10-minute wall-clock bucket.
 * Both are insufficient:
 *   - two requests on two Vercel instances both see Free and both create a
 *     session, and both can be paid;
 *   - the bucket collapses nothing across its own boundary;
 *   - and it collapses nothing at all when one request says monthly and the
 *     other says yearly, because the key contained the price.
 *
 * `checkout_attempts` has a PARTIAL UNIQUE INDEX on user_id over the
 * non-terminal statuses, so the database — not this code — guarantees one open
 * attempt per user. The idempotency key is derived from the attempt's uuid, so
 * it is stable across a crash, a retry, and a change of mind about the plan.
 */
async function checkout(req: Request): Promise<Response> {
  if (req.method !== 'POST') return apiError(405, 'method_not_allowed')

  const env = serverEnv()

  /*
   * TWO CONFIG CHECKS, AND THE ORDER IS THE FIX. Authentication itself needs
   * the Supabase pair, so that much is checked first and answers WITHOUT names
   * (the caller is still anonymous); the useful list comes only once we know
   * who is asking.
   */
  if (!env.supabaseUrl || !env.supabaseServiceRoleKey) return apiError(503, 'not_configured')

  const user = await getUserFromAuthHeader(
    req.headers.get('authorization'),
    env.supabaseUrl,
    env.supabaseServiceRoleKey,
  )
  if (!user) return apiError(401, 'unauthorized')

  const limit = enforceRateLimit('billing', user.id, req)
  if (!limit.allowed) {
    return apiError(429, 'rate_limited', { retry_after: limit.retryAfterSeconds })
  }

  const missing = missingServerBillingVars(env)
  if (missing.length > 0) return apiError(503, 'billing_not_configured', { missing })

  /*
   * MODE CONSISTENCY IS A PRECONDITION FOR SELLING ANYTHING.
   *
   * A live secret key paired with test price ids, or a test publishable key
   * baked into a live build, produces failures that look like everything except
   * what they are. Codes only — never values.
   */
  const modeProblems = stripeModeProblems(env)
  if (modeProblems.length > 0) {
    console.error('[api/create-checkout-session] Stripe mode inconsistency:', modeProblems.join(', '))
    return apiError(503, 'billing_misconfigured', { problems: modeProblems })
  }

  let body: { priceId?: unknown } = {}
  try {
    body = (await req.json()) as { priceId?: unknown }
  } catch {
    /* empty/invalid body handled below */
  }
  if (body.priceId == null || body.priceId === '') return apiError(400, 'missing_price_id')
  if (!isValidPriceId(body.priceId)) return apiError(400, 'invalid_price')
  if (!isConfiguredPriceId(body.priceId, env)) {
    console.warn(
      '[api/create-checkout-session] rejected a price this deployment does not sell for user',
      user.id,
    )
    return apiError(400, 'invalid_price')
  }
  const requestedPriceId = body.priceId

  const { baseUrl, invalid: baseUrlInvalid } = resolveAppBaseUrl(env)
  if (baseUrlInvalid) {
    console.error(
      '[api/create-checkout-session] APP_BASE_URL is not a usable https origin — ' +
        `falling back to ${baseUrl}. Fix the Vercel env var.`,
    )
  }

  const admin = getSupabaseAdmin(env.supabaseUrl, env.supabaseServiceRoleKey)

  /*
   * IS THERE ALREADY A TODONADO SUBSCRIPTION?
   *
   * Scoped to the subscription id THIS app bound. HBV Studio runs other
   * products in the same Stripe account and the same person may be a customer
   * of several; none of that is Todonado's business, and asking Stripe "does
   * this customer have subscriptions" would sweep them in.
   */
  const { data: existing, error: billingError } = await admin
    .from('billing')
    .select('stripe_customer_id, stripe_subscription_id, subscription_status')
    .eq('user_id', user.id)
    .maybeSingle()

  if (billingError) {
    console.error(
      '[api/create-checkout-session] billing lookup failed:',
      redactSecrets(billingError.message),
    )
    return apiError(500, 'billing_lookup_failed')
  }

  if (
    existing?.stripe_subscription_id &&
    BLOCKING_SUBSCRIPTION_STATUSES.has(existing.subscription_status ?? '')
  ) {
    return apiError(409, 'already_subscribed')
  }

  // ── Reserve, atomically and across instances ──────────────────────────────
  const { data: reserved, error: reserveError } = await admin.rpc('reserve_checkout_attempt', {
    p_user_id: user.id,
    p_price_id: requestedPriceId,
  })
  if (reserveError || !reserved) {
    if (isMissingCheckoutSchema(reserveError)) {
      console.error(
        '[api/create-checkout-session] checkout_attempts is missing — apply ' +
          'supabase/migrations/20260801150000_checkout_attempts.sql. Detail:',
        redactSecrets(reserveError?.message ?? ''),
      )
      return apiError(503, 'billing_schema_outdated')
    }
    console.error(
      '[api/create-checkout-session] could not reserve an attempt:',
      redactSecrets(reserveError?.message ?? 'no row returned'),
    )
    return apiError(500, 'checkout_reservation_failed')
  }

  const attempt = reserved as AttemptRow
  /*
   * THE RESERVED PLAN WINS. If a second request names the other interval while
   * this attempt is open, it gets THIS attempt back — the same session, the
   * same price. Honouring the newer request would mean two sessions, which is
   * the whole thing being prevented.
   */
  const attemptPriceId = attempt.price_id

  const stripe = getStripe(env.stripeSecretKey)

  // ── Recover an existing session before creating anything ──────────────────
  if (attempt.stripe_session_id) {
    try {
      const session = await stripe.checkout.sessions.retrieve(attempt.stripe_session_id)

      if (!livemodeMatches(session.livemode, env)) {
        console.error(
          `[api/create-checkout-session] attempt ${attempt.id} holds a session from the ` +
            'wrong Stripe mode; refusing to reuse it',
        )
        await admin.rpc('mark_checkout_attempt', { p_attempt_id: attempt.id, p_status: 'failed' })
        return apiError(503, 'billing_misconfigured', { problems: ['SESSION_MODE_MISMATCH'] })
      }

      /*
       * STATE COMES FROM STRIPE, NEVER FROM A LOCAL TTL. Expiring a reservation
       * because a wall clock elapsed would release the slot while the customer
       * still had a payable session open in another tab.
       */
      if (session.status === 'open' && session.url) {
        return json(200, { url: session.url, reused: true })
      }
      if (session.status === 'complete') {
        // Paid, webhook not yet processed. Blocking here is the point.
        await admin.rpc('mark_checkout_attempt', {
          p_attempt_id: attempt.id,
          p_status: 'completed',
        })
        return apiError(409, 'checkout_awaiting_confirmation')
      }
      if (session.status === 'expired') {
        // Terminal — release the slot and reserve fresh below.
        await admin.rpc('mark_checkout_attempt', { p_attempt_id: attempt.id, p_status: 'expired' })
        return await reserveAndCreate(
          admin,
          stripe,
          user,
          requestedPriceId,
          baseUrl,
          existing?.stripe_customer_id ?? null,
        )
      }
    } catch (err) {
      /*
       * A session id we hold that Stripe will not return is not a reason to
       * lock the user out forever. Mark the attempt failed (terminal) so the
       * next request can reserve cleanly.
       */
      console.error(
        `[api/create-checkout-session] could not retrieve session for attempt ${attempt.id}:`,
        redactSecrets(err instanceof Error ? err.message : 'unknown'),
      )
      await admin.rpc('mark_checkout_attempt', { p_attempt_id: attempt.id, p_status: 'failed' })
      return apiError(502, 'stripe_error')
    }
  }

  return await createSessionForAttempt(
    admin,
    stripe,
    user,
    attempt.id,
    attemptPriceId,
    baseUrl,
    existing?.stripe_customer_id ?? null,
  )
}

/** Reserve a fresh attempt (after a terminal one) and create its session. */
async function reserveAndCreate(
  admin: ReturnType<typeof getSupabaseAdmin>,
  stripe: ReturnType<typeof getStripe>,
  user: { id: string; email: string | null },
  priceId: string,
  baseUrl: string,
  customerId: string | null,
): Promise<Response> {
  const { data: fresh, error } = await admin.rpc('reserve_checkout_attempt', {
    p_user_id: user.id,
    p_price_id: priceId,
  })
  if (error || !fresh) {
    console.error(
      '[api/create-checkout-session] re-reservation failed:',
      redactSecrets(error?.message ?? 'no row'),
    )
    return apiError(500, 'checkout_reservation_failed')
  }
  const attempt = fresh as AttemptRow
  return await createSessionForAttempt(
    admin,
    stripe,
    user,
    attempt.id,
    attempt.price_id,
    baseUrl,
    customerId,
  )
}

/**
 * Create the Stripe Checkout Session for a reserved attempt.
 *
 * THE IDEMPOTENCY KEY IS THE ATTEMPT ID, and that is what makes the crash case
 * recoverable. If Stripe creates the session and this process dies before the
 * id is persisted, the retry reserves the SAME attempt (the row is still
 * non-terminal), sends the SAME key, and Stripe returns the SAME session rather
 * than a second one.
 */
async function createSessionForAttempt(
  admin: ReturnType<typeof getSupabaseAdmin>,
  stripe: ReturnType<typeof getStripe>,
  user: { id: string; email: string | null },
  attemptId: string,
  priceId: string,
  baseUrl: string,
  customerId: string | null,
): Promise<Response> {
  try {
    const session = await stripe.checkout.sessions.create(
      {
        mode: 'subscription',
        line_items: [{ price: priceId, quantity: 1 }],
        client_reference_id: attemptId,
        /*
         * `attempt_id` is the identity root. It is server-generated, unguessable
         * (gen_random_uuid is CSPRNG-backed) and exists in our database before
         * Stripe is called, so a session quoting it proves the checkout came
         * from us. `user_id` is kept for human debugging ONLY — the webhook
         * resolves identity through the attempt row, never through this value.
         */
        metadata: { attempt_id: attemptId, user_id: user.id, price_id: priceId },
        subscription_data: { metadata: { attempt_id: attemptId, user_id: user.id } },
        ...(customerId ? { customer: customerId } : { customer_email: user.email ?? undefined }),
        allow_promotion_codes: true,
        success_url: `${baseUrl}/settings/plan?checkout=success`,
        cancel_url: `${baseUrl}/settings/plan?checkout=cancel`,
      },
      { idempotencyKey: `todonado_checkout_attempt_${attemptId}` },
    )

    if (!session.url) return apiError(502, 'stripe_error')

    // Persist AFTER creation. If this write fails the attempt stays 'reserved'
    // and the idempotency key recovers the same session on the next try.
    await admin.rpc('mark_checkout_attempt', {
      p_attempt_id: attemptId,
      p_status: 'session_created',
      p_session_id: session.id,
    })

    return json(200, { url: session.url })
  } catch (err) {
    const message = redactSecrets(err instanceof Error ? err.message : 'Checkout failed')
    console.error('[api/create-checkout-session] stripe error:', message)
    /*
     * Terminal, so a Stripe outage cannot leave someone permanently unable to
     * subscribe. The attempt is released; the next request reserves a new one.
     */
    await admin.rpc('mark_checkout_attempt', { p_attempt_id: attemptId, p_status: 'failed' })
    return apiError(502, 'stripe_error')
  }
}

/** Has 20260801150000_checkout_attempts.sql not been applied? */
function isMissingCheckoutSchema(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false
  const message = error.message ?? ''
  return (
    error.code === '42P01' || // undefined table
    error.code === '42883' || // undefined function
    error.code === 'PGRST202' ||
    error.code === 'PGRST205' ||
    /checkout_attempts|reserve_checkout_attempt/.test(message)
  )
}

/** Web-shaped handler — exported for unit tests. */
export const webHandler = withErrorBoundary(checkout)
/** Vercel invokes the legacy (req, res) contract — see _lib/nodeAdapter.ts. */
export default toNodeHandler(webHandler)
