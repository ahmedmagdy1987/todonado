// Relative imports MUST carry .js — see the note in create-checkout-session.ts.
import { serverEnv } from './_lib/config.js'
import { getSupabaseAdmin, getUserFromAuthHeader } from './_lib/supabase.js'
import { apiError, json, withErrorBoundary } from './_lib/http.js'
import { toNodeHandler } from './_lib/nodeAdapter.js'
import {
  ENTITLEMENT_RETRY_AFTER_SECONDS,
  ENTITLEMENT_UNAVAILABLE_CODE,
  ENTITLEMENT_UNAVAILABLE_STATUS,
  resolveServerEntitlement,
} from './_lib/entitlement.js'
import { fetchIcsGuarded, SsrfError } from './_lib/ssrf.js'
import { enforceRateLimit } from './_lib/rateLimit.js'
import {
  AGGREGATE_DEADLINE_MS,
  DB_QUERY_LIMIT,
  MAX_CONCURRENT_FETCHES,
  MAX_EVENTS_PER_REQUEST,
  MAX_SOURCES_PER_REQUEST,
  PER_SOURCE_TIMEOUT_MS,
  calendarUrlKey,
  countVevents,
  mapWithConcurrency,
} from './_lib/calendarLimits.js'

/**
 * POST /api/calendar-fetch
 *
 * Server-side .ics fetch for a user's SUBSCRIBED (kind 'url') calendars — the
 * thing the browser cannot do, because providers like Google and Outlook do not
 * send CORS headers on .ics endpoints.
 *
 * SECURITY SHAPE
 *  - Auth required: the caller's Supabase JWT is verified.
 *  - Pro gate is SERVER-SIDE (resolveServerEntitlement reads the billing row),
 *    so a client that flips its own localStorage still gets 403 — and a billing
 *    read that FAILS gets 503, never a 403 that would lie to a subscriber.
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
  /**
   * `too_many_events` means the feed was fetched safely but carries more
   * VEVENTs than the aggregate cap allows. The client already treats any
   * source without `ics` as a failed source, so this needs no client change.
   */
  error?: 'invalid_source' | 'fetch_failed' | 'response_too_large' | 'too_many_events'
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

  /*
   * RATE LIMIT, keyed on the VERIFIED user (audit FLAG-10). Placed after auth
   * so the counter names an account rather than a shared NAT address, and
   * before anything that costs money or makes an outbound request.
   * api/_lib/rateLimit.ts states plainly what this does and does not stop.
   */
  const limit = enforceRateLimit('calendar', user.id, req)
  if (!limit.allowed) {
    return apiError(429, 'rate_limited', { retry_after: limit.retryAfterSeconds })
  }

  const admin = getSupabaseAdmin(env.supabaseUrl, env.supabaseServiceRoleKey)

  /*
   * Pro gate, server-side. Free keeps file upload; live URL sync is the paid line.
   *
   * THREE OUTCOMES, NOT TWO. `unavailable` is answered 503, never 403: a 403
   * tells a paying customer they are not entitled, and this endpoint used to
   * send exactly that whenever the billing read failed, because the failure was
   * swallowed and reported as Free. Retry-After is set because the condition is
   * transient by definition, and the client already treats 5xx as retriable.
   */
  const entitlement = await resolveServerEntitlement(
    admin,
    user.id,
    user.email,
    user.emailVerified,
  )
  if (entitlement.status === 'unavailable') {
    return apiError(ENTITLEMENT_UNAVAILABLE_STATUS, ENTITLEMENT_UNAVAILABLE_CODE, {
      reason: entitlement.reason,
      retry_after: ENTITLEMENT_RETRY_AFTER_SECONDS,
    })
  }
  if (entitlement.plan !== 'pro') return apiError(403, 'pro_required')

  /*
   * THE CAP IS ON THE QUERY, NOT ON THE LOOP (issue #9). Selecting every row
   * and slicing afterwards still transfers every row and still lets the count
   * be chosen by the caller. `DB_QUERY_LIMIT` is MAX_SOURCES_PER_REQUEST + 1,
   * so the extra row tells us more exist without our ever fetching it.
   */
  const { data, error } = await admin
    .from('calendar_sources')
    .select('id,url')
    .eq('user_id', user.id) // the verified caller, never a body value
    .eq('kind', 'url')
    .limit(DB_QUERY_LIMIT)
  if (error) return apiError(500, 'calendar_lookup_failed')

  const allRows = (data ?? []) as { id: string; url: string | null }[]
  const truncated = allRows.length > MAX_SOURCES_PER_REQUEST
  const rows = truncated ? allRows.slice(0, MAX_SOURCES_PER_REQUEST) : allRows

  /*
   * ONE DEADLINE FOR THE WHOLE INVOCATION.
   *
   * A per-source timeout MULTIPLIES: ten sources at ten seconds each is a
   * hundred seconds of billable execution the caller controls by adding rows.
   * This bounds the invocation itself, and aborts work already in flight, so a
   * hostile slow source cannot hold a runner past the deadline.
   */
  const deadlineAt = Date.now() + AGGREGATE_DEADLINE_MS
  const aggregate = new AbortController()
  const deadlineTimer = setTimeout(() => aggregate.abort(), AGGREGATE_DEADLINE_MS)

  const sources: CalendarFetchResult[] = []
  try {
    /*
     * DEDUPE BEFORE FETCHING. Rows are grouped by a conservative normalised key
     * (fragment and default port removed, host lower-cased, everything else
     * preserved), so N rows pointing at one feed cost ONE request. A row whose
     * URL is unusable never reaches the network at all.
     */
    const byKey = new Map<string, { url: string; ids: string[] }>()
    for (const row of rows) {
      const key = row.url ? calendarUrlKey(row.url) : null
      if (!key || !row.url) {
        sources.push({ id: row.id, error: 'invalid_source' })
        continue
      }
      const existing = byKey.get(key)
      if (existing) existing.ids.push(row.id)
      else byKey.set(key, { url: row.url, ids: [row.id] })
    }

    /*
     * TWO SEPARATE BOUNDS, because they protect different things.
     *
     * Each fetch is capped individually at MAX_SOURCE_BYTES, which stops any one
     * feed being unbounded. The TOTAL is enforced when the response is assembled
     * below.
     *
     * An earlier draft RESERVED the full per-source cap up front and refunded
     * the unused part. That is wrong with work in flight: 2 MB reserved twice
     * exhausts a 4 MB total, so a third concurrent source was refused before it
     * ran — a legitimate user with three calendars would have seen spurious
     * `response_too_large`. The concurrency tests caught it.
     */
    let deliveredBytes = 0
    let eventsSoFar = 0

    const fetched = await mapWithConcurrency(
      [...byKey.values()],
      MAX_CONCURRENT_FETCHES,
      async (entry): Promise<{ ids: string[]; ics?: string; error?: CalendarFetchResult['error'] }> => {
        // Do not START new work once the deadline has passed.
        if (aggregate.signal.aborted || Date.now() >= deadlineAt) {
          return { ids: entry.ids, error: 'fetch_failed' }
        }

        const grant = Math.min(MAX_SOURCE_BYTES, MAX_TOTAL_BYTES - deliveredBytes)
        if (grant <= 0) return { ids: entry.ids, error: 'response_too_large' }

        try {
          const ics = await fetchIcsGuarded(entry.url, {
            maxBytes: grant,
            // Never longer than what is left of the aggregate budget.
            timeoutMs: Math.max(1, Math.min(PER_SOURCE_TIMEOUT_MS, deadlineAt - Date.now())),
          })

          /*
           * Bound what the CLIENT must parse. The server does not parse ICS —
           * that runs in the browser — so this caps handed-over work, not our
           * own. A source that would push the aggregate past the cap is
           * REJECTED rather than truncated: half a calendar silently missing
           * its later events would show a wrong capacity meter, which is worse
           * than an honest per-source failure the UI already handles.
           */
          const events = countVevents(ics)
          if (eventsSoFar + events > MAX_EVENTS_PER_REQUEST) {
            return { ids: entry.ids, error: 'too_many_events' }
          }
          eventsSoFar += events
          deliveredBytes += Buffer.byteLength(ics, 'utf8')

          return { ids: entry.ids, ics }
        } catch (err) {
          return { ids: entry.ids, error: safeError(err) }
        }
      },
    )

    /*
     * Assemble, enforcing the TOTAL response budget exactly. Concurrency means
     * several sources can each be under the per-source cap while their sum is
     * over the total, and Vercel rejects a body over ~4.5 MB at the edge with an
     * error the client cannot interpret. Dropping the overflow here turns that
     * into a per-source `response_too_large` the UI already handles.
     *
     * One fetch fans back out to every row that shared its URL.
     */
    let responseBytes = 0
    for (const result of fetched) {
      const size = result.ics === undefined ? 0 : Buffer.byteLength(result.ics, 'utf8')
      const overBudget = result.ics !== undefined && responseBytes + size > MAX_TOTAL_BYTES
      if (result.ics !== undefined && !overBudget) responseBytes += size

      for (const id of result.ids) {
        if (result.ics !== undefined && !overBudget) sources.push({ id, ics: result.ics })
        else {
          sources.push({
            id,
            error: overBudget ? 'response_too_large' : (result.error ?? 'fetch_failed'),
          })
        }
      }
    }
  } finally {
    // Always: success, throw, or deadline. A live timer keeps a warm serverless
    // instance awake, and an un-aborted controller leaks its listeners.
    clearTimeout(deadlineTimer)
    aggregate.abort()
  }

  // Per-user authenticated data: never store it in a shared or browser cache.
  // Freshness is managed client-side by the TanStack Query staleTime instead.
  return json(200, { sources, truncated }, { 'cache-control': 'no-store, private' })
}

/** Web-shaped handler — exported for unit tests. */
export const webHandler = withErrorBoundary(calendarFetch)
/** Vercel invokes the legacy (req, res) contract — see _lib/nodeAdapter.ts. */
export default toNodeHandler(webHandler)
