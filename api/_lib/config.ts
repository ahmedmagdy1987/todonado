/**
 * Server-only billing config (Vercel env vars — NEVER VITE_, never committed).
 * Absent → the endpoints answer 503 with the MISSING VARIABLE NAMES (never
 * values) so a misconfigured deploy is diagnosable from the response alone.
 *
 *   STRIPE_SECRET_KEY          Stripe test/live secret key (sk_...)
 *   STRIPE_WEBHOOK_SECRET      signing secret of the /api/stripe-webhook endpoint (whsec_...)
 *   STRIPE_PRICE_MONTHLY       the ONE monthly price id we sell (price_...)
 *   STRIPE_PRICE_YEARLY        the ONE yearly price id we sell (price_...)
 *   SUPABASE_URL               the project URL (same as VITE_SUPABASE_URL, server copy)
 *   SUPABASE_SERVICE_ROLE_KEY  service-role key — bypasses RLS; SERVER ONLY
 */
export interface ServerEnv {
  stripeSecretKey: string
  stripeWebhookSecret: string
  stripePriceMonthly: string
  stripePriceYearly: string
  appBaseUrl: string
  supabaseUrl: string
  supabaseServiceRoleKey: string
}

export function serverEnv(): ServerEnv {
  return {
    stripeSecretKey: process.env.STRIPE_SECRET_KEY?.trim() ?? '',
    stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET?.trim() ?? '',
    stripePriceMonthly: process.env.STRIPE_PRICE_MONTHLY?.trim() ?? '',
    stripePriceYearly: process.env.STRIPE_PRICE_YEARLY?.trim() ?? '',
    appBaseUrl: process.env.APP_BASE_URL?.trim() ?? '',
    supabaseUrl: process.env.SUPABASE_URL?.trim() ?? '',
    supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? '',
  }
}

/** Where Stripe sends people back to when nothing is configured. */
export const DEFAULT_APP_BASE_URL = 'https://www.todonado.com'

/**
 * The base URL for Stripe success / cancel / portal-return links (audit FLAG-4).
 *
 * THIS EXISTS SO THE ORIGIN HEADER IS NEVER CONSULTED AGAIN. The endpoints used
 * to interpolate `req.headers.get('origin')` straight into `success_url`,
 * `cancel_url` and `return_url`. An attacker with their own free account could
 * request a genuine `checkout.stripe.com` URL — real merchant account, real
 * branding — that redirected to THEIR domain on completion. A request header is
 * attacker-controlled input and can never be the source of a redirect target.
 *
 * APP_BASE_URL is validated rather than trusted, because a fat-fingered env var
 * would otherwise reintroduce the same bug with extra steps:
 *   - must parse as a URL;
 *   - https only, except http://localhost and http://127.0.0.1 for local dev;
 *   - no embedded credentials (`https://evil@real.com` reads as "real.com" to a
 *     human and resolves to evil for the browser);
 *   - origin only — any path, query or fragment is discarded.
 * Anything failing that is IGNORED in favour of the default, and the caller is
 * told so it can be logged once rather than silently redirecting people.
 */
export function resolveAppBaseUrl(env: ServerEnv = serverEnv()): {
  baseUrl: string
  invalid: boolean
} {
  const raw = env.appBaseUrl
  if (!raw) return { baseUrl: DEFAULT_APP_BASE_URL, invalid: false }

  let parsed: URL
  try {
    parsed = new URL(raw)
  } catch {
    return { baseUrl: DEFAULT_APP_BASE_URL, invalid: true }
  }

  const isLocal = parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1'
  const schemeOk = parsed.protocol === 'https:' || (parsed.protocol === 'http:' && isLocal)
  if (!schemeOk || parsed.username || parsed.password) {
    return { baseUrl: DEFAULT_APP_BASE_URL, invalid: true }
  }

  // `origin` drops path/query/fragment and any trailing slash for us.
  return { baseUrl: parsed.origin, invalid: false }
}

/** The env var NAMES required for checkout/portal that are absent. Names only. */
export function missingServerBillingVars(env: ServerEnv = serverEnv()): string[] {
  const missing: string[] = []
  if (!env.stripeSecretKey) missing.push('STRIPE_SECRET_KEY')
  if (!env.stripePriceMonthly) missing.push('STRIPE_PRICE_MONTHLY')
  if (!env.stripePriceYearly) missing.push('STRIPE_PRICE_YEARLY')
  if (!env.supabaseUrl) missing.push('SUPABASE_URL')
  if (!env.supabaseServiceRoleKey) missing.push('SUPABASE_SERVICE_ROLE_KEY')
  return missing
}

/**
 * The ONLY price ids this deployment sells. Empty entries are dropped so an
 * unset env var can never widen the allow-list to include `''`.
 */
export function configuredPriceIds(env: ServerEnv = serverEnv()): readonly string[] {
  return [env.stripePriceMonthly, env.stripePriceYearly].filter((id) => id.length > 0)
}

/**
 * Is this EXACTLY one of the prices we sell? (audit FLAG-2)
 *
 * THE SHAPE CHECK BELOW IS NOT A SECURITY CONTROL, AND THAT WAS THE BUG.
 * `isValidPriceId` only proves a string looks like `price_…`, so every real
 * price in the Stripe account passed it — a grandfathered price, an internal
 * discount price, a partner price. The client named the price and the server
 * agreed. THIS function is the gate: membership of a set the server configured,
 * which no request body can influence.
 *
 * Fails CLOSED when nothing is configured: an unset env var must reject
 * everything, never accept everything.
 */
export function isConfiguredPriceId(value: unknown, env: ServerEnv = serverEnv()): value is string {
  if (typeof value !== 'string' || value.length === 0) return false
  return configuredPriceIds(env).includes(value)
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
 * Shape check only — `price_…`-looking or not.
 *
 * NOT THE AUTHORISATION CHECK. Use `isConfiguredPriceId` for that. This is kept
 * purely as a cheap early reject for obvious junk, and because a malformed id
 * deserves a different diagnosis than a well-formed one we do not sell. Any
 * caller relying on this ALONE has audit FLAG-2.
 */
export function isValidPriceId(value: unknown): value is string {
  return typeof value === 'string' && /^price_[A-Za-z0-9]{6,}$/.test(value)
}
