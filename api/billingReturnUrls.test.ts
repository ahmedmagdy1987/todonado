import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resetRateLimitStores } from './_lib/rateLimit.js'

/**
 * Where Stripe sends people back to, and how many subscriptions one person can
 * accidentally buy (audit FLAG-4 and FLAG-14).
 *
 * NEGATIVE CONTROL: with the source changes reverted (Origin-header
 * interpolation restored, and the billing lookup / idempotency key removed),
 * every test in the first three describe blocks fails.
 */

const getUserFromAuthHeader = vi.fn()
const getSupabaseAdmin = vi.fn()
const createCheckoutSession = vi.fn()
const createPortalSession = vi.fn()

vi.mock('./_lib/supabase.js', () => ({
  getUserFromAuthHeader: (...a: unknown[]) => getUserFromAuthHeader(...a),
  getSupabaseAdmin: (...a: unknown[]) => getSupabaseAdmin(...a),
}))

vi.mock('./_lib/stripe.js', () => ({
  getStripe: () => ({
    checkout: { sessions: { create: (...a: unknown[]) => createCheckoutSession(...a) } },
    billingPortal: { sessions: { create: (...a: unknown[]) => createPortalSession(...a) } },
  }),
}))

const checkout = (await import('./create-checkout-session.js')).webHandler
const portal = (await import('./create-portal-session.js')).webHandler

const UID = 'user-123'
const MONTHLY = 'price_configuredMonthly1'
/** The domain an attacker would like the returning customer to land on. */
const EVIL = 'https://evil.example.com'

const ENV_KEYS = [
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
  'STRIPE_PRICE_MONTHLY',
  'STRIPE_PRICE_YEARLY',
  'APP_BASE_URL',
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
] as const

function configure() {
  process.env.STRIPE_SECRET_KEY = 'sk_test_dummy'
  process.env.STRIPE_WEBHOOK_SECRET = 'whsec_dummy'
  process.env.STRIPE_PRICE_MONTHLY = MONTHLY
  process.env.STRIPE_PRICE_YEARLY = 'price_configuredYearly12'
  process.env.SUPABASE_URL = 'https://p.supabase.co'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-dummy'
}

/** A checkout POST that CLAIMS to come from the attacker's page. */
const spoofedCheckout = (origin = EVIL) =>
  new Request('https://www.todonado.com/api/create-checkout-session', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: 'Bearer good',
      origin,
    },
    body: JSON.stringify({ priceId: MONTHLY }),
  })

const spoofedPortal = (origin = EVIL) =>
  new Request('https://www.todonado.com/api/create-portal-session', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer good', origin },
  })

/** Billing double. `row` is what the billing lookup returns. */
function mockBilling(row: Record<string, unknown> | null) {
  getSupabaseAdmin.mockReturnValue({
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: row, error: null }) }),
      }),
    }),
  })
}

const sessionArgs = () =>
  createCheckoutSession.mock.calls[0][0] as Record<string, unknown>
const sessionOpts = () =>
  createCheckoutSession.mock.calls[0][1] as { idempotencyKey?: string } | undefined

let errorSpy: ReturnType<typeof vi.spyOn>
let warnSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  for (const k of ENV_KEYS) delete process.env[k]
  // The limiter's counters are module-level, so they survive between tests
  // in this file. Without this, the 11th checkout here would 429 (FLAG-10).
  resetRateLimitStores()
  getUserFromAuthHeader.mockReset()
  getSupabaseAdmin.mockReset()
  createCheckoutSession.mockReset()
  createPortalSession.mockReset()
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
  configure()
  getUserFromAuthHeader.mockResolvedValue({ id: UID, email: 'a@b.test' })
  createCheckoutSession.mockResolvedValue({ url: 'https://checkout.stripe.com/c/pay/cs_1' })
  createPortalSession.mockResolvedValue({ url: 'https://billing.stripe.com/p/session/1' })
  mockBilling(null)
})
afterEach(() => {
  for (const k of ENV_KEYS) delete process.env[k]
  errorSpy.mockRestore()
  warnSpy.mockRestore()
})

