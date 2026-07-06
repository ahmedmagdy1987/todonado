import { serverEnv, isServerBillingConfigured } from './_lib/config'
import { getStripe } from './_lib/stripe'
import { getUserFromAuthHeader } from './_lib/supabase'
import { json } from './_lib/http'

/**
 * POST /api/create-checkout-session
 * Body: { priceId: string }  (the client sends the resolved monthly|yearly price)
 *
 * Verifies the caller's Supabase JWT, then creates a Stripe Checkout Session
 * (subscription mode). user_id is stamped on the session (metadata +
 * client_reference_id) AND on the subscription (subscription_data.metadata) so
 * the webhook can resolve the user without a DB lookup. Returns { url }.
 */
export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') return json(405, { error: 'Method not allowed' })

  const env = serverEnv()
  if (!isServerBillingConfigured(env)) return json(503, { error: 'Billing is not configured' })

  const user = await getUserFromAuthHeader(
    req.headers.get('authorization'),
    env.supabaseUrl,
    env.supabaseServiceRoleKey,
  )
  if (!user) return json(401, { error: 'Unauthorized' })

  let body: { priceId?: string } = {}
  try {
    body = (await req.json()) as { priceId?: string }
  } catch {
    /* empty/invalid body handled below */
  }
  const priceId = body.priceId
  if (!priceId) return json(400, { error: 'Missing priceId' })

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
    return json(200, { url: session.url })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Checkout failed'
    return json(502, { error: message })
  }
}
