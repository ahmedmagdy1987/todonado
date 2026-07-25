// Relative imports MUST carry .js — see the note in create-checkout-session.ts.
import { serverEnv, missingWebhookVars } from './_lib/config.js'
import { getStripe } from './_lib/stripe.js'
import { getSupabaseAdmin } from './_lib/supabase.js'
import { apiError, json, redactSecrets, withErrorBoundary } from './_lib/http.js'
import { toNodeHandler } from './_lib/nodeAdapter.js'
// Leaf module from src/ (no `@/` imports) — safe for Vercel to bundle here.
import {
  mapStripeEventToBilling,
  type MinimalStripeEvent,
} from '../src/features/billing/webhookMapping.js'

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
async function webhook(req: Request): Promise<Response> {
  if (req.method !== 'POST') return apiError(405, 'method_not_allowed')

  const env = serverEnv()
  const missing = missingWebhookVars(env)
  if (missing.length > 0) return apiError(503, 'billing_not_configured', { missing })

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

  const upsert = mapStripeEventToBilling(event)
  if (!upsert) return json(200, { received: true }) // unknown / no-op event

  const admin = getSupabaseAdmin(env.supabaseUrl, env.supabaseServiceRoleKey)
  const { error } = await admin.from('billing').upsert(upsert, { onConflict: 'user_id' })
  if (error) {
    console.error('[api/stripe-webhook] billing upsert failed:', redactSecrets(error.message))
    return apiError(500, 'billing_upsert_failed')
  }

  return json(200, { received: true })
}

/** Web-shaped handler — exported for unit tests. */
export const webHandler = withErrorBoundary(webhook)
/** Vercel invokes the legacy (req, res) contract — see _lib/nodeAdapter.ts. */
export default toNodeHandler(webHandler)