describe('FLAG-4 — a spoofed Origin can never become a Stripe return URL', () => {
  it('REQUIRED: checkout ignores the Origin header entirely', async () => {
    await checkout(spoofedCheckout())

    const args = sessionArgs()
    const urls = `${args.success_url} ${args.cancel_url}`
    expect(urls, 'the attacker domain must not appear in any return URL').not.toContain(
      'evil.example.com',
    )
    expect(args.success_url).toBe('https://www.todonado.com/settings/plan?checkout=success')
    expect(args.cancel_url).toBe('https://www.todonado.com/settings/plan?checkout=cancel')
  })

  it('REQUIRED: the portal ignores the Origin header entirely', async () => {
    mockBilling({ stripe_customer_id: 'cus_1' })

    await portal(spoofedPortal())

    const args = createPortalSession.mock.calls[0][0] as { return_url: string }
    expect(args.return_url).not.toContain('evil.example.com')
    expect(args.return_url).toBe('https://www.todonado.com/settings/plan')
  })

  it('uses APP_BASE_URL when it is configured', async () => {
    process.env.APP_BASE_URL = 'https://staging.todonado.com'

    await checkout(spoofedCheckout())

    expect(sessionArgs().success_url).toBe(
      'https://staging.todonado.com/settings/plan?checkout=success',
    )
  })

  it('strips any path or query someone put in APP_BASE_URL', async () => {
    process.env.APP_BASE_URL = 'https://staging.todonado.com/some/path?x=1'

    await checkout(spoofedCheckout())

    expect(sessionArgs().success_url).toBe(
      'https://staging.todonado.com/settings/plan?checkout=success',
    )
  })

  const badBases: Array<[string, string]> = [
    ['plain http on a public host', 'http://todonado.com'],
    ['embedded credentials that read as our domain', 'https://evil.example.com@todonado.com'],
    ['not a URL at all', 'todonado.com'],
    ['a javascript: scheme', 'javascript:alert(1)'],
  ]

  it.each(badBases)('ignores an unusable APP_BASE_URL (%s) and falls back', async (_l, value) => {
    process.env.APP_BASE_URL = value

    await checkout(spoofedCheckout())

    const args = sessionArgs()
    expect(args.success_url).toBe('https://www.todonado.com/settings/plan?checkout=success')
    expect(
      errorSpy.mock.calls.flat().join(' '),
      'a misconfigured base URL must be logged, not silently swallowed',
    ).toContain('APP_BASE_URL')
  })

  it('allows http://localhost so local dev still works', async () => {
    process.env.APP_BASE_URL = 'http://localhost:5173'

    await checkout(spoofedCheckout())

    expect(sessionArgs().success_url).toBe('http://localhost:5173/settings/plan?checkout=success')
  })
})

describe('FLAG-14 — one person cannot quietly buy two subscriptions', () => {
  it('REQUIRED: refuses checkout when an active subscription already exists', async () => {
    mockBilling({
      stripe_customer_id: 'cus_1',
      stripe_subscription_id: 'sub_1',
      subscription_status: 'active',
    })

    const res = await checkout(spoofedCheckout())

    expect(res.status).toBe(409)
    await expect(res.json()).resolves.toEqual({ error: 'already_subscribed' })
    expect(
      createCheckoutSession,
      'Stripe must not be asked to create a second subscription',
    ).not.toHaveBeenCalled()
  })

  it('also refuses while the subscription is past_due (dunning, not gone)', async () => {
    mockBilling({
      stripe_customer_id: 'cus_1',
      stripe_subscription_id: 'sub_1',
      subscription_status: 'past_due',
    })

    expect((await checkout(spoofedCheckout())).status).toBe(409)
  })

  it('REQUIRED: sends an idempotency key so a double-click yields one session', async () => {
    await checkout(spoofedCheckout())

    const key = sessionOpts()?.idempotencyKey
    expect(key, 'a retried POST must not create a second checkout').toBeTruthy()
    expect(key).toContain(UID)
    expect(key).toContain(MONTHLY)
  })

  it('the key is stable across immediate retries', async () => {
    await checkout(spoofedCheckout())
    const first = sessionOpts()?.idempotencyKey
    createCheckoutSession.mockClear()
    await checkout(spoofedCheckout())
    const second = (createCheckoutSession.mock.calls[0][1] as { idempotencyKey: string })
      .idempotencyKey

    expect(second).toBe(first)
  })

  it('REQUIRED: reuses the stored Stripe customer instead of minting a new one', async () => {
    mockBilling({ stripe_customer_id: 'cus_existing', subscription_status: 'canceled' })

    await checkout(spoofedCheckout())

    const args = sessionArgs()
    expect(args.customer).toBe('cus_existing')
    expect(
      args.customer_email,
      'customer and customer_email are mutually exclusive; sending the email mints a duplicate customer',
    ).toBeUndefined()
  })

  it('falls back to customer_email for a genuinely new customer', async () => {
    mockBilling(null)

    await checkout(spoofedCheckout())

    const args = sessionArgs()
    expect(args.customer).toBeUndefined()
    expect(args.customer_email).toBe('a@b.test')
  })
})

describe('FLAG-14 — the guard must not trap legitimate customers', () => {
  it('lets a cancelled subscriber resubscribe', async () => {
    mockBilling({
      stripe_customer_id: 'cus_1',
      stripe_subscription_id: 'sub_old',
      subscription_status: 'canceled',
    })

    const res = await checkout(spoofedCheckout())

    expect(res.status).toBe(200)
    expect(createCheckoutSession).toHaveBeenCalledTimes(1)
  })

  it('lets a user with a customer record but no subscription check out', async () => {
    mockBilling({ stripe_customer_id: 'cus_1', stripe_subscription_id: null })

    expect((await checkout(spoofedCheckout())).status).toBe(200)
  })

  it('surfaces a billing lookup failure rather than charging blindly', async () => {
    getSupabaseAdmin.mockReturnValue({
      from: () => ({
        select: () => ({
          eq: () => ({ maybeSingle: async () => ({ data: null, error: { message: 'boom' } }) }),
        }),
      }),
    })

    const res = await checkout(spoofedCheckout())

    expect(res.status).toBe(500)
    await expect(res.json()).resolves.toEqual({ error: 'billing_lookup_failed' })
    expect(createCheckoutSession).not.toHaveBeenCalled()
  })
})
