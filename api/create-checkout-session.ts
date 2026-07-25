// NOTE: relative imports MUST carry the .js extension. package.json is
// `"type": "module"`, so these compile to ESM, and Node's ESM resolver does not
// do extension guessing — an extensionless specifier throws ERR_MODULE_NOT_FOUND
// at module load, which Vercel surfaces as FUNCTION_INVOCATION_FAILED (a bare
// 500 on EVERY request, before any handler code runs).
import { serverEnv, missingServerBillingVars, isValidPriceId } from './_lib/config.js'
import { getStripe } from './_lib/stripe.js'
import { getUserFromAuthHeader } from './_lib/supabase.js'
import { apiError, json, redactSecrets, withErrorBoundary } from './_lib/http.js'

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
  const missing = missingServerBillingVars(env)
  // Names only — never values.
  if (missing.length > 0) return apiError(503, 'billing_not_configured', { missing })

  const user = await getUserFromAuthHeader(
    req.headers.get('authorization'),
    env.supabaseUrl,
    env.supabaseServiceRoleKey,
  )
  if (!user) return apiError(401, 'unauthorized')

  let body: { priceId?: unknown } = {}
  try {
    body = (await req.json()) as { priceId?: unknown }
  } catch {
    /* empty/invalid body handled below */
  }
  if (body.priceId == null || body.priceId === '') return apiError(400, 'missing_price_id')
  if (!isValidPriceId(body.priceId)) return apiError(400, 'invalid_price')
  const priceId = body.priceId

  const origin = req.headers.get('origin') ?? 'https://www.todonado.com'

  try {
    const stripe = getStripe(env.stripeSecretKey)
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      client_reference_id: user.id,
      metadata: { user_id: user.id },
      subscription_data: { metadata: { user_id: user.id } },
      customer_email: user.email ?? undefined,
      allow_promotion_codes: true,
      success_url: `${origin}/settings/plan?checkout=success`,
      cancel_url: `${origin}/settings/plan?checkout=cancel`,
    })
    if (!session.url) return apiError(502, 'stripe_error', { message: 'No checkout URL returned' })
    return json(200, { url: session.url })
  } catch (err) {
    const message = redactSecrets(err instanceof Error ? err.message : 'Checkout failed')
    console.error('[api/create-checkout-session] stripe error:', message)
    return apiError(502, 'stripe_error', { message })
  }
}

export default withErrorBoundary(checkout)
