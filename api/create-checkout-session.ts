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
} from './_lib/config.js'
import { getStripe } from './_lib/stripe.js'
import { getUserFromAuthHeader } from './_lib/supabase.js'
import { apiError, json, redactSecrets, withErrorBoundary } from './_lib/http.js'
import { toNodeHandler } from './_lib/nodeAdapter.js'

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

  const origin = req.headers.get('origin') ?? 'https://www.todonado.com'

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
      customer_email: user.email ?? undefined,
      allow_promotion_codes: true,
      success_url: `${origin}/settings/plan?checkout=success`,
      cancel_url: `${origin}/settings/plan?checkout=cancel`,
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
