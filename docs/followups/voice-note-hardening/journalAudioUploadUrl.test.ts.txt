import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resetRateLimitStores } from './rateLimit.js'

/**
 * /api/journal-audio-upload-url — the DIRECT-BYPASS tests for voice notes.
 *
 * ── WHY THIS LIVES IN _lib/ AND NOT BESIDE ITS HANDLER ────────────────────
 *
 * Vercel counts every top-level `api/*.ts` file as a serverless function, TESTS
 * INCLUDED, and this project sits at its 12-function budget (checkFunctionBudget
 * in scripts/preflightLive.js). `api/_lib/` is excluded from that count, so a
 * test placed here costs nothing. Adding the endpoint required moving one
 * existing test here for the same reason.
 *
 * ── WHAT THESE ARE ACTUALLY PROVING ────────────────────────────────────────
 *
 * Not that a button is hidden. Every test here calls the endpoint the way an
 * attacker would: a raw request with a valid session and no UI in the loop. The
 * question is whether the SERVER refuses, and the answer has to come from the
 * database rather than from anything the caller said about itself.
 *
 * The riskiest property is not any single status code. It is that the caller
 * never chooses the object path: the key is built from the id in the verified
 * JWT, so a token cannot be aimed at another user's folder however the request
 * is shaped.
 */

const getUserFromAuthHeader = vi.fn()
const getSupabaseAdmin = vi.fn()

vi.mock('./supabase.js', () => ({
  getUserFromAuthHeader: (...a: unknown[]) => getUserFromAuthHeader(...a),
  getSupabaseAdmin: (...a: unknown[]) => getSupabaseAdmin(...a),
}))

const mod = await import('../journal-audio-upload-url.js')
const handler = mod.webHandler

const USER = { id: 'u-1', email: 'a@b.test', emailVerified: true }
const FOUNDER = { id: 'u-founder', email: 'founder@todonado.test', emailVerified: true }
const ENV_KEYS = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'] as const

const configure = () => {
  process.env.SUPABASE_URL = 'https://p.supabase.co'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-dummy'
}

/** Records the path the SERVER chose, so a test can assert the caller had no say. */
interface Signed {
  path?: string
  upsert?: boolean
}

function makeAdmin(opts: {
  billingPlan?: 'free' | 'pro' | null
  billingError?: { code?: string; message?: string }
  signError?: { message: string }
  signed?: Signed
}) {
  const { billingPlan = null, billingError, signError, signed } = opts
  return {
    from() {
      const result = billingError
        ? { data: null, error: billingError }
        : { data: billingPlan ? { plan: billingPlan } : null, error: null }
      const q = {
        select: () => q,
        eq: () => q,
        maybeSingle: async () => result,
      }
      return q
    },
    storage: {
      from() {
        return {
          createSignedUploadUrl: async (path: string, options?: { upsert?: boolean }) => {
            if (signed) {
              signed.path = path
              signed.upsert = options?.upsert
            }
            return signError
              ? { data: null, error: signError }
              : { data: { token: 'signed-token', path, signedUrl: 'https://x/y' }, error: null }
          },
        }
      },
    },
  }
}

const post = (headers: Record<string, string> = {}, body = '{"entryDate":"2026-08-18"}') =>
  new Request('https://www.todonado.com/api/journal-audio-upload-url', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body,
  })

const AUTH = { authorization: 'Bearer good' }

beforeEach(() => {
  vi.clearAllMocks()
  resetRateLimitStores()
  configure()
  getUserFromAuthHeader.mockResolvedValue(USER)
})

afterEach(() => {
  for (const k of ENV_KEYS) delete process.env[k]
})

describe('who is refused', () => {
  it('rejects a non-POST', async () => {
    const res = await handler(new Request('https://x/api/journal-audio-upload-url'))
    expect(res.status).toBe(405)
  })

  it('rejects an unauthenticated caller', async () => {
    getUserFromAuthHeader.mockResolvedValue(null)
    const res = await handler(post())
    expect(res.status).toBe(401)
  })

  it('DENIES A FREE USER — the whole point of the endpoint', async () => {
    /*
     * The UI gate is a render branch and the save-path guard is client code.
     * This is the one refusal an attacker cannot skip, because it is decided
     * from the billing row rather than from anything they sent.
     */
    getSupabaseAdmin.mockReturnValue(makeAdmin({ billingPlan: 'free' }))
    const res = await handler(post(AUTH))
    expect(res.status).toBe(403)
    expect(await res.json()).toEqual({ error: 'pro_required' })
  })

  it('denies a user with NO billing row at all', async () => {
    // No row is an ANSWER (never billed, therefore Free), not a failure.
    getSupabaseAdmin.mockReturnValue(makeAdmin({ billingPlan: null }))
    const res = await handler(post(AUTH))
    expect(res.status).toBe(403)
  })

  it('refuses a malformed date rather than narrating which field is wrong', async () => {
    getSupabaseAdmin.mockReturnValue(makeAdmin({ billingPlan: 'pro' }))
    for (const body of ['{}', '{"entryDate":"nope"}', '{"entryDate":"2026-13-45"}', 'not json']) {
      const res = await handler(post(AUTH, body))
      expect(res.status, body).toBe(400)
      expect(await res.json()).toEqual({ error: 'invalid_request' })
    }
  })

  it('is rate limited, so the signing endpoint cannot be run in a loop', async () => {
    getSupabaseAdmin.mockReturnValue(makeAdmin({ billingPlan: 'pro' }))
    let last = 200
    for (let i = 0; i < 20; i += 1) last = (await handler(post(AUTH))).status
    expect(last).toBe(429)
  })
})

