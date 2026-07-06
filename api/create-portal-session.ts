import { serverEnv, isServerBillingConfigured } from './_lib/config'
import { getStripe } from './_lib/stripe'
import { getSupabaseAdmin, getUserFromAuthHeader } from './_lib/supabase'
import { json } from './_lib/http'

/**
 * POST /api/create-portal-session
 *
 * Verifies the caller's Supabase JWT, looks up their stripe_customer_id from the
 * billing row (service-role read), and opens a Stripe Customer Portal session so
 * they can manage / cancel. Returns { url }.
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

  const admin = getSupabaseAdmin(env.supabaseUrl, env.supabaseServiceRoleKey)
  const { data, error } = await admin
    .from('billing')
    .select('stripe_customer_id')
    .eq('user_id', user.id)
    .maybeSingle()

  if (error) return json(500, { error: 'Could not load billing' })
  const customerId = data?.stripe_customer_id
  if (!customerId) return json(400, { error: 'No subscription to manage' })

  const origin = req.headers.get('origin') ?? 'https://www.todonado.com'
  try {
    const stripe = getStripe(env.stripeSecretKey)
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${origin}/settings/plan`,
    })
    return json(200, { url: session.url })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Portal failed'
    return json(502, { error: message })
  }
}
