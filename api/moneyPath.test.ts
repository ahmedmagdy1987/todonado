import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  applyTestModeEnv,
  clearTestModeEnv,
  makeFakeDb,
  makeFakeStripe,
  type AttemptRow,
} from '../src/test/stripeDoubles.js'
import { resetRateLimitStores } from './_lib/rateLimit.js'

/**
 * THE MONEY PATH, END TO END.
 *
 * Three defects motivated this file, and all three came from the server having
 * no durable record that IT had started a purchase:
 *   A. two instances could each create a paid Checkout Session;
 *   B. `metadata` was treated as proof of purchase;
 *   C. HBV Studio's other products could move a Todonado billing row.
 *
 * BOUNDARY, STATED PLAINLY: Stripe and Supabase are MOCKED here. Real atomicity
 * comes from `select … for update` and a partial unique index, and real purchase
 * facts come from Stripe's API — neither is exercised by a unit test. The SQL is
 * pinned clause-by-clause in checkoutAttemptsMigration.test.ts and
 * billingEventOrderingMigration.test.ts. What this file proves is that the
 * handlers drive those primitives correctly and fail closed when they cannot.
 */

const getUserFromAuthHeader = vi.fn()
const getSupabaseAdmin = vi.fn()
const getStripeMock = vi.fn()

vi.mock('./_lib/supabase.js', () => ({
  getUserFromAuthHeader: (...a: unknown[]) => getUserFromAuthHeader(...a),
  getSupabaseAdmin: (...a: unknown[]) => getSupabaseAdmin(...a),
}))
vi.mock('./_lib/stripe.js', () => ({ getStripe: (...a: unknown[]) => getStripeMock(...a) }))

const checkout = (await import('./create-checkout-session.js')).webHandler
const webhook = (await import('./stripe-webhook.js')).webHandler

const UID = 'user-123'
const MONTHLY = 'price_configuredMonthly1'
const YEARLY = 'price_configuredYearly12'
const HBV_OTHER = 'price_otherHbvProduct9'
const ATTEMPT = '00000000-0000-4000-8000-000000000001'
const T = { t1: 1_800_000_100, t2: 1_800_000_200 } as const

const post = (priceId: string = MONTHLY) =>
  new Request('https://www.todonado.com/api/create-checkout-session', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer good' },
    body: JSON.stringify({ priceId }),
  })

const hook = () =>
  new Request('https://www.todonado.com/api/stripe-webhook', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'stripe-signature': 't=1,v1=ok' },
    body: '{}',
  })

/** A checkout.session.completed event. Only the id and attempt_id are trusted. */
const completedEvent = (over: Record<string, unknown> = {}) => ({
  id: 'evt_cs',
  created: T.t2,
  livemode: false,
  type: 'checkout.session.completed',
  data: {
    object: { id: 'cs_test_1', metadata: { attempt_id: ATTEMPT }, ...over },
  },
})

const lifecycleEvent = (type: string, subId: string, over: Record<string, unknown> = {}) => ({
  id: `evt_${type}_${subId}`,
  created: T.t2,
  livemode: false,
  type,
  data: {
    object: {
      id: subId,
      status: type.endsWith('deleted') ? 'canceled' : 'active',
      customer: 'cus_1',
      metadata: { user_id: UID },
      /*
       * THE PERIOD END IS ON THE ITEM, which is the shape Stripe actually
       * sends. It moved off the Subscription in API 2025-03-31.basil, and this
       * project pins stripe@22.3.0 whose ApiVersion is 2026-06-24.dahlia.
       *
       * These fixtures used to carry it at the TOP LEVEL, which is why the
       * suite stayed green while production wrote NULL forever: the doubles
       * agreed with the code and both disagreed with Stripe.
       */
      items: { data: [{ price: { id: MONTHLY }, current_period_end: T.t2 + 2_592_000 }] },
      ...over,
    },
  },
})