describe('entitlement that cannot be resolved', () => {
  it('answers 503, NOT 403, so a paying customer is never told they are not entitled', async () => {
    /*
     * The distinction the whole entitlement module exists for. A 403 here would
     * mean a billing hiccup silently stops somebody recording their journal and
     * tells them they have to pay for something they already bought.
     */
    getSupabaseAdmin.mockReturnValue(
      makeAdmin({ billingError: { code: '42501', message: 'permission denied for table billing' } }),
    )
    const res = await handler(post(AUTH))
    expect(res.status).toBe(503)
    const body = (await res.json()) as { error: string; reason: string }
    expect(body.error).toBe('entitlement_unavailable')
    expect(body.reason).toBe('permission_denied')
  })

  it('fails CLOSED: an unresolved entitlement never yields an upload token', async () => {
    getSupabaseAdmin.mockReturnValue(makeAdmin({ billingError: { message: 'fetch failed' } }))
    const res = await handler(post(AUTH))
    expect(res.status).toBe(503)
    expect(await res.text()).not.toContain('token')
  })
})

describe('who is allowed', () => {
  it('issues a token to a paying Pro subscriber', async () => {
    getSupabaseAdmin.mockReturnValue(makeAdmin({ billingPlan: 'pro' }))
    const res = await handler(post(AUTH))
    expect(res.status).toBe(200)
    const body = (await res.json()) as { path: string; token: string }
    expect(body.token).toBe('signed-token')
    expect(body.path.startsWith(`${USER.id}/`)).toBe(true)
  })

  it('issues a token to a FOUNDING account with no billing row', async () => {
    /*
     * The case the packaging work turns on. Founding Pro is resolved from the
     * VERIFIED JWT alone, so it needs no billing row and keeps working while
     * billing is unreachable. After the founding seed lands it will resolve from
     * the row instead, and this test will still pass — which is the point.
     */
    getUserFromAuthHeader.mockResolvedValue(FOUNDER)
    getSupabaseAdmin.mockReturnValue(makeAdmin({ billingPlan: null }))
    const { FOUNDING_EMAILS } = await import('../../src/features/billing/planCore.js')
    getUserFromAuthHeader.mockResolvedValue({ ...FOUNDER, email: FOUNDING_EMAILS[0] })

    const res = await handler(post(AUTH))
    expect(res.status).toBe(200)
  })

  it('refuses an UNVERIFIED founding address (FLAG-8)', async () => {
    const { FOUNDING_EMAILS } = await import('../../src/features/billing/planCore.js')
    getUserFromAuthHeader.mockResolvedValue({
      ...FOUNDER,
      email: FOUNDING_EMAILS[0],
      emailVerified: false,
    })
    getSupabaseAdmin.mockReturnValue(makeAdmin({ billingPlan: null }))
    const res = await handler(post(AUTH))
    expect(res.status).toBe(403)
  })

  it('reports a storage failure as 500, distinct from an entitlement answer', async () => {
    getSupabaseAdmin.mockReturnValue(
      makeAdmin({ billingPlan: 'pro', signError: { message: 'bucket gone' } }),
    )
    const res = await handler(post(AUTH))
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: 'storage_unavailable' })
  })
})

describe('the SERVER chooses the path', () => {
  it('builds the key from the verified JWT, ignoring anything the caller sends', async () => {
    /*
     * THE SECURITY PROPERTY. If the caller could name the key, the signed token
     * would hand back exactly the authorisation the bucket policy exists to
     * enforce, and one request could write into somebody else's folder.
     */
    const signed: Signed = {}
    getSupabaseAdmin.mockReturnValue(makeAdmin({ billingPlan: 'pro', signed }))
    const res = await handler(
      post(
        AUTH,
        JSON.stringify({
          entryDate: '2026-08-18',
          path: 'someone-else/owned.webm',
          userId: 'victim',
        }),
      ),
    )
    expect(res.status).toBe(200)
    expect(signed.path?.startsWith('u-1/')).toBe(true)
    expect(signed.path).not.toContain('someone-else')
    expect(signed.path).not.toContain('victim')
  })

  it('never upserts, so a token cannot overwrite an existing recording', async () => {
    const signed: Signed = {}
    getSupabaseAdmin.mockReturnValue(makeAdmin({ billingPlan: 'pro', signed }))
    await handler(post(AUTH))
    expect(signed.upsert).toBe(false)
  })

  it('produces the documented key shape', async () => {
    /*
     * `<user_id>/<entryDate>-<unique>.webm`, matching `audioKey` in
     * src/features/journal/journal.ts. That module is not a leaf, so `api/`
     * cannot import it and the shape is written twice; the DRIFT guard that
     * compares the two lives in src/features/journal/audioKeyContract.test.ts,
     * where the `@/` alias resolves.
     */
    const signed: Signed = {}
    getSupabaseAdmin.mockReturnValue(makeAdmin({ billingPlan: 'pro', signed }))
    await handler(post(AUTH, '{"entryDate":"2026-08-18"}'))
    expect(signed.path).toMatch(new RegExp(String.raw`^${USER.id}/2026-08-18-[a-z0-9]+\.webm$`))
  })

  it('gives every recording its own key, so two in a day cannot collide', async () => {
    const a: Signed = {}
    const b: Signed = {}
    getSupabaseAdmin.mockReturnValue(makeAdmin({ billingPlan: 'pro', signed: a }))
    await handler(post(AUTH))
    getSupabaseAdmin.mockReturnValue(makeAdmin({ billingPlan: 'pro', signed: b }))
    await handler(post(AUTH))
    expect(a.path).not.toBe(b.path)
  })
})
