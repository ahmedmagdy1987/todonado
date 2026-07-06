/**
 * Server-only billing config (Vercel env vars — NEVER VITE_, never committed).
 * Absent → the endpoints answer 503 and the client uses the fake-door fallback.
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
    stripeSecretKey: process.env.STRIPE_SECRET_KEY ?? '',
    stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET ?? '',
    supabaseUrl: process.env.SUPABASE_URL ?? '',
    supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
  }
}

/** True when checkout/portal can run (Stripe secret + Supabase service role). */
export function isServerBillingConfigured(env: ServerEnv = serverEnv()): boolean {
  return Boolean(env.stripeSecretKey && env.supabaseUrl && env.supabaseServiceRoleKey)
}