/** Stripe objects for a healthy Todonado purchase. */
const goodStripe = (over: { price?: string; session?: Record<string, unknown> } = {}) =>
  makeFakeStripe({
    sessions: {
      cs_test_1: {
        id: 'cs_test_1',
        mode: 'subscription',
        status: 'complete',
        livemode: false,
        customer: 'cus_1',
        subscription: 'sub_todonado',
        ...over.session,
      },
    },
    subscriptions: {
      sub_todonado: {
        id: 'sub_todonado',
        status: 'active',
        livemode: false,
        customer: 'cus_1',
        // On the ITEM, as Stripe sends it under the pinned API version.
        items: {
          data: [{ price: { id: over.price ?? MONTHLY }, current_period_end: T.t2 + 2_592_000 }],
        },
      },
    },
  })

const attempt = (over: Partial<AttemptRow> = {}): AttemptRow => ({
  id: ATTEMPT,
  user_id: UID,
  price_id: MONTHLY,
  status: 'session_created',
  stripe_session_id: 'cs_test_1',
  stripe_subscription_id: null,
  ...over,
})

const skipOf = async (res: Response) =>
  ((await res.json()) as { skipped?: string }).skipped ?? null

/**
 * The refusal code, whichever shape the handler used.
 *
 * A livemode mismatch used to be a 200 carrying `{ skipped }`; it is now a 503
 * carrying `{ error }`, because a 2xx marks the event delivered and Stripe
 * never retries it — which permanently discards a real payment that arrives
 * mid mode-switch. Reading both keeps these assertions about the REFUSAL
 * rather than about the envelope it came in.
 */
const refusalOf = async (res: Response) => {
  const body = (await res.json()) as { skipped?: string; error?: string }
  return body.error ?? body.skipped ?? null
}

let errorSpy: ReturnType<typeof vi.spyOn>
let warnSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  resetRateLimitStores()
  getUserFromAuthHeader.mockReset()
  getSupabaseAdmin.mockReset()
  getStripeMock.mockReset()
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
  applyTestModeEnv()
  getUserFromAuthHeader.mockResolvedValue({ id: UID, email: 'a@b.test', emailVerified: true })
})
afterEach(() => {
  clearTestModeEnv()
  resetRateLimitStores()
  errorSpy.mockRestore()
  warnSpy.mockRestore()
})

// ───────────────────────────── STAGE A ──────────────────────────────────────

