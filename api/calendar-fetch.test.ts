import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resetRateLimitStores } from './_lib/rateLimit.js'

/**
 * /api/calendar-fetch — auth, the SERVER-SIDE Pro gate, and the open-proxy guard.
 *
 * The riskiest property here is not any single status code: it is that the
 * endpoint must never fetch a URL supplied by the CALLER. It reads URLs only
 * from the caller's own calendar_sources rows, so there is no way to point it at
 * an arbitrary host even with a valid Pro session.
 */

const getUserFromAuthHeader = vi.fn()
const getSupabaseAdmin = vi.fn()
const fetchIcsGuarded = vi.fn()

vi.mock('./_lib/supabase.js', () => ({
  getUserFromAuthHeader: (...a: unknown[]) => getUserFromAuthHeader(...a),
  getSupabaseAdmin: (...a: unknown[]) => getSupabaseAdmin(...a),
}))
vi.mock('./_lib/ssrf.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./_lib/ssrf.js')>()
  return { ...actual, fetchIcsGuarded: (...a: unknown[]) => fetchIcsGuarded(...a) }
})

const mod = await import('./calendar-fetch.js')
const handler = mod.webHandler
const { SsrfError } = await import('./_lib/ssrf.js')

const ENV_KEYS = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'] as const
const configure = () => {
  process.env.SUPABASE_URL = 'https://p.supabase.co'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-dummy'
}

interface Captured {
  columns: Record<string, string>
}

/**
 * Minimal stand-in for the Supabase query builder: `.select().eq().eq()` is
 * awaitable (thenable), and `.maybeSingle()` resolves for the billing lookup.
 */
function makeAdmin(opts: {
  billingPlan?: 'free' | 'pro' | null
  /** A PostgREST error for the BILLING lookup — the entitlement-unavailable path. */
  billingError?: { code?: string; message?: string }
  sources?: { id: string; url: string | null }[]
  sourcesError?: boolean
  captured?: Captured
}) {
  const { billingPlan = null, billingError, sources = [], sourcesError = false, captured } = opts
  return {
    from(table: string) {
      const result =
        table === 'billing'
          ? billingError
            ? { data: null, error: billingError }
            : { data: billingPlan ? { plan: billingPlan } : null, error: null }
          : { data: sourcesError ? null : sources, error: sourcesError ? { message: 'x' } : null }
      const q = {
        select: () => q,
        eq: (col: string, val: string) => {
          if (captured && table === 'calendar_sources') captured.columns[col] = val
          return q
        },
        maybeSingle: async () => result,
        then: <T>(res: (v: typeof result) => T, rej?: (e: unknown) => T) =>
          Promise.resolve(result).then(res, rej),
      }
      return q
    },
  }
}

const post = (headers: Record<string, string> = {}, body = '{}') =>
  new Request('https://www.todonado.com/api/calendar-fetch', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body,
  })

beforeEach(() => {
  // Module-level limiter counters survive between tests in this file;
  // without this the 7th calendar fetch here would 429 (FLAG-10).
  resetRateLimitStores()
  for (const k of ENV_KEYS) delete process.env[k]
  getUserFromAuthHeader.mockReset()
  getSupabaseAdmin.mockReset()
  fetchIcsGuarded.mockReset()
})
afterEach(() => {
  for (const k of ENV_KEYS) delete process.env[k]
})

describe('default export (the contract Vercel invokes)', () => {
  it('is a 2-argument (req, res) Node handler, not a 1-arg Web handler', () => {
    expect(typeof mod.default).toBe('function')
    expect(mod.default.length).toBe(2)
  })
})

describe('method + configuration', () => {
  it('rejects non-POST', async () => {
    const res = await handler(new Request('https://x/api/calendar-fetch', { method: 'GET' }))
    expect(res.status).toBe(405)
    expect(await res.json()).toEqual({ error: 'method_not_allowed' })
  })

  it('answers 503 to an ANONYMOUS caller without naming a single variable', async () => {
    // Was asserting that the NAMES came back. Authentication needs both of those
    // variables, so the check must stay ahead of it — what changed is that it no
    // longer says which one is missing to someone who has not identified
    // themselves.
    const res = await handler(post())
    expect(res.status).toBe(503)
    const body = (await res.json()) as { error: string; missing?: string[] }
    expect(body.error).toBe('not_configured')
    expect(body.missing, 'variable names must not reach an anonymous caller').toBeUndefined()
    for (const name of ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']) {
      expect(JSON.stringify(body)).not.toContain(name)
    }
  })
})

