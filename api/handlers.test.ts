import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { applyTestModeEnv, clearTestModeEnv } from '../src/test/stripeDoubles.js'

/**
 * Status/body mapping for the billing endpoints. Every failure must be a
 * PRECISE, safe code — never a bare 500, never a secret value.
 */

const getUserFromAuthHeader = vi.fn()
const getSupabaseAdmin = vi.fn()

vi.mock('./_lib/supabase.js', () => ({
  getUserFromAuthHeader: (...a: unknown[]) => getUserFromAuthHeader(...a),
  getSupabaseAdmin: (...a: unknown[]) => getSupabaseAdmin(...a),
}))

// The DEFAULT export is the Node-contract adapter Vercel invokes; the Web-shaped
// handler is exported separately so the logic can be tested with plain Requests.
const checkoutMod = await import('./create-checkout-session.js')
const portalMod = await import('./create-portal-session.js')
const webhookMod = await import('./stripe-webhook.js')
const checkout = checkoutMod.webHandler
const portal = portalMod.webHandler
const webhook = webhookMod.webHandler

function configure() {
  // A CONSISTENT deployment: STRIPE_MODE=test with test keys and matching
  // client/server price ids. Shared with the other billing suites so a change
  // to what "configured" means breaks all of them together.
  applyTestModeEnv()
}

const post = (body?: unknown, headers: Record<string, string> = {}) =>
  new Request('https://www.todonado.com/api/x', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  })

beforeEach(() => {
  clearTestModeEnv()
  getUserFromAuthHeader.mockReset()
  getSupabaseAdmin.mockReset()
})
afterEach(() => {
  clearTestModeEnv()
})

describe.each([
  ['create-checkout-session', checkoutMod],
  ['create-portal-session', portalMod],
  ['stripe-webhook', webhookMod],
])('%s default export (the contract Vercel invokes)', (_name, mod) => {
  /**
   * REGRESSION GUARD. Vercel calls these with the legacy `(req, res)` signature.
   * A default export that takes ONE arg and returns a Response has its return
   * value discarded — nothing is written to `res` and the request HANGS with no
   * error and no log. Production symptom: connection opens, zero bytes, forever.
   */
  it('is a 2-argument (req, res) Node handler, not a 1-arg Web handler', () => {
    expect(typeof mod.default).toBe('function')
    expect(mod.default.length).toBe(2)
  })

  it('also exposes the Web-shaped handler for testing', () => {
    expect(typeof mod.webHandler).toBe('function')
  })
})

describe.each([
  ['create-checkout-session', checkout],
  ['create-portal-session', portal],
  ['stripe-webhook', webhook],
])('%s', (_name, handler) => {
  it('rejects a non-POST with 405 — and does NOT crash (the outage symptom)', async () => {
    const res = await handler(new Request('https://www.todonado.com/api/x', { method: 'GET' }))
    expect(res.status).toBe(405)
    await expect(res.json()).resolves.toEqual({ error: 'method_not_allowed' })
  })

  it('answers 503 to an ANONYMOUS caller without naming a single variable', async () => {
    // This used to assert the opposite — that the NAMES were returned — and the
    // names were the leak: to a stranger they map the deployment (is billing
    // live? is the webhook armed? does this hold a service-role key?). An
    // unauthenticated caller now learns only that something is unset.
    const res = await handler(post({}))
    expect(res.status).toBe(503)
    const body = (await res.json()) as { error: string; missing?: string[] }
    expect(body.error).toBe('not_configured')
    expect(body.missing, 'variable names must not reach an anonymous caller').toBeUndefined()
    for (const name of ['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET', 'SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_URL']) {
      expect(JSON.stringify(body)).not.toContain(name)
    }
  })
})

