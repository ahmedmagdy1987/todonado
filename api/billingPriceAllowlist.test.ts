import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resetRateLimitStores } from './_lib/rateLimit.js'
import type { MinimalStripeEvent } from '../src/features/billing/webhookMapping.js'

/**
 * The server sells exactly two prices, and nothing else buys Pro (audit FLAG-2).
 *
 * Both halves of the flag are exercised here because either alone is porous:
 * a checkout that validates the price is useless if the webhook grants Pro for
 * whatever turns up, and a webhook that verifies the purchase still lets a user
 * subscribe at a price we never meant to sell.
 *
 * NEGATIVE CONTROL: with the two source changes reverted (the allow-list call
 * in create-checkout-session.ts and the price verification in
 * stripe-webhook.ts), every test in the first two describe blocks fails.
 */

const getUserFromAuthHeader = vi.fn()
const getSupabaseAdmin = vi.fn()
const constructEvent = vi.fn()
const createCheckoutSession = vi.fn()

vi.mock('./_lib/supabase.js', () => ({
  getUserFromAuthHeader: (...a: unknown[]) => getUserFromAuthHeader(...a),
  getSupabaseAdmin: (...a: unknown[]) => getSupabaseAdmin(...a),
}))

vi.mock('./_lib/stripe.js', () => ({
  getStripe: () => ({
    checkout: { sessions: { create: (...a: unknown[]) => createCheckoutSession(...a) } },
    webhooks: { constructEvent: (...a: unknown[]) => constructEvent(...a) },
  }),
}))

const checkout = (await import('./create-checkout-session.js')).webHandler
const webhook = (await import('./stripe-webhook.js')).webHandler

const UID = 'user-123'
const MONTHLY = 'price_configuredMonthly1'
const YEARLY = 'price_configuredYearly12'
/** Well-formed, real-looking, and NOT ours. The whole point of the flag. */
const FOREIGN = 'price_grandfatheredCheap9'

const ENV_KEYS = [
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
  'STRIPE_PRICE_MONTHLY',
  'STRIPE_PRICE_YEARLY',
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
] as const

function configure() {
  process.env.STRIPE_SECRET_KEY = 'sk_test_dummy'
  process.env.STRIPE_WEBHOOK_SECRET = 'whsec_dummy'
  process.env.STRIPE_PRICE_MONTHLY = MONTHLY
  process.env.STRIPE_PRICE_YEARLY = YEARLY
  process.env.SUPABASE_URL = 'https://p.supabase.co'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-dummy'
}

const checkoutPost = (priceId: unknown) =>
  new Request('https://www.todonado.com/api/create-checkout-session', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer good' },
    body: JSON.stringify({ priceId }),
  })

const signedPost = () =>
  new Request('https://www.todonado.com/api/stripe-webhook', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'stripe-signature': 't=1,v1=ok' },
    body: JSON.stringify({ ignored: 'the mock returns the event' }),
  })

interface RecordedWrite {
  row: Record<string, unknown>
}

/** Records writes; supports the read-then-write shape the webhook uses. */
function makeAdmin(current: Record<string, unknown> | null) {
  const writes: RecordedWrite[] = []
  const capture = async (row: Record<string, unknown>) => {
    writes.push({ row })
    return { error: null }
  }
  const admin = {
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: current, error: null }) }),
      }),
      upsert: capture,
      insert: capture,
      update: (row: Record<string, unknown>) => ({
        eq: () => ({
          or: () => ({
            select: async () => {
              writes.push({ row })
              return { data: [{ user_id: UID }], error: null }
            },
          }),
        }),
      }),
    }),
  }
  return { admin, writes }
}

const grants = (writes: RecordedWrite[]) => writes.filter((w) => w.row.plan === 'pro')

