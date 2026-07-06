import { serverEnv, isServerBillingConfigured } from './_lib/config'
import { getStripe } from './_lib/stripe'
import { getSupabaseAdmin } from './_lib/supabase'
import { json } from './_lib/http'
// Leaf module from src/ (no `@/` imports) — safe for Vercel to bundle here.
import { mapStripeEventToBilling, type MinimalStripeEvent } from '../src/features/billing/webhookMapping'

/**
 * POST /api/stripe-webhook
 *
 * RAW-body Stripe signature verification, then upsert the caller's billing row
 * via the SERVICE-ROLE key (bypasses RLS). Handles:
 *   - checkout.session.completed
 *   - customer.subscription.updated
 *   - customer.subscription.deleted
 * Idempotent (upsert by user_id PK) and safe on replays; unknown events → 200
 * no-op. The Web-signature handler gives us the exact raw body via req.text(),
 * which is what constructEvent needs to verify the signature.
 */
export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') return json(405, { error: 'Method not allowed' })

  const env = serverEnv()
  if (!isServerBillingConfigured(env) || !env.stripeWebhookSecret) {
    return json(503, { error: 'Billing is not configured' })
  }

  const signature = req.headers.get('stripe-signature')
  if (!signature) return json(400, { error: 'Missing stripe-signature' })

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
    const message = err instanceof Error ? err.message : 'Invalid signature'
    return json(400, { error: `Webhook signature verification failed: ${message}` })
  }

  const upsert = mapStripeEventToBilling(event)
  if (!upsert) return json(200, { received: true }) // unknown / no-op event

  const admin = getSupabaseAdmin(env.supabaseUrl, env.supabaseServiceRoleKey)
  const { error } = await admin.from('billing').upsert(upsert, { onConflict: 'user_id' })
  if (error) return json(500, { error: 'Billing upsert failed' })

  return json(200, { received: true })
}
