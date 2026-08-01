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
} from './_lib/config.js'
import { getStripe } from './_lib/stripe.js'
import { getSupabaseAdmin, getUserFromAuthHeader } from './_lib/supabase.js'

/**
 * Statuses that mean "this person already has a live subscription". Mirrors
 * ACTIVE_STATUSES in src/features/billing/webhookMapping.ts — `past_due` counts,
 * because someone in dunning has a subscription that a second checkout would
 * duplicate rather than repair.
 */
const ACTIVE_STATUSES = new Set(['active', 'trialing', 'past_due'])
import { apiError, json, redactSecrets, withErrorBoundary } from './_lib/http.js'
import { toNodeHandler } from './_lib/nodeAdapter.js'
import { enforceRateLimit } from './_lib/rateLimit.js'

/**
 * POST /api/create-checkout-session
 * Body: { priceId: string }  (the client sends the resolved monthly|yearly price)
 *
 * Verifies the caller's Supabase JWT, then creates a Stripe Checkout Session
 * (subscription mode). user_id is stamped on the session (metadata +
 * client_reference_id) AND on the subscription (subscription_data.metadata) so
 * the webhook can resolve the user without a DB lookup. Returns { url }.
 */
async function checkout(req: Request): Promise<Response> {
  if (req.method !== 'POST') return apiError(405, 'method_not_allowed')

  const env = serverEnv()

  /*
   * TWO CONFIG CHECKS, AND THE ORDER IS THE FIX.
   *
   * The single check used to run before authentication and return the NAMES of
   * every unset variable. To an anonymous caller that is a free map of the
   * deployment: whether billing is live, whether the webhook is armed, and that
   * this function holds a service-role key. Values were never included; the
   * names alone were the leak.
   *
   * It cannot simply move after the auth check, because authentication itself
   * needs the Supabase pair. So it splits: what auth requires is checked first
   * and answers WITHOUT names (the caller is still anonymous), and the useful
   * list is returned only once we know who is asking.
   */
  if (!env.supabaseUrl || !env.supabaseServiceRoleKey) return apiError(503, 'not_configured')

  const user = await getUserFromAuthHeader(
    req.headers.get('authorization'),
    env.supabaseUrl,
    env.supabaseServiceRoleKey,
  )
  if (!user) return apiError(401, 'unauthorized')

  /*
   * RATE LIMIT, keyed on the VERIFIED user (audit FLAG-10). Placed after auth
   * so the counter names an account rather than a shared NAT address, and
   * before anything that costs money or makes an outbound request.
   * api/_lib/rateLimit.ts states plainly what this does and does not stop.
   */
  const limit = enforceRateLimit('billing', user.id, req)
  if (!limit.allowed) {
    return apiError(429, 'rate_limited', { retry_after: limit.retryAfterSeconds })
  }

  const missing = missingServerBillingVars(env)
  // Names only — never values.
  if (missing.length > 0) return apiError(503, 'billing_not_configured', { missing })

  let body: { priceId?: unknown } = {}
  try {
    body = (await req.json()) as { priceId?: unknown }
  } catch {
    /* empty/invalid body handled below */
  }
  if (body.priceId == null || body.priceId === '') return apiError(400, 'missing_price_id')
  /*
   * TWO CHECKS, AND ONLY THE SECOND ONE IS THE GATE (audit FLAG-2).
   *
   * The shape check is a cheap reject for obvious junk. It is NOT authorisation
   * — every real price in the Stripe account looks like `price_…`, so on its
   * own it let any authenticated user subscribe at ANY recurring price that
   * exists: a grandfathered price, an internal discount price, a partner price.
   *
   * The allow-list is the gate. It is built from STRIPE_PRICE_MONTHLY and
   * STRIPE_PRICE_YEARLY, which the request cannot influence, and it fails
   * closed when unset. A price id from the client is never trusted — it is only
   * ever compared.
   */
  if (!isValidPriceId(body.priceId)) return apiError(400, 'invalid_price')
  if (!isConfiguredPriceId(body.priceId, env)) {
    console.warn(
      '[api/create-checkout-session] rejected a price this deployment does not sell for user',
      user.id,
    )
    return apiError(400, 'invalid_price')
  }
  const priceId = body.priceId

  /*
   * THE RETURN URLS COME FROM SERVER CONFIG, NEVER FROM A HEADER (audit FLAG-4).
   *
   * This line used to be `req.headers.get('origin') ?? '…'`, interpolated
   * unvalidated into success_url and cancel_url. A header is attacker-supplied
   * input; using it meant anyone could mint a genuine checkout.stripe.com URL
   * on this merchant account that redirected to their own domain on completion.
   */
  const { baseUrl, invalid: baseUrlInvalid } = resolveAppBaseUrl(env)
  if (baseUrlInvalid) {
    console.error(
      '[api/create-checkout-session] APP_BASE_URL is not a usable https origin — ' +
        `falling back to ${baseUrl}. Fix the Vercel env var.`,
    )
  }

  /*
   * ONE OPEN SUBSCRIPTION PER USER (audit FLAG-14, first half).
   *
   * Checkout never looked at what the user already had, so a second successful
   * checkout created a SECOND paid subscription while `billing` — one row per
   * user — remembered only the last. The customer is then billed twice and the
   * app can only ever cancel one of them. Refusing here is the only place that
   * can see the whole picture before Stripe creates anything.
   */
  const admin = getSupabaseAdmin(env.supabaseUrl, env.supabaseServiceRoleKey)
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

  if (existing?.stripe_subscription_id && ACTIVE_STATUSES.has(existing.subscription_status ?? '')) {
    // Not an error the user caused — send them to the portal instead.
    return apiError(409, 'already_subscribed')
  }

  try {
    const stripe = getStripe(env.stripeSecretKey)
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      client_reference_id: user.id,
      /*
       * `price_id` is stamped alongside `user_id` so the webhook can verify
       * WHAT was bought without a second Stripe API call.
       *
       * It is needed because a `checkout.session.completed` webhook payload
       * carries no line items — the session object has only the subscription
       * id — so that event alone cannot prove which price was purchased. The
       * subscription events that follow DO carry `items.data[].price.id` and
       * are the authoritative check; this metadata closes the gap for the one
       * event that arrives first. Both are compared against the same
       * server-side allow-list, and this value was validated moments ago,
       * above, before the session was created.
       */
      metadata: { user_id: user.id, price_id: priceId },
      subscription_data: { metadata: { user_id: user.id, price_id: priceId } },
      /*
       * REUSE THE CUSTOMER WE ALREADY HAVE (audit FLAG-14, second half).
       *
       * Passing `customer_email` every time makes Stripe mint a NEW customer
       * on each checkout, so one person accumulates several customer records
       * and their billing history is split across all of them. `customer` and
       * `customer_email` are mutually exclusive, hence the either/or.
       */
      ...(existing?.stripe_customer_id
        ? { customer: existing.stripe_customer_id }
        : { customer_email: user.email ?? undefined }),
      allow_promotion_codes: true,
      success_url: `${baseUrl}/settings/plan?checkout=success`,
      cancel_url: `${baseUrl}/settings/plan?checkout=cancel`,
    }, {
      /*
       * IDEMPOTENCY KEY (audit FLAG-14, third half).
       *
       * A double-click, an impatient refresh, or a network retry each POST
       * again. Stripe returns the SAME session for a repeated key instead of
       * creating another, so the user lands on one checkout rather than two.
       *
       * WHY THE TIME BUCKET, AND WHAT IT COSTS. A key of just user+price would
       * be stable for the 24h Stripe remembers it — which would also break the
       * legitimate case of cancelling and resubscribing the same day, handing
       * the user back a dead session. Bucketing to 10 minutes collapses every
       * realistic double-submit while letting a genuine second attempt later
       * get a fresh session. The residual gap is two clicks landing either side
       * of a bucket boundary; the active-subscription refusal above and the
       * webhook's ordering guard are what bound that.
       */
      idempotencyKey: `checkout:${user.id}:${priceId}:${Math.floor(Date.now() / 600_000)}`,
    })
    if (!session.url) return apiError(502, 'stripe_error')
    return json(200, { url: session.url })
  } catch (err) {
    /*
     * LOGGED, NOT RETURNED.
     *
     * The upstream message was echoed to the caller. It never carried a key —
     * `redactSecrets` covers those — but it did confirm live-vs-test mode and
     * whether a guessed price or customer id exists in this account, which is a
     * useful oracle to pair with a substituted priceId. The client has always
     * ignored the message and shown its own copy, so nothing is lost by keeping
     * it on our side of the wire.
     */
    const message = redactSecrets(err instanceof Error ? err.message : 'Checkout failed')
    console.error('[api/create-checkout-session] stripe error:', message)
    return apiError(502, 'stripe_error')
  }
}

/** Web-shaped handler — exported for unit tests. */
export const webHandler = withErrorBoundary(checkout)
/** Vercel invokes the legacy (req, res) contract — see _lib/nodeAdapter.ts. */
export default toNodeHandler(webHandler)
