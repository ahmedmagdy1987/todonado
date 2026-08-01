// Relative imports MUST carry .js — see the note in create-checkout-session.ts.
import { serverEnv, missingServerBillingVars, resolveAppBaseUrl } from './_lib/config.js'
import { getStripe } from './_lib/stripe.js'
import { getSupabaseAdmin, getUserFromAuthHeader } from './_lib/supabase.js'
import { apiError, json, redactSecrets, withErrorBoundary } from './_lib/http.js'
import { toNodeHandler } from './_lib/nodeAdapter.js'

/**
 * POST /api/create-portal-session
 *
 * Verifies the caller's Supabase JWT, looks up their stripe_customer_id from the
 * billing row (service-role read), and opens a Stripe Customer Portal session so
 * they can manage / cancel. Returns { url }.
 */
async function portal(req: Request): Promise<Response> {
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
  if (missing.length > 0) return apiError(503, 'billing_not_configured', { missing })

  const admin = getSupabaseAdmin(env.supabaseUrl, env.supabaseServiceRoleKey)
  const { data, error } = await admin
    .from('billing')
    .select('stripe_customer_id')
    .eq('user_id', user.id)
    .maybeSingle()

  if (error) {
    console.error('[api/create-portal-session] billing lookup failed:', redactSecrets(error.message))
    return apiError(500, 'billing_lookup_failed')
  }
  const customerId = data?.stripe_customer_id
  if (!customerId) return apiError(400, 'no_subscription')

  /*
   * SERVER CONFIG, NOT THE ORIGIN HEADER (audit FLAG-4).
   *
   * `return_url` used to be built from `req.headers.get('origin')`. The portal
   * is where someone manages or cancels a real subscription, so a return link
   * an attacker chose is the last place a header should be trusted.
   */
  const { baseUrl, invalid: baseUrlInvalid } = resolveAppBaseUrl(env)
  if (baseUrlInvalid) {
    console.error(
      '[api/create-portal-session] APP_BASE_URL is not a usable https origin — ' +
        `falling back to ${baseUrl}. Fix the Vercel env var.`,
    )
  }

  try {
    const stripe = getStripe(env.stripeSecretKey)
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${baseUrl}/settings/plan`,
    })
    return json(200, { url: session.url })
  } catch (err) {
    const message = redactSecrets(err instanceof Error ? err.message : 'Portal failed')
    console.error('[api/create-portal-session] stripe error:', message)
    return apiError(502, 'stripe_error', { message })
  }
}

/** Web-shaped handler — exported for unit tests. */
export const webHandler = withErrorBoundary(portal)
/** Vercel invokes the legacy (req, res) contract — see _lib/nodeAdapter.ts. */
export default toNodeHandler(webHandler)
