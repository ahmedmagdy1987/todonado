/**
 * Server-only billing config (Vercel env vars — NEVER VITE_, never committed).
 * Absent → the endpoints answer 503 with the MISSING VARIABLE NAMES (never
 * values) so a misconfigured deploy is diagnosable from the response alone.
 *
 *   STRIPE_SECRET_KEY          Stripe test/live secret key (sk_...)
 *   STRIPE_WEBHOOK_SECRET      signing secret of the /api/stripe-webhook endpoint (whsec_...)
 *   SUPABASE_URL               the project URL (same as VITE_SUPABASE_URL, server copy)
 *   SUPABASE_SERVICE_ROLE_KEY  service-role key — bypasses RLS; SERVER ONLY
 */
export interface ServerEnv {
  stripeSecretKey: string
  stripeWebhookSecret: string
  supabaseUrl: string
  supabaseServiceRoleKey: string
}

export function serverEnv(): ServerEnv {
  return {
    stripeSecretKey: process.env.STRIPE_SECRET_KEY?.trim() ?? '',
    stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET?.trim() ?? '',
    supabaseUrl: process.env.SUPABASE_URL?.trim() ?? '',
    supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? '',
  }
}

/** The env var NAMES required for checkout/portal that are absent. Names only. */
export function missingServerBillingVars(env: ServerEnv = serverEnv()): string[] {
  const missing: string[] = []
  if (!env.stripeSecretKey) missing.push('STRIPE_SECRET_KEY')
  if (!env.supabaseUrl) missing.push('SUPABASE_URL')
  if (!env.supabaseServiceRoleKey) missing.push('SUPABASE_SERVICE_ROLE_KEY')
  return missing
}

/** As above, for the webhook — which additionally needs the signing secret. */
export function missingWebhookVars(env: ServerEnv = serverEnv()): string[] {
  const missing = missingServerBillingVars(env)
  if (!env.stripeWebhookSecret) missing.push('STRIPE_WEBHOOK_SECRET')
  return missing
}

/** True when checkout/portal can run (Stripe secret + Supabase service role). */
export function isServerBillingConfigured(env: ServerEnv = serverEnv()): boolean {
  return missingServerBillingVars(env).length === 0
}

/**
 * Shape check for a Stripe price id as sent by the CLIENT. The client supplies
 * the price, so we must not hand arbitrary strings to Stripe — reject anything
 * that is not a plausible `price_...` id and answer 400 `invalid_price`.
 */
export function isValidPriceId(value: unknown): value is string {
  return typeof value === 'string' && /^price_[A-Za-z0-9]{6,}$/.test(value)
}