describe('create-checkout-session', () => {
  it('401s when the bearer token is absent or invalid', async () => {
    configure()
    getUserFromAuthHeader.mockResolvedValue(null)
    const res = await checkout(post({ priceId: 'price_1QAbCdEfGhIj' }))
    expect(res.status).toBe(401)
    await expect(res.json()).resolves.toEqual({ error: 'unauthorized' })
  })

  it('400 missing_price_id when the body has no price', async () => {
    configure()
    getUserFromAuthHeader.mockResolvedValue({ id: 'u1', email: 'a@b.test' })
    const res = await checkout(post({}, { authorization: 'Bearer good' }))
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error: 'missing_price_id' })
  })

  it('400 missing_price_id when the body is not valid JSON', async () => {
    configure()
    getUserFromAuthHeader.mockResolvedValue({ id: 'u1', email: 'a@b.test' })
    const req = new Request('https://www.todonado.com/api/x', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer good' },
      body: 'not-json',
    })
    const res = await checkout(req)
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error: 'missing_price_id' })
  })

  it('400 invalid_price for a malformed price id (never forwarded to Stripe)', async () => {
    configure()
    getUserFromAuthHeader.mockResolvedValue({ id: 'u1', email: 'a@b.test' })
    const res = await checkout(post({ priceId: 'prod_notaprice' }, { authorization: 'Bearer good' }))
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error: 'invalid_price' })
  })

  it('500 internal_error (not a naked crash) if something throws unexpectedly', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    configure()
    getUserFromAuthHeader.mockRejectedValue(new Error('kaboom sk_test_dummy'))
    const res = await checkout(post({ priceId: 'price_1QAbCdEfGhIj' }, { authorization: 'Bearer x' }))
    expect(res.status).toBe(500)
    const text = await res.text()
    expect(text).toBe('{"error":"internal_error"}')
    expect(text).not.toContain('sk_test_dummy')
    spy.mockRestore()
  })
})

describe('create-portal-session', () => {
  it('401s without a valid token', async () => {
    configure()
    getUserFromAuthHeader.mockResolvedValue(null)
    const res = await portal(post({}, {}))
    expect(res.status).toBe(401)
    await expect(res.json()).resolves.toEqual({ error: 'unauthorized' })
  })

  it('400 no_subscription when the user has no stripe customer', async () => {
    configure()
    getUserFromAuthHeader.mockResolvedValue({ id: 'u1', email: 'a@b.test' })
    getSupabaseAdmin.mockReturnValue({
      from: () => ({
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
      }),
    })
    const res = await portal(post({}, { authorization: 'Bearer good' }))
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error: 'no_subscription' })
  })

  it('500 billing_lookup_failed when the billing read errors', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    configure()
    getUserFromAuthHeader.mockResolvedValue({ id: 'u1', email: 'a@b.test' })
    getSupabaseAdmin.mockReturnValue({
      from: () => ({
        select: () => ({
          eq: () => ({ maybeSingle: async () => ({ data: null, error: { message: 'boom' } }) }),
        }),
      }),
    })
    const res = await portal(post({}, { authorization: 'Bearer good' }))
    expect(res.status).toBe(500)
    await expect(res.json()).resolves.toEqual({ error: 'billing_lookup_failed' })
    spy.mockRestore()
  })
})

describe('stripe-webhook', () => {
  it('400 missing_signature when the stripe-signature header is absent', async () => {
    configure()
    const res = await webhook(post({ id: 'evt_1' }))
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error: 'missing_signature' })
  })

  it('400 invalid_signature (generic) when verification fails — no secret echoed', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    configure()
    const res = await webhook(post({ id: 'evt_1' }, { 'stripe-signature': 't=1,v1=deadbeef' }))
    expect(res.status).toBe(400)
    const text = await res.text()
    expect(text).toBe('{"error":"invalid_signature"}')
    expect(text).not.toContain('whsec_')
    spy.mockRestore()
  })

  it('503 says nothing about WHICH variable is missing', async () => {
    /*
     * This used to assert `missing: ['STRIPE_WEBHOOK_SECRET']` came back in the
     * body. The webhook's caller is Stripe, identified by a signature it cannot
     * verify until that very secret is set — so there is no moment at which a
     * trusted caller exists, and anyone on the internet could read the list.
     * The names go to the server log instead.
     */
    configure()
    delete process.env.STRIPE_WEBHOOK_SECRET
    const res = await webhook(post({ id: 'evt_1' }))
    expect(res.status).toBe(503)
    const body = (await res.json()) as { error: string; missing?: string[] }
    expect(body.error).toBe('not_configured')
    expect(body.missing).toBeUndefined()
    expect(JSON.stringify(body)).not.toContain('STRIPE_WEBHOOK_SECRET')
  })
})