/** A customer.subscription.updated naming `priceId` in its line items. */
const subEvent = (priceId: string | null): MinimalStripeEvent => ({
  id: 'evt_sub',
  created: 1_800_000_500,
  type: 'customer.subscription.updated',
  data: {
    object: {
      id: 'sub_1',
      status: 'active',
      current_period_end: 1_802_592_500,
      customer: 'cus_1',
      metadata: { user_id: UID },
      items: priceId === null ? { data: [] } : { data: [{ price: { id: priceId } }] },
    },
  },
})

/** A checkout.session.completed carrying the price we stamped at creation. */
const sessionEvent = (priceId: string | null): MinimalStripeEvent => ({
  id: 'evt_cs',
  created: 1_800_000_500,
  type: 'checkout.session.completed',
  data: {
    object: {
      customer: 'cus_1',
      subscription: 'sub_1',
      metadata: priceId === null ? { user_id: UID } : { user_id: UID, price_id: priceId },
    },
  },
})

let errorSpy: ReturnType<typeof vi.spyOn>
let warnSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  for (const k of ENV_KEYS) delete process.env[k]
  // The limiter's counters are module-level, so they survive between tests
  // in this file. Without this, the 11th checkout here would 429 (FLAG-10).
  resetRateLimitStores()
  getUserFromAuthHeader.mockReset()
  getSupabaseAdmin.mockReset()
  constructEvent.mockReset()
  createCheckoutSession.mockReset()
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
  configure()
  getUserFromAuthHeader.mockResolvedValue({ id: UID, email: 'a@b.test' })
  createCheckoutSession.mockResolvedValue({ url: 'https://checkout.stripe.com/c/pay/cs_test_1' })
  // Checkout reads the billing row since FLAG-14 (to reuse the customer and
  // refuse a duplicate subscription). Default: this user has no billing row.
  getSupabaseAdmin.mockReturnValue(makeAdmin(null).admin)
})
afterEach(() => {
  for (const k of ENV_KEYS) delete process.env[k]
  errorSpy.mockRestore()
  warnSpy.mockRestore()
})

describe('checkout — only the configured prices are sellable', () => {
  it('REQUIRED: rejects a well-formed price id this deployment does not sell', async () => {
    const res = await checkout(checkoutPost(FOREIGN))

    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error: 'invalid_price' })
    expect(
      createCheckoutSession,
      'a price the server did not configure must never reach Stripe',
    ).not.toHaveBeenCalled()
  })

  it('accepts the configured monthly price', async () => {
    const res = await checkout(checkoutPost(MONTHLY))
    expect(res.status).toBe(200)
    expect(createCheckoutSession).toHaveBeenCalledTimes(1)
  })

  it('accepts the configured yearly price', async () => {
    const res = await checkout(checkoutPost(YEARLY))
    expect(res.status).toBe(200)
  })

  it('stamps the validated price into metadata so the webhook can verify it', async () => {
    await checkout(checkoutPost(MONTHLY))
    const args = createCheckoutSession.mock.calls[0][0] as {
      metadata: Record<string, string>
      subscription_data: { metadata: Record<string, string> }
    }
    expect(args.metadata.price_id).toBe(MONTHLY)
    expect(args.subscription_data.metadata.price_id).toBe(MONTHLY)
  })

  it('fails CLOSED — with no prices configured, even a real-looking id is refused', async () => {
    delete process.env.STRIPE_PRICE_MONTHLY
    delete process.env.STRIPE_PRICE_YEARLY

    const res = await checkout(checkoutPost(MONTHLY))

    // 503 naming the unset vars to an AUTHENTICATED caller is the existing
    // contract; what must never happen is a 200 with a session.
    expect(res.status).toBe(503)
    expect(createCheckoutSession).not.toHaveBeenCalled()
  })

  it('still 400s malformed junk, distinctly from a price we do not sell', async () => {
    const res = await checkout(checkoutPost('prod_notaprice'))
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error: 'invalid_price' })
  })
})

