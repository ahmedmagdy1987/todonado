/**
 * Server-only billing config (Vercel env vars — NEVER VITE_, never committed).
 * Absent → the endpoints answer 503 with the MISSING VARIABLE NAMES (never
 * values) so a misconfigured deploy is diagnosable from the response alone.
 *
 *   STRIPE_MODE                'test' | 'live' — the ONE declaration of intent
 *   STRIPE_SECRET_KEY          Stripe test/live secret key (sk_...)
 *   STRIPE_WEBHOOK_SECRET      signing secret of the /api/stripe-webhook endpoint (whsec_...)
 *   STRIPE_PRICE_MONTHLY       the ONE monthly price id we sell (price_...)
 *   STRIPE_PRICE_YEARLY        the ONE yearly price id we sell (price_...)
 *   SUPABASE_URL               the project URL (same as VITE_SUPABASE_URL, server copy)
 *   SUPABASE_SERVICE_ROLE_KEY  service-role key — bypasses RLS; SERVER ONLY
 */
export type StripeMode = 'test' | 'live'

export interface ServerEnv {
  /** Empty when unset — `stripeModeProblems` reports that rather than guessing. */
  stripeMode: string
  stripeSecretKey: string
  stripeWebhookSecret: string
  stripePriceMonthly: string
  stripePriceYearly: string
  appBaseUrl: string
  supabaseUrl: string
  supabaseServiceRoleKey: string
  /*
   * The three VITE_ values, read SERVER-side purely to cross-check them against
   * their server twins. Vercel exposes every project env var to functions, so
   * the server can see what the browser was built with — which is the only way
   * to catch the mismatch that otherwise 400s every checkout with no clue why.
   * They are public values; reading them here grants nothing.
   */
  clientPublishableKey: string
  clientPriceMonthly: string
  clientPriceYearly: string
}

export function serverEnv(): ServerEnv {
  return {
    stripeMode: process.env.STRIPE_MODE?.trim().toLowerCase() ?? '',
    stripeSecretKey: process.env.STRIPE_SECRET_KEY?.trim() ?? '',
    stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET?.trim() ?? '',
    stripePriceMonthly: process.env.STRIPE_PRICE_MONTHLY?.trim() ?? '',
    stripePriceYearly: process.env.STRIPE_PRICE_YEARLY?.trim() ?? '',
    appBaseUrl: process.env.APP_BASE_URL?.trim() ?? '',
    supabaseUrl: process.env.SUPABASE_URL?.trim() ?? '',
    supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? '',
    clientPublishableKey: process.env.VITE_STRIPE_PUBLISHABLE_KEY?.trim() ?? '',
    clientPriceMonthly: process.env.VITE_STRIPE_PRICE_MONTHLY?.trim() ?? '',
    clientPriceYearly: process.env.VITE_STRIPE_PRICE_YEARLY?.trim() ?? '',
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
  if (!env.stripeMode) missing.push('STRIPE_MODE')
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

/**
 * ONE DECLARED MODE, AND EVERYTHING ELSE MUST AGREE WITH IT.
 *
 * Mode was previously inferred wherever it happened to be needed — which means
 * it could be inferred differently in two places, and a half-live deployment
 * would look fine until money moved. `STRIPE_MODE` is now the single
 * declaration; every key, price and Stripe object is checked against it.
 *
 * DELIBERATELY NOT INFERRED FROM `whsec_`: webhook signing secrets do not
 * encode test vs live, so a `whsec_` value tells you nothing about mode and
 * treating it as a signal would be a guess dressed as a check.
 *
 * Returns machine-readable problem codes, never values. Empty means consistent.
 */
export function stripeModeProblems(env: ServerEnv = serverEnv()): string[] {
  const problems: string[] = []
  const mode = env.stripeMode

  if (mode !== 'test' && mode !== 'live') {
    // Fail closed and stop: every check below is relative to a known mode, and
    // guessing one would defeat the point of declaring it.
    return ['STRIPE_MODE_INVALID']
  }

  const expectedKeyInfix = mode === 'live' ? '_live_' : '_test_'

  if (env.stripeSecretKey && !env.stripeSecretKey.includes(expectedKeyInfix)) {
    problems.push('STRIPE_SECRET_KEY_MODE_MISMATCH')
  }
  if (env.clientPublishableKey && !env.clientPublishableKey.includes(expectedKeyInfix)) {
    problems.push('VITE_STRIPE_PUBLISHABLE_KEY_MODE_MISMATCH')
  }

  /*
   * THE MISMATCH THAT COSTS AN HOUR TO DIAGNOSE. The price ids are declared
   * twice — VITE_ for the browser at build time, plain for the server at run
   * time, because the server must never read the client's copy as authority.
   * When they disagree every checkout 400s `invalid_price` and nothing else
   * misbehaves. Catching it here turns that into a named 503 at deploy time.
   */
  if (env.clientPriceMonthly && env.stripePriceMonthly !== env.clientPriceMonthly) {
    problems.push('PRICE_MONTHLY_CLIENT_SERVER_MISMATCH')
  }
  if (env.clientPriceYearly && env.stripePriceYearly !== env.clientPriceYearly) {
    problems.push('PRICE_YEARLY_CLIENT_SERVER_MISMATCH')
  }

  return problems
}

/** True when Stripe objects for this deployment must carry `livemode: true`. */
export function expectedLivemode(env: ServerEnv = serverEnv()): boolean {
  return env.stripeMode === 'live'
}

/**
 * Does a Stripe object belong to the mode we declared?
 *
 * `livemode` is present on every Stripe object and on the webhook event itself,
 * so this is the check that keeps a test webhook from touching live billing
 * state and vice versa. `undefined` fails closed — an object we cannot place
 * is not one we act on.
 */
export function livemodeMatches(
  livemode: boolean | null | undefined,
  env: ServerEnv = serverEnv(),
): boolean {
  if (typeof livemode !== 'boolean') return false
  return livemode === expectedLivemode(env)
}