describe('A — one durable checkout attempt per user', () => {
  it('REQUIRED: two simultaneous requests produce ONE Stripe session', async () => {
    const db = makeFakeDb()
    const s = makeFakeStripe()
    getSupabaseAdmin.mockReturnValue(db.client)
    getStripeMock.mockReturnValue(s.stripe)

    const [a, b] = await Promise.all([checkout(post()), checkout(post())])

    expect(a.status).toBe(200)
    expect(b.status).toBe(200)
    expect(
      db.state.attempts.length,
      'the partial unique index allows exactly one non-terminal attempt',
    ).toBe(1)
    expect(new Set(s.created.map((c) => c.opts.idempotencyKey)).size).toBe(1)
  })

  it('REQUIRED: simultaneous monthly and yearly requests do not create two sessions', async () => {
    const db = makeFakeDb()
    const s = makeFakeStripe()
    getSupabaseAdmin.mockReturnValue(db.client)
    getStripeMock.mockReturnValue(s.stripe)

    await Promise.all([checkout(post(MONTHLY)), checkout(post(YEARLY))])

    expect(db.state.attempts.length).toBe(1)
    // The FIRST reserved plan wins; the other request joins that attempt.
    expect(s.created.every((c) => c.opts.idempotencyKey === s.created[0].opts.idempotencyKey)).toBe(
      true,
    )
  })

  it('REQUIRED: the idempotency key is the attempt id, not a wall-clock bucket', async () => {
    const db = makeFakeDb()
    const s = makeFakeStripe()
    getSupabaseAdmin.mockReturnValue(db.client)
    getStripeMock.mockReturnValue(s.stripe)

    const realNow = Date.now
    let key1 = ''
    let key2 = ''
    try {
      Date.now = () => 1_800_000_000_000
      await checkout(post())
      key1 = s.created[0].opts.idempotencyKey ?? ''
      // Same attempt, an hour later. A clock-derived key would change here;
      // an attempt-derived one cannot.
      Date.now = () => 1_800_003_600_000
      await checkout(post())
      key2 = (s.created[1] ?? s.created[0]).opts.idempotencyKey ?? ''
    } finally {
      Date.now = realNow
    }

    expect(key1).toContain(db.state.attempts[0].id)
    expect(key2).toBe(key1)
  })

  it('REQUIRED: two requests either side of the old 10-minute boundary still collapse', async () => {
    const db = makeFakeDb()
    const s = makeFakeStripe()
    getSupabaseAdmin.mockReturnValue(db.client)
    getStripeMock.mockReturnValue(s.stripe)

    const realNow = Date.now
    try {
      Date.now = () => 1_800_000_000_000 // just before a bucket edge
      await checkout(post())
      Date.now = () => 1_800_000_600_001 // just after
      await checkout(post())
    } finally {
      Date.now = realNow
    }

    expect(db.state.attempts.length).toBe(1)
    expect(new Set(s.created.map((c) => c.opts.idempotencyKey)).size).toBe(1)
  })

  it('REQUIRED: a crash after Stripe created the session recovers the SAME session', async () => {
    // First call: Stripe succeeds, then the persist "crashes" before the id is
    // stored — modelled by an attempt left in 'reserved' with no session id.
    const db = makeFakeDb({ attempts: [attempt({ status: 'reserved', stripe_session_id: null })] })
    const s = makeFakeStripe()
    getSupabaseAdmin.mockReturnValue(db.client)
    getStripeMock.mockReturnValue(s.stripe)

    await checkout(post())
    await checkout(post())

    expect(
      new Set(s.created.map((c) => c.opts.idempotencyKey)).size,
      'the same attempt must send the same key so Stripe returns the same session',
    ).toBe(1)
  })

  it('REQUIRED: an OPEN session is reused rather than duplicated', async () => {
    const db = makeFakeDb({ attempts: [attempt()] })
    const s = makeFakeStripe({
      sessions: {
        cs_test_1: { id: 'cs_test_1', status: 'open', livemode: false, url: 'https://checkout.stripe.com/c/pay/existing' },
      },
    })
    getSupabaseAdmin.mockReturnValue(db.client)
    getStripeMock.mockReturnValue(s.stripe)

    const res = await checkout(post())

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toMatchObject({ reused: true })
    expect(s.created).toHaveLength(0)
  })

  it('REQUIRED: a COMPLETE session awaiting its webhook blocks a new checkout', async () => {
    const db = makeFakeDb({ attempts: [attempt()] })
    const s = makeFakeStripe({
      sessions: { cs_test_1: { id: 'cs_test_1', status: 'complete', livemode: false } },
    })
    getSupabaseAdmin.mockReturnValue(db.client)
    getStripeMock.mockReturnValue(s.stripe)

    const res = await checkout(post())

    expect(res.status).toBe(409)
    await expect(res.json()).resolves.toEqual({ error: 'checkout_awaiting_confirmation' })
    expect(s.created).toHaveLength(0)
  })

  it('REQUIRED: an EXPIRED session is terminal and permits a fresh attempt', async () => {
    const db = makeFakeDb({ attempts: [attempt()] })
    const s = makeFakeStripe({
      sessions: { cs_test_1: { id: 'cs_test_1', status: 'expired', livemode: false } },
    })
    getSupabaseAdmin.mockReturnValue(db.client)
    getStripeMock.mockReturnValue(s.stripe)

    const res = await checkout(post())

    expect(res.status).toBe(200)
    expect(db.state.attempts.find((a) => a.id === ATTEMPT)?.status).toBe('expired')
    expect(db.state.attempts.length).toBe(2)
  })

  it('state comes from Stripe — a local TTL never expires a reservation on its own', async () => {
    // An hour-old attempt whose session Stripe still reports open must be reused.
    const db = makeFakeDb({ attempts: [attempt()] })
    const s = makeFakeStripe({
      sessions: { cs_test_1: { id: 'cs_test_1', status: 'open', livemode: false, url: 'https://x' } },
    })
    getSupabaseAdmin.mockReturnValue(db.client)
    getStripeMock.mockReturnValue(s.stripe)

    await expect((await checkout(post())).json()).resolves.toMatchObject({ reused: true })
  })

  it('a failed Stripe call releases the attempt instead of locking the user out', async () => {
    const db = makeFakeDb()
    const s = makeFakeStripe({
      createSession: async () => {
        throw new Error('stripe is down')
      },
    })
    getSupabaseAdmin.mockReturnValue(db.client)
    getStripeMock.mockReturnValue(s.stripe)

    expect((await checkout(post())).status).toBe(502)
    expect(db.state.attempts[0].status, 'a terminal state frees the slot').toBe('failed')
  })

  it('fails closed when the checkout_attempts migration is absent', async () => {
    const db = makeFakeDb({ rpcError: { code: '42P01', message: 'relation checkout_attempts' } })
    getSupabaseAdmin.mockReturnValue(db.client)
    getStripeMock.mockReturnValue(makeFakeStripe().stripe)

    const res = await checkout(post())
    expect(res.status).toBe(503)
    await expect(res.json()).resolves.toEqual({ error: 'billing_schema_outdated' })
  })
})