describe('webhook — Pro is granted only for a price we actually sell', () => {
  it('REQUIRED: a subscription on an unconfigured price does NOT grant Pro', async () => {
    const { admin, writes } = makeAdmin(null)
    getSupabaseAdmin.mockReturnValue(admin)
    constructEvent.mockReturnValue(subEvent(FOREIGN))

    const res = await webhook(signedPost())

    expect(res.status).toBe(200)
    expect(grants(writes), 'an unrecognised purchase must not buy the paid tier').toEqual([])
  })

  it('REQUIRED: a forged checkout.session.completed price does NOT grant Pro', async () => {
    const { admin, writes } = makeAdmin(null)
    getSupabaseAdmin.mockReturnValue(admin)
    constructEvent.mockReturnValue(sessionEvent(FOREIGN))

    await webhook(signedPost())

    expect(grants(writes)).toEqual([])
  })

  it('REQUIRED: an event with NO readable price does not grant Pro either', async () => {
    // "Unverifiable" must not collapse into "fine".
    const { admin, writes } = makeAdmin(null)
    getSupabaseAdmin.mockReturnValue(admin)
    constructEvent.mockReturnValue(subEvent(null))

    await webhook(signedPost())

    expect(grants(writes)).toEqual([])
  })

  it('logs the refusal loudly, naming the offending price', async () => {
    const { admin } = makeAdmin(null)
    getSupabaseAdmin.mockReturnValue(admin)
    constructEvent.mockReturnValue(subEvent(FOREIGN))

    await webhook(signedPost())

    const logged = errorSpy.mock.calls.flat().join(' ')
    expect(logged).toContain(FOREIGN)
    expect(logged).toContain('REFUSING to grant Pro')
  })

  it('reports the refusal as a skip, not a failure Stripe should retry', async () => {
    const { admin } = makeAdmin(null)
    getSupabaseAdmin.mockReturnValue(admin)
    constructEvent.mockReturnValue(subEvent(FOREIGN))

    const res = await webhook(signedPost())
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toMatchObject({ skipped: 'unrecognised_price' })
  })
})

describe('webhook — the check must not break legitimate billing', () => {
  it('grants Pro for the configured monthly price', async () => {
    const { admin, writes } = makeAdmin(null)
    getSupabaseAdmin.mockReturnValue(admin)
    constructEvent.mockReturnValue(subEvent(MONTHLY))

    await webhook(signedPost())

    expect(grants(writes)).toHaveLength(1)
  })

  it('grants Pro for a checkout session stamped with the yearly price', async () => {
    const { admin, writes } = makeAdmin(null)
    getSupabaseAdmin.mockReturnValue(admin)
    constructEvent.mockReturnValue(sessionEvent(YEARLY))

    await webhook(signedPost())

    expect(grants(writes)).toHaveLength(1)
  })

  it('REVOCATION never needs a recognised price — retiring a price must not strand subscribers', async () => {
    /*
     * The asymmetry that matters: granting requires proof, revoking does not.
     * If a cancellation were refused because its price is no longer sold, every
     * subscriber on a retired price would keep Pro forever.
     */
    const { admin, writes } = makeAdmin({
      plan: 'pro',
      stripe_subscription_id: 'sub_1',
      last_stripe_event_id: 'evt_old',
      last_stripe_event_at: new Date(1_800_000_000 * 1000).toISOString(),
    })
    getSupabaseAdmin.mockReturnValue(admin)
    constructEvent.mockReturnValue({
      id: 'evt_cancel',
      created: 1_800_000_900,
      type: 'customer.subscription.deleted',
      data: {
        object: {
          id: 'sub_1',
          status: 'canceled',
          customer: 'cus_1',
          metadata: { user_id: UID },
          items: { data: [{ price: { id: FOREIGN } }] },
        },
      },
    } as MinimalStripeEvent)

    await webhook(signedPost())

    expect(writes).toHaveLength(1)
    expect(writes[0].row.plan).toBe('free')
  })
})