describe('authentication', () => {
  it('rejects an unauthenticated call', async () => {
    configure()
    getUserFromAuthHeader.mockResolvedValue(null)
    const res = await handler(post())
    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: 'unauthorized' })
  })

  it('rejects a garbage bearer token', async () => {
    configure()
    getUserFromAuthHeader.mockResolvedValue(null)
    const res = await handler(post({ authorization: 'Bearer nonsense' }))
    expect(res.status).toBe(401)
  })
})

describe('the Pro gate is enforced SERVER-SIDE', () => {
  beforeEach(() => {
    configure()
    getUserFromAuthHeader.mockResolvedValue({ id: 'u1', email: 'free@example.com', emailVerified: true })
  })

  it('answers 403 pro_required for a Free user', async () => {
    getSupabaseAdmin.mockReturnValue(makeAdmin({ billingPlan: 'free' }))
    const res = await handler(post({ authorization: 'Bearer good' }))
    expect(res.status).toBe(403)
    expect(await res.json()).toEqual({ error: 'pro_required' })
    expect(fetchIcsGuarded, 'must not fetch anything for a Free caller').not.toHaveBeenCalled()
  })

  it('answers 403 when there is no billing row at all', async () => {
    getSupabaseAdmin.mockReturnValue(makeAdmin({ billingPlan: null }))
    expect((await handler(post({ authorization: 'Bearer good' }))).status).toBe(403)
  })

  it('allows a paid Pro subscriber', async () => {
    getSupabaseAdmin.mockReturnValue(
      makeAdmin({ billingPlan: 'pro', sources: [{ id: 's1', url: 'https://cal.example/a.ics' }] }),
    )
    fetchIcsGuarded.mockResolvedValue('BEGIN:VEVENT')
    const res = await handler(post({ authorization: 'Bearer good' }))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ sources: [{ id: 's1', ics: 'BEGIN:VEVENT' }] })
  })

  it('allows a founding account with no billing row', async () => {
    getUserFromAuthHeader.mockResolvedValue({ id: 'u2', email: 'journeypixofficial@gmail.com', emailVerified: true })
    getSupabaseAdmin.mockReturnValue(
      makeAdmin({ billingPlan: null, sources: [{ id: 's1', url: 'https://cal.example/a.ics' }] }),
    )
    fetchIcsGuarded.mockResolvedValue('BEGIN:VEVENT')
    expect((await handler(post({ authorization: 'Bearer good' }))).status).toBe(200)
  })
})