describe('A — blocking subscription statuses', () => {
  const blocking = ['active', 'trialing', 'past_due', 'unpaid', 'paused', 'incomplete']
  it.each(blocking)('REQUIRED: %s blocks a new checkout', async (status) => {
    const db = makeFakeDb({
      billing: { stripe_subscription_id: 'sub_todonado', subscription_status: status },
    })
    const s = makeFakeStripe()
    getSupabaseAdmin.mockReturnValue(db.client)
    getStripeMock.mockReturnValue(s.stripe)

    const res = await checkout(post())
    expect(res.status).toBe(409)
    expect(s.created).toHaveLength(0)
  })

  const terminal = ['canceled', 'incomplete_expired']
  it.each(terminal)('REQUIRED: %s permits a new subscription', async (status) => {
    const db = makeFakeDb({
      billing: { stripe_subscription_id: 'sub_old', subscription_status: status },
    })
    getSupabaseAdmin.mockReturnValue(db.client)
    getStripeMock.mockReturnValue(makeFakeStripe().stripe)

    expect((await checkout(post())).status).toBe(200)
  })
})

// ───────────────────────────── STAGE B ──────────────────────────────────────

describe('B — Pro is granted only on authoritative Stripe evidence', () => {
  function wire(over: Parameters<typeof goodStripe>[0] = {}, attempts = [attempt()]) {
    const db = makeFakeDb({ attempts })
    const s = goodStripe(over)
    getSupabaseAdmin.mockReturnValue(db.client)
    getStripeMock.mockReturnValue({ ...s.stripe, webhooks: { constructEvent: () => completedEvent() } })
    return db
  }

  it('grants Pro when session, subscription, price and attempt all agree', async () => {
    const db = wire()
    const res = await webhook(hook())
    expect(res.status).toBe(200)
    expect(db.state.billing?.plan).toBe('pro')
    expect(db.state.billing?.stripe_subscription_id).toBe('sub_todonado')
  })

  it('REQUIRED: a Dashboard-created session with metadata.user_id grants NOTHING', async () => {
    const db = makeFakeDb() // no attempt rows at all
    const s = goodStripe()
    getSupabaseAdmin.mockReturnValue(db.client)
    getStripeMock.mockReturnValue({
      ...s.stripe,
      webhooks: {
        constructEvent: () =>
          completedEvent({ metadata: { user_id: UID }, client_reference_id: null }),
      },
    })

    const res = await webhook(hook())
    expect(await skipOf(res)).toBe('missing_attempt')
    expect(db.state.billing).toBeNull()
  })

  it('REQUIRED: an unknown attempt id fails closed', async () => {
    const db = makeFakeDb()
    const s = goodStripe()
    getSupabaseAdmin.mockReturnValue(db.client)
    getStripeMock.mockReturnValue({ ...s.stripe, webhooks: { constructEvent: () => completedEvent() } })

    expect(await skipOf(await webhook(hook()))).toBe('unknown_attempt')
    expect(db.state.billing).toBeNull()
  })

  it('REQUIRED: a malformed attempt id fails closed', async () => {
    const db = makeFakeDb({ attempts: [attempt()] })
    const s = goodStripe()
    getSupabaseAdmin.mockReturnValue(db.client)
    getStripeMock.mockReturnValue({
      ...s.stripe,
      webhooks: { constructEvent: () => completedEvent({ metadata: { attempt_id: 'not-a-uuid' } }) },
    })

    expect(await skipOf(await webhook(hook()))).toBe('missing_attempt')
    expect(db.state.billing).toBeNull()
  })

  it('REQUIRED: a session that is not mode=subscription grants nothing', async () => {
    const db = wire({ session: { mode: 'payment' } })
    expect(await skipOf(await webhook(hook()))).toBe('not_a_subscription_session')
    expect(db.state.billing).toBeNull()
  })

  it('REQUIRED: a session that is not complete grants nothing', async () => {
    const db = wire({ session: { status: 'open' } })
    expect(await skipOf(await webhook(hook()))).toBe('session_not_complete')
    expect(db.state.billing).toBeNull()
  })

  it('REQUIRED: a valid attempt with the WRONG price grants nothing', async () => {
    const db = wire({ price: HBV_OTHER })
    expect(await skipOf(await webhook(hook()))).toBe('unrecognised_price')
    expect(db.state.billing).toBeNull()
  })

  it('REQUIRED: a price mismatch against what the attempt reserved is refused', async () => {
    // Attempt reserved MONTHLY; the subscription actually carries YEARLY.
    const db = wire({ price: YEARLY }, [attempt({ price_id: MONTHLY })])
    expect(await skipOf(await webhook(hook()))).toBe('attempt_price_mismatch')
    expect(db.state.billing).toBeNull()
  })

  it('REQUIRED: an attempt already consumed by a DIFFERENT session is refused', async () => {
    wire({}, [attempt({ status: 'consumed', stripe_subscription_id: 'sub_first' })])
    expect(await skipOf(await webhook(hook()))).toBe('attempt_already_consumed')
  })

  it('REQUIRED: a subscription bundling another HBV price is refused, not partly honoured', async () => {
    const db = makeFakeDb({ attempts: [attempt()] })
    const s = makeFakeStripe({
      sessions: {
        cs_test_1: {
          id: 'cs_test_1', mode: 'subscription', status: 'complete', livemode: false,
          customer: 'cus_1', subscription: 'sub_todonado',
        },
      },
      subscriptions: {
        sub_todonado: {
          id: 'sub_todonado', status: 'active', livemode: false,
          items: { data: [{ price: { id: MONTHLY } }, { price: { id: HBV_OTHER } }] },
        },
      },
    })
    getSupabaseAdmin.mockReturnValue(db.client)
    getStripeMock.mockReturnValue({ ...s.stripe, webhooks: { constructEvent: () => completedEvent() } })

    expect(await skipOf(await webhook(hook()))).toBe('unrecognised_price')
    expect(db.state.billing).toBeNull()
  })

  it('a transient Stripe read error is a 500 so Stripe retries, not a silent drop', async () => {
    const db = makeFakeDb({ attempts: [attempt()] })
    getSupabaseAdmin.mockReturnValue(db.client)
    getStripeMock.mockReturnValue({
      checkout: { sessions: { retrieve: async () => { throw new Error('network') } } },
      subscriptions: { retrieve: async () => ({}) },
      webhooks: { constructEvent: () => completedEvent() },
    })

    expect((await webhook(hook())).status).toBe(500)
    expect(db.state.billing).toBeNull()
  })

  it('a duplicate delivery of the same event writes once', async () => {
    const db = wire()
    await webhook(hook())
    const first = { ...db.state.billing }
    await webhook(hook())
    expect(await skipOf(await webhook(hook()))).toBe('duplicate_event')
    expect(db.state.billing?.last_stripe_event_id).toBe(first.last_stripe_event_id)
  })
})

