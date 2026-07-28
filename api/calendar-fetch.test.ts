import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

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
  sources?: { id: string; url: string | null }[]
  sourcesError?: boolean
  captured?: Captured
}) {
  const { billingPlan = null, sources = [], sourcesError = false, captured } = opts
  return {
    from(table: string) {
      const result =
        table === 'billing'
          ? { data: billingPlan ? { plan: billingPlan } : null, error: null }
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

  it('answers 503 with variable NAMES (never values) when unconfigured', async () => {
    const res = await handler(post())
    expect(res.status).toBe(503)
    const body = (await res.json()) as { error: string; missing: string[] }
    expect(body.error).toBe('not_configured')
    expect(body.missing).toEqual(['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'])
    expect(JSON.stringify(body)).not.toContain('service-role')
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
    getUserFromAuthHeader.mockResolvedValue({ id: 'u1', email: 'free@example.com' })
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
    getUserFromAuthHeader.mockResolvedValue({ id: 'u2', email: 'journeypixofficial@gmail.com' })
    getSupabaseAdmin.mockReturnValue(
      makeAdmin({ billingPlan: null, sources: [{ id: 's1', url: 'https://cal.example/a.ics' }] }),
    )
    fetchIcsGuarded.mockResolvedValue('BEGIN:VEVENT')
    expect((await handler(post({ authorization: 'Bearer good' }))).status).toBe(200)
  })
})

describe('open-proxy guard', () => {
  beforeEach(() => {
    configure()
    getUserFromAuthHeader.mockResolvedValue({ id: 'u1', email: 'pro@example.com' })
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
    getUserFromAuthHeader.mockResolvedValue({ id: 'u1', email: 'pro@example.com' })
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
