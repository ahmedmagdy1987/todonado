// Relative imports MUST carry .js — see the note in create-checkout-session.ts.
import { serverEnv } from './_lib/config.js'
import { getSupabaseAdmin, getUserFromAuthHeader } from './_lib/supabase.js'
import { apiError, json, withErrorBoundary } from './_lib/http.js'
import { toNodeHandler } from './_lib/nodeAdapter.js'
import { resolveServerPlan } from './_lib/entitlement.js'
import { fetchIcsGuarded, SsrfError } from './_lib/ssrf.js'

/**
 * POST /api/calendar-fetch
 *
 * Server-side .ics fetch for a user's SUBSCRIBED (kind 'url') calendars — the
 * thing the browser cannot do, because providers like Google and Outlook do not
 * send CORS headers on .ics endpoints.
 *
 * SECURITY SHAPE
 *  - Auth required: the caller's Supabase JWT is verified.
 *  - Pro gate is SERVER-SIDE (resolveServerPlan reads the billing row), so a
 *    client that flips its own localStorage still gets 403.
 *  - THE REQUEST BODY IS IGNORED. URLs are loaded from the caller's OWN
 *    calendar_sources rows via the service-role client and filtered by
 *    `user_id = <the verified caller>`. A URL in the body would turn this into an
 *    open proxy, so there is no way to pass one.
 *  - Every fetch goes through fetchIcsGuarded: scheme/port allow-list, no
 *    credentials, DNS resolved and every address checked against private ranges,
 *    redirects followed manually and re-validated, timeout + byte cap.
 *  - Per-source errors are collapsed to two safe codes (`invalid_source`,
 *    `fetch_failed`). Resolved addresses and upstream messages are never echoed,
 *    so this cannot be used as an internal port/host scanner.
 */

/**
 * Per-source and total caps for the RESPONSE (not the same as the fetch cap).
 * Vercel serverless responses are limited to ~4.5 MB, so a raw 8 MB feed would
 * fail at the platform edge with a confusing error rather than a clean one.
 */
const MAX_SOURCE_BYTES = 2_000_000
const MAX_TOTAL_BYTES = 4_000_000

export interface CalendarFetchResult {
  id: string
  ics?: string
  error?: 'invalid_source' | 'fetch_failed' | 'response_too_large'
}

/** Map an internal SSRF code to the small, safe, client-facing set. */
function safeError(err: unknown): CalendarFetchResult['error'] {
  if (!(err instanceof SsrfError)) return 'fetch_failed'
  switch (err.code) {
    case 'invalid_url':
    case 'bad_scheme':
    case 'bad_port':
    case 'has_credentials':
    case 'private_host':
    case 'dns_failed':
      // All "your URL is not acceptable" — deliberately indistinguishable, so the
      // response can't confirm whether an internal host exists.
      //
      // `dns_failed` JOINED THIS GROUP because split out it was the difference
      // between "that name does not resolve" and "that name resolves to
      // something private" — which is exactly the internal-hostname existence
      // oracle this collapse exists to prevent.
      return 'invalid_source'
    case 'response_too_large':
      return 'response_too_large'
    default:
      return 'fetch_failed'
  }
}

async function calendarFetch(req: Request): Promise<Response> {
  if (req.method !== 'POST') return apiError(405, 'method_not_allowed')

  const env = serverEnv()

  /*
   * NO VARIABLE NAMES TO AN ANONYMOUS CALLER. This used to list exactly which
   * of SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY was unset, before checking who
   * was asking — a free map of the deployment. Authentication needs both, so
   * the check has to stay first; what changes is that it no longer says which.
   */
  if (!env.supabaseUrl || !env.supabaseServiceRoleKey) return apiError(503, 'not_configured')

  const user = await getUserFromAuthHeader(
    req.headers.get('authorization'),
    env.supabaseUrl,
    env.supabaseServiceRoleKey,
  )
  if (!user) return apiError(401, 'unauthorized')

  const admin = getSupabaseAdmin(env.supabaseUrl, env.supabaseServiceRoleKey)

  // Pro gate, server-side. Free keeps file upload; live URL sync is the paid line.
  const plan = await resolveServerPlan(admin, user.id, user.email)
  if (plan !== 'pro') return apiError(403, 'pro_required')

  const { data, error } = await admin
    .from('calendar_sources')
    .select('id,url')
    .eq('user_id', user.id) // the verified caller, never a body value
    .eq('kind', 'url')
  if (error) return apiError(500, 'calendar_lookup_failed')

  const rows = (data ?? []) as { id: string; url: string | null }[]
  const sources: CalendarFetchResult[] = []
  let totalBytes = 0

  // Sequential on purpose: bounded fan-out from our own IP, and it makes the
  // running total cap meaningful.
  for (const row of rows) {
    if (!row.url) {
      sources.push({ id: row.id, error: 'invalid_source' })
      continue
    }
    const remaining = MAX_TOTAL_BYTES - totalBytes
    if (remaining <= 0) {
      sources.push({ id: row.id, error: 'response_too_large' })
      continue
    }
    try {
      const ics = await fetchIcsGuarded(row.url, {
        maxBytes: Math.min(MAX_SOURCE_BYTES, remaining),
      })
      totalBytes += ics.length
      sources.push({ id: row.id, ics })
    } catch (err) {
      sources.push({ id: row.id, error: safeError(err) })
    }
  }

  // Per-user authenticated data: never store it in a shared or browser cache.
  // Freshness is managed client-side by the TanStack Query staleTime instead.
  return json(200, { sources }, { 'cache-control': 'no-store, private' })
}

/** Web-shaped handler — exported for unit tests. */
export const webHandler = withErrorBoundary(calendarFetch)
/** Vercel invokes the legacy (req, res) contract — see _lib/nodeAdapter.ts. */
export default toNodeHandler(webHandler)