// ───────────────────────────── STAGE C ──────────────────────────────────────

describe('C — HBV Studio isolation', () => {
  function bound() {
    return makeFakeDb({
      billing: {
        plan: 'pro',
        stripe_customer_id: 'cus_1',
        stripe_subscription_id: 'sub_todonado',
        subscription_status: 'active',
        last_stripe_event_id: 'evt_prev',
        last_stripe_event_at: new Date(T.t1 * 1000).toISOString(),
      },
    })
  }
  function wireLifecycle(db: ReturnType<typeof makeFakeDb>, event: unknown) {
    getSupabaseAdmin.mockReturnValue(db.client)
    getStripeMock.mockReturnValue({ webhooks: { constructEvent: () => event } })
  }

  it('REQUIRED: a cancellation of sub_other cannot touch a row holding sub_todonado', async () => {
    const db = bound()
    wireLifecycle(db, lifecycleEvent('customer.subscription.deleted', 'sub_other'))

    expect(await skipOf(await webhook(hook()))).toBe('unknown_subscription')
    expect(db.state.billing?.plan).toBe('pro')
  })

  it('REQUIRED: another HBV product on the SAME customer cannot revoke Todonado', async () => {
    const db = bound()
    wireLifecycle(
      db,
      lifecycleEvent('customer.subscription.deleted', 'sub_hbv_other', {
        customer: 'cus_1',
        items: { data: [{ price: { id: HBV_OTHER } }] },
      }),
    )

    expect(await skipOf(await webhook(hook()))).toBe('unknown_subscription')
    expect(db.state.billing?.plan).toBe('pro')
  })

  it('REQUIRED: forged metadata.user_id cannot bind a subscription to a Todonado user', async () => {
    const db = makeFakeDb() // no billing row at all
    wireLifecycle(
      db,
      lifecycleEvent('customer.subscription.updated', 'sub_attacker', {
        metadata: { user_id: UID },
      }),
    )

    expect(await skipOf(await webhook(hook()))).toBe('unknown_subscription')
    expect(db.state.billing, 'a lifecycle event must never CREATE a binding').toBeNull()
  })

  it('REQUIRED: a lifecycle event arriving BEFORE checkout completion binds nothing', async () => {
    const db = makeFakeDb({ attempts: [attempt()] })
    wireLifecycle(db, lifecycleEvent('customer.subscription.updated', 'sub_todonado'))

    expect(await skipOf(await webhook(hook()))).toBe('unknown_subscription')
    expect(db.state.billing).toBeNull()
  })

  it('REQUIRED: the exact bound subscription CAN still revoke', async () => {
    const db = bound()
    wireLifecycle(db, lifecycleEvent('customer.subscription.deleted', 'sub_todonado'))

    expect((await webhook(hook())).status).toBe(200)
    expect(db.state.billing?.plan).toBe('free')
  })

  it('REQUIRED: revocation works even when the price is no longer sold', async () => {
    const db = bound()
    wireLifecycle(
      db,
      lifecycleEvent('customer.subscription.deleted', 'sub_todonado', {
        items: { data: [{ price: { id: 'price_retiredLongAgo' } }] },
      }),
    )

    expect(db.state.billing?.plan).toBe('pro')
    await webhook(hook())
    expect(db.state.billing?.plan, 'retiring a price must not strand subscribers on Pro').toBe('free')
  })

  it('REQUIRED: an old unrelated cancellation after a new Todonado purchase is ignored', async () => {
    const db = bound()
    wireLifecycle(
      db,
      lifecycleEvent('customer.subscription.deleted', 'sub_old_hbv', { customer: 'cus_1' }),
    )

    await webhook(hook())
    expect(db.state.billing?.plan).toBe('pro')
    expect(db.state.billing?.stripe_subscription_id).toBe('sub_todonado')
  })

  it('an unknown event type is acknowledged, not retried forever', async () => {
    const db = bound()
    wireLifecycle(db, { id: 'evt_x', created: T.t2, livemode: false, type: 'invoice.paid', data: { object: {} } })

    const res = await webhook(hook())
    expect(res.status).toBe(200)
    expect(await skipOf(res)).toBe('unhandled_event_type')
  })
})