describe('an UNRESOLVABLE entitlement is 503, never 403', () => {
  /*
   * THIS IS THE CASE THAT USED TO BE INVISIBLE. resolveServerPlan swallowed the
   * lookup error and returned Free, so a `42501 permission denied for table
   * billing` — the exact error 20260801160000 was written to fix — reached the
   * customer as "you are not a Pro subscriber". A 403 is a statement about the
   * user; the server did not have the facts to make one.
   */
  beforeEach(() => {
    configure()
    getUserFromAuthHeader.mockResolvedValue({
      id: 'u1',
      email: 'subscriber@example.com',
      emailVerified: true,
    })
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  const FAILURES: [string, { code?: string; message?: string }, string][] = [
    ['permission denied', { code: '42501', message: 'permission denied for table billing' }, 'permission_denied'],
    ['billing not applied', { code: '42P01', message: 'relation "billing" does not exist' }, 'schema_outdated'],
    ['schema cache miss', { code: 'PGRST205', message: 'not found in schema cache' }, 'schema_outdated'],
  ]

  it.each(FAILURES)('%s answers 503 entitlement_unavailable', async (_label, error, reason) => {
    getSupabaseAdmin.mockReturnValue(makeAdmin({ billingError: error }))
    const res = await handler(post({ authorization: 'Bearer good' }))
    expect(res.status, 'a lookup failure is not a statement about the user').toBe(503)
    expect(await res.json()).toEqual({
      error: 'entitlement_unavailable',
      reason,
      retry_after: 30,
    })
    expect(fetchIcsGuarded, 'nothing is fetched when entitlement is unknown').not.toHaveBeenCalled()
  })

  it.each(FAILURES)('%s is NOT reported as 403 pro_required', async (_label, error) => {
    getSupabaseAdmin.mockReturnValue(makeAdmin({ billingError: error }))
    const res = await handler(post({ authorization: 'Bearer good' }))
    expect(res.status).not.toBe(403)
    expect(await res.text()).not.toContain('pro_required')
  })

  it('does NOT fail open: an unresolvable entitlement never returns calendar data', async () => {
    getSupabaseAdmin.mockReturnValue(
      makeAdmin({
        billingError: { code: '42501', message: 'permission denied for table billing' },
        sources: [{ id: 's1', url: 'https://cal.example/a.ics' }],
      }),
    )
    fetchIcsGuarded.mockResolvedValue('BEGIN:VEVENT')
    const res = await handler(post({ authorization: 'Bearer good' }))
    expect(res.status).toBe(503)
    expect(await res.text()).not.toContain('BEGIN:VEVENT')
  })

  it('a VERIFIED founder still works while billing is refusing', async () => {
    getUserFromAuthHeader.mockResolvedValue({
      id: 'u2',
      email: 'journeypixofficial@gmail.com',
      emailVerified: true,
    })
    getSupabaseAdmin.mockReturnValue(
      makeAdmin({
        billingError: { code: '42501', message: 'permission denied for table billing' },
        sources: [{ id: 's1', url: 'https://cal.example/a.ics' }],
      }),
    )
    fetchIcsGuarded.mockResolvedValue('BEGIN:VEVENT')
    expect((await handler(post({ authorization: 'Bearer good' }))).status).toBe(200)
  })
})

describe('open-proxy guard', () => {
  beforeEach(() => {
    configure()
    getUserFromAuthHeader.mockResolvedValue({ id: 'u1', email: 'pro@example.com', emailVerified: true })
  })

  it('IGNORES a URL in the request body and only reads the caller’s own rows', async () => {
    const captured: Captured = { columns: {} }
    getSupabaseAdmin.mockReturnValue(
      makeAdmin({
        billingPlan: 'pro',
        sources: [{ id: 's1', url: 'https://legit.example/a.ics' }],
        captured,
      }),
    )
    fetchIcsGuarded.mockResolvedValue('BEGIN:VEVENT')

    await handler(
      post(
        { authorization: 'Bearer good' },
        JSON.stringify({ url: 'http://169.254.169.254/latest/meta-data/' }),
      ),
    )

    // Only the stored URL was ever fetched — the body value is unreachable.
    expect(fetchIcsGuarded).toHaveBeenCalledTimes(1)
    expect(fetchIcsGuarded.mock.calls[0][0]).toBe('https://legit.example/a.ics')
    // And the query was scoped to the VERIFIED caller + url kind.
    expect(captured.columns).toEqual({ user_id: 'u1', kind: 'url' })
  })
})

describe('per-source error mapping is safe', () => {
  beforeEach(() => {
    configure()
    getUserFromAuthHeader.mockResolvedValue({ id: 'u1', email: 'pro@example.com', emailVerified: true })
  })

  it('collapses every "unacceptable URL" reason to invalid_source', async () => {
    getSupabaseAdmin.mockReturnValue(
      makeAdmin({ billingPlan: 'pro', sources: [{ id: 's1', url: 'https://x.example/a.ics' }] }),
    )
    fetchIcsGuarded.mockRejectedValue(new SsrfError('private_host', '10.0.0.1 is internal'))
    const res = await handler(post({ authorization: 'Bearer good' }))
    const body = (await res.json()) as { sources: { id: string; error: string }[] }
    expect(body.sources).toEqual([{ id: 's1', error: 'invalid_source' }])
    // The resolved address must never reach the client.
    expect(JSON.stringify(body)).not.toContain('10.0.0.1')
  })

  it('reports a genuine upstream failure as fetch_failed', async () => {
    getSupabaseAdmin.mockReturnValue(
      makeAdmin({ billingPlan: 'pro', sources: [{ id: 's1', url: 'https://x.example/a.ics' }] }),
    )
    fetchIcsGuarded.mockRejectedValue(new SsrfError('fetch_failed'))
    const res = await handler(post({ authorization: 'Bearer good' }))
    expect((await res.json()) as unknown).toEqual({ sources: [{ id: 's1', error: 'fetch_failed' }] })
  })

  it('flags a row with no URL instead of crashing', async () => {
    getSupabaseAdmin.mockReturnValue(
      makeAdmin({ billingPlan: 'pro', sources: [{ id: 's1', url: null }] }),
    )
    const res = await handler(post({ authorization: 'Bearer good' }))
    expect((await res.json()) as unknown).toEqual({ sources: [{ id: 's1', error: 'invalid_source' }] })
    expect(fetchIcsGuarded).not.toHaveBeenCalled()
  })

  it('maps a sources lookup failure to a precise code', async () => {
    getSupabaseAdmin.mockReturnValue(makeAdmin({ billingPlan: 'pro', sourcesError: true }))
    const res = await handler(post({ authorization: 'Bearer good' }))
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: 'calendar_lookup_failed' })
  })

  it('never caches per-user calendar data', async () => {
    getSupabaseAdmin.mockReturnValue(makeAdmin({ billingPlan: 'pro', sources: [] }))
    const res = await handler(post({ authorization: 'Bearer good' }))
    expect(res.headers.get('cache-control')).toContain('no-store')
  })
})