// ───────────────────────────── STAGE D ──────────────────────────────────────

describe('D — Stripe mode consistency fails closed', () => {
  const cases: Array<[string, Record<string, string | undefined>]> = [
    ['STRIPE_MODE unset', { STRIPE_MODE: undefined }],
    ['STRIPE_MODE nonsense', { STRIPE_MODE: 'sandbox' }],
    ['live mode with a test secret key', { STRIPE_MODE: 'live' }],
    ['test publishable key with a live secret key', { STRIPE_SECRET_KEY: 'sk_live_x' }],
    ['client/server monthly price mismatch', { VITE_STRIPE_PRICE_MONTHLY: 'price_somethingElse1' }],
    ['client/server yearly price mismatch', { VITE_STRIPE_PRICE_YEARLY: 'price_somethingElse2' }],
  ]

  it.each(cases)('REQUIRED: checkout refuses — %s', async (_label, overrides) => {
    applyTestModeEnv(overrides)
    const db = makeFakeDb()
    const s = makeFakeStripe()
    getSupabaseAdmin.mockReturnValue(db.client)
    getStripeMock.mockReturnValue(s.stripe)

    const res = await checkout(post())
    expect(res.status).toBeGreaterThanOrEqual(500)
    expect(s.created, 'no Stripe session may be created in an inconsistent deployment').toHaveLength(0)
  })

  it('REQUIRED: a TEST-mode event cannot modify LIVE billing state', async () => {
    applyTestModeEnv({
      STRIPE_MODE: 'live',
      STRIPE_SECRET_KEY: 'sk_live_x',
      VITE_STRIPE_PUBLISHABLE_KEY: 'pk_live_x',
    })
    const db = makeFakeDb({
      billing: { plan: 'pro', stripe_subscription_id: 'sub_todonado', subscription_status: 'active' },
    })
    getSupabaseAdmin.mockReturnValue(db.client)
    getStripeMock.mockReturnValue({
      webhooks: {
        constructEvent: () => lifecycleEvent('customer.subscription.deleted', 'sub_todonado'),
      },
    })

    const res = await webhook(hook())
    /*
     * RETRIABLE, NOT 200. A 2xx marks the event delivered and Stripe never
     * resends it, so a genuine payment arriving during a mode switch would be
     * discarded permanently. A 5xx is retried for ~3 days, which outlasts any
     * sane switch.
     */
    expect(res.status, 'Stripe must be asked to retry, not told we handled it').toBeGreaterThanOrEqual(500)
    expect(await refusalOf(res)).toBe('livemode_mismatch')
    expect(db.state.billing?.plan, 'a config error must never downgrade a payer').toBe('pro')
  })

  it('REQUIRED: a LIVE event cannot modify TEST billing state', async () => {
    const db = makeFakeDb({
      billing: { plan: 'pro', stripe_subscription_id: 'sub_todonado', subscription_status: 'active' },
    })
    getSupabaseAdmin.mockReturnValue(db.client)
    getStripeMock.mockReturnValue({
      webhooks: {
        constructEvent: () => ({
          ...lifecycleEvent('customer.subscription.deleted', 'sub_todonado'),
          livemode: true,
        }),
      },
    })

    {
      const r = await webhook(hook())
      expect(r.status, 'Stripe must be asked to retry').toBeGreaterThanOrEqual(500)
      expect(await refusalOf(r)).toBe('livemode_mismatch')
    }
    expect(db.state.billing?.plan).toBe('pro')
  })

  it('REQUIRED: a Stripe SESSION from the wrong mode does not grant', async () => {
    const db = makeFakeDb({ attempts: [attempt()] })
    const s = goodStripe({ session: { livemode: true } })
    getSupabaseAdmin.mockReturnValue(db.client)
    getStripeMock.mockReturnValue({ ...s.stripe, webhooks: { constructEvent: () => completedEvent() } })

    {
      const r = await webhook(hook())
      expect(r.status, 'Stripe must be asked to retry').toBeGreaterThanOrEqual(500)
      expect(await refusalOf(r)).toBe('livemode_mismatch')
    }
    expect(db.state.billing).toBeNull()
  })

  it('a consistent test deployment is NOT refused', async () => {
    const db = makeFakeDb()
    const s = makeFakeStripe()
    getSupabaseAdmin.mockReturnValue(db.client)
    getStripeMock.mockReturnValue(s.stripe)

    expect((await checkout(post())).status).toBe(200)
  })
})
