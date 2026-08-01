import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { MinimalStripeEvent } from '../src/features/billing/webhookMapping.js'

/**
 * TWO VERCEL INSTANCES, ONE BILLING ROW.
 *
 * The ordering rules are only worth anything if they are evaluated against the
 * row as it is AT WRITE TIME. A SELECT, a decision in JavaScript, and then an
 * UPDATE is three steps with two gaps in between, and Stripe delivers
 * concurrently to as many instances as Vercel happens to be running.
 *
 * The interleaving these tests force is the realistic one: both instances read
 * BEFORE either writes.
 */

const getUserFromAuthHeader = vi.fn()
const getSupabaseAdmin = vi.fn()
const constructEvent = vi.fn()

vi.mock('./_lib/supabase.js', () => ({
  getUserFromAuthHeader: (...a: unknown[]) => getUserFromAuthHeader(...a),
  getSupabaseAdmin: (...a: unknown[]) => getSupabaseAdmin(...a),
}))
vi.mock('./_lib/stripe.js', () => ({
  getStripe: () => ({
    webhooks: { constructEvent: (...a: unknown[]) => constructEvent(...a) },
  }),
}))

const webhook = (await import('./stripe-webhook.js')).webHandler

const UID = 'user-123'
const MONTHLY = 'price_configuredMonthly1'
const T = { t0: 1_800_000_000, t1: 1_800_000_100, t2: 1_800_000_200 } as const

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
  process.env.STRIPE_PRICE_YEARLY = 'price_configuredYearly12'
  process.env.SUPABASE_URL = 'https://p.supabase.co'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-dummy'
}

const signedPost = () =>
  new Request('https://www.todonado.com/api/stripe-webhook', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'stripe-signature': 't=1,v1=ok' },
    body: JSON.stringify({}),
  })

/**
 * A shared "database" with ONE row, honest about what Postgres actually
 * guarantees. Reads return a snapshot; writes apply against live state and are
 * serialised, exactly as two Vercel instances hitting one row would be.
 */
function makeSharedDb(initial: Record<string, unknown> | null) {
  const state = { row: initial ? { ...initial } : null }
  /** Every read that happened, so a test can force both to read before either writes. */
  const gate = { holdReadsUntil: null as null | Promise<void> }

  function client() {
    return {
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => {
              if (gate.holdReadsUntil) await gate.holdReadsUntil
              return { data: state.row ? { ...state.row } : null, error: null }
            },
          }),
        }),
        insert: async (row: Record<string, unknown>) => {
          if (state.row) return { error: { code: '23505', message: 'duplicate key' } }
          state.row = { ...row }
          return { error: null }
        },
        update: (row: Record<string, unknown>) => ({
          eq: () => ({
            or: (guard: string) => ({
              select: async () => {
                // Emulate the WHERE clause the handler sends:
                //   last_stripe_event_at is null OR last_stripe_event_at <= <eventAt>
                const m = /last_stripe_event_at\.lte\.([^,)]+)/.exec(guard)
                const bound = m ? Date.parse(m[1]) : Number.POSITIVE_INFINITY
                const stored = state.row?.last_stripe_event_at
                const storedMs = stored ? Date.parse(String(stored)) : null
                const passes = storedMs === null || storedMs <= bound
                if (!passes) return { data: [], error: null }
                state.row = { ...state.row, ...row }
                return { data: [{ user_id: UID }], error: null }
              },
            }),
          }),
        }),
        rpc: async () => ({ data: null, error: null }),
      }),
      rpc: async (_fn: string, args: Record<string, unknown>) => {
        // Atomic path: the whole decision happens here, against LIVE state.
        return applyAtomically(state, args)
      },
    }
  }
  return { state, gate, client }
}

/**
 * A JS model of `apply_stripe_billing_event` under `select … for update`.
 *
 * IT IS A MODEL, NOT THE IMPLEMENTATION, and that distinction is the honest
 * limit of this file: the real guarantee is Postgres row locking, which no
 * unit test can exercise. What this proves is that the HANDLER drives a single
 * atomic call and behaves correctly given one — the SQL itself is pinned
 * clause by clause in billingEventOrderingMigration.test.ts, and the outcome
 * strings below must match it exactly or these tests are checking fiction.
 */
function applyAtomically(
  state: { row: Record<string, unknown> | null },
  a: Record<string, unknown>,
) {
  const cur = state.row
  const eventAt = Date.parse(String(a.p_event_at))
  const write = (outcome: string) => ({ data: outcome, error: null })

  if (!cur) {
    state.row = {
      user_id: a.p_user_id,
      plan: a.p_plan,
      stripe_customer_id: a.p_customer_id,
      stripe_subscription_id: a.p_subscription_id,
      subscription_status: a.p_status,
      current_period_end: a.p_set_period_end ? a.p_period_end : null,
      last_stripe_event_id: a.p_event_id,
      last_stripe_event_at: a.p_event_at,
    }
    return write('applied')
  }

  if (cur.last_stripe_event_id === a.p_event_id) return write('duplicate_event')

  const markMs = cur.last_stripe_event_at ? Date.parse(String(cur.last_stripe_event_at)) : null
  if (markMs !== null && eventAt < markMs) return write('stale_event')

  const isDowngrade = a.p_plan === 'free' && cur.plan === 'pro'
  if (isDowngrade) {
    if (markMs !== null && eventAt <= markMs) return write('stale_downgrade')
    if (
      cur.stripe_subscription_id != null &&
      a.p_subscription_id != null &&
      cur.stripe_subscription_id !== a.p_subscription_id
    ) {
      return write('downgrade_for_other_subscription')
    }
  }

  state.row = {
    ...cur,
    plan: a.p_plan,
    stripe_customer_id: a.p_customer_id ?? cur.stripe_customer_id,
    stripe_subscription_id: a.p_subscription_id ?? cur.stripe_subscription_id,
    subscription_status: a.p_status,
    current_period_end: a.p_set_period_end ? a.p_period_end : cur.current_period_end,
    last_stripe_event_id: a.p_event_id,
    last_stripe_event_at: a.p_event_at,
  }
  return write('applied')
}

const checkoutCompleted = (id: string, created: number, sub: string): MinimalStripeEvent => ({
  id,
  created,
  type: 'checkout.session.completed',
  data: {
    object: {
      customer: 'cus_1',
      subscription: sub,
      metadata: { user_id: UID, price_id: MONTHLY },
    },
  },
})

const subDeleted = (id: string, created: number, sub: string): MinimalStripeEvent => ({
  id,
  created,
  type: 'customer.subscription.deleted',
  data: {
    object: {
      id: sub,
      status: 'canceled',
      customer: 'cus_1',
      metadata: { user_id: UID },
      items: { data: [{ price: { id: MONTHLY } }] },
    },
  },
})

let errorSpy: ReturnType<typeof vi.spyOn>
let warnSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  for (const k of ENV_KEYS) delete process.env[k]
  getUserFromAuthHeader.mockReset()
  getSupabaseAdmin.mockReset()
  constructEvent.mockReset()
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
  configure()
})
afterEach(() => {
  for (const k of ENV_KEYS) delete process.env[k]
  errorSpy.mockRestore()
  warnSpy.mockRestore()
})

/** Drive one event against a starting row and return the resulting row. */
async function applyOne(
  initial: Record<string, unknown> | null,
  event: MinimalStripeEvent,
): Promise<{ row: Record<string, unknown> | null; res: Response }> {
  const db = makeSharedDb(initial)
  getSupabaseAdmin.mockReturnValue(db.client())
  constructEvent.mockReturnValueOnce(event)
  const res = await webhook(signedPost())
  return { row: db.state.row, res }
}

const proRow = (over: Record<string, unknown> = {}) => ({
  user_id: UID,
  plan: 'pro',
  stripe_customer_id: 'cus_1',
  stripe_subscription_id: 'sub_1',
  subscription_status: 'active',
  last_stripe_event_id: 'evt_prev',
  last_stripe_event_at: new Date(T.t1 * 1000).toISOString(),
  ...over,
})

const skipReason = async (res: Response) =>
  ((await res.json()) as { skipped?: string }).skipped ?? null

describe('sequential ordering, through the atomic RPC', () => {
  it('REQUIRED: an out-of-order subscription.deleted writes no downgrade', async () => {
    const { row } = await applyOne(proRow(), subDeleted('evt_cancel', T.t0, 'sub_1'))
    expect(row?.plan).toBe('pro')
  })

  it('REQUIRED: a duplicate delivery of the same event id changes nothing', async () => {
    const { row, res } = await applyOne(
      proRow({ last_stripe_event_id: 'evt_same' }),
      subDeleted('evt_same', T.t2, 'sub_1'),
    )
    expect(await skipReason(res)).toBe('duplicate_event')
    expect(row?.plan).toBe('pro')
  })

  it('REQUIRED: a newer delete naming a subscription we no longer hold is refused', async () => {
    const { row, res } = await applyOne(
      proRow({ stripe_subscription_id: 'sub_new' }),
      subDeleted('evt_cancel', T.t2, 'sub_old'),
    )
    expect(await skipReason(res)).toBe('downgrade_for_other_subscription')
    expect(row?.plan).toBe('pro')
  })

  it('applies a genuine cancellation of the subscription actually held', async () => {
    const { row } = await applyOne(proRow(), subDeleted('evt_cancel', T.t2, 'sub_1'))
    expect(row?.plan).toBe('free')
  })

  it('inserts the first ever event for a user with no billing row', async () => {
    const { row } = await applyOne(null, checkoutCompleted('evt_first', T.t1, 'sub_1'))
    expect(row?.plan).toBe('pro')
    expect(row?.last_stripe_event_id).toBe('evt_first')
  })

  it('stamps Stripe’s own created time, never arrival time', async () => {
    const { row } = await applyOne(null, checkoutCompleted('evt_first', T.t1, 'sub_1'))
    expect(Date.parse(String(row?.last_stripe_event_at))).toBe(T.t1 * 1000)
  })
})

describe('EQUAL event.created — the tie policy', () => {
  /*
   * TIE POLICY, STATED: at an equal timestamp an UPGRADE applies and a
   * DOWNGRADE is refused.
   *
   * event.created has one-second precision and Stripe does NOT document event
   * ids as chronologically sortable, so at a tie there is no ordering
   * information at all — only a choice about which way to be wrong. Wrongly
   * granting Pro for a few minutes is a rounding error; wrongly revoking it
   * from someone who is paying is the bug the whole flag is about.
   *
   * A tie can therefore leave access STALE-HIGH (Pro when the truth is Free).
   * It reconciles on the next event for that subscription, whose created is
   * strictly greater, so RULE 3a no longer blocks it. Stripe emits
   * customer.subscription.updated on every lifecycle change and an invoice
   * cycle at minimum monthly, so the window closes on its own.
   */
  it('REQUIRED: a downgrade tying the mark is refused', async () => {
    const { row, res } = await applyOne(
      proRow({ last_stripe_event_at: new Date(T.t1 * 1000).toISOString() }),
      subDeleted('evt_cancel', T.t1, 'sub_1'),
    )
    expect(await skipReason(res)).toBe('stale_downgrade')
    expect(row?.plan).toBe('pro')
  })

  it('REQUIRED: an upgrade tying the mark applies', async () => {
    const { row } = await applyOne(
      proRow({ plan: 'free', last_stripe_event_at: new Date(T.t1 * 1000).toISOString() }),
      checkoutCompleted('evt_up', T.t1, 'sub_1'),
    )
    expect(row?.plan).toBe('pro')
  })

  it('two upgrades at the same timestamp both apply, last one wins the mark', async () => {
    const db = makeSharedDb(null)
    getSupabaseAdmin.mockReturnValue(db.client())
    constructEvent.mockReturnValueOnce(checkoutCompleted('evt_a', T.t1, 'sub_1'))
    await webhook(signedPost())
    constructEvent.mockReturnValueOnce(checkoutCompleted('evt_b', T.t1, 'sub_1'))
    await webhook(signedPost())
    expect(db.state.row?.plan).toBe('pro')
    expect(db.state.row?.last_stripe_event_id).toBe('evt_b')
  })

  it('a duplicate id at the same timestamp is a duplicate, not a tie', async () => {
    const { res } = await applyOne(
      proRow({ last_stripe_event_id: 'evt_x' }),
      checkoutCompleted('evt_x', T.t1, 'sub_1'),
    )
    expect(await skipReason(res)).toBe('duplicate_event')
  })

  it('DIFFERENT ids at the same timestamp are not treated as duplicates', async () => {
    const { row } = await applyOne(
      proRow({ plan: 'free', last_stripe_event_id: 'evt_x' }),
      checkoutCompleted('evt_y', T.t1, 'sub_1'),
    )
    expect(row?.last_stripe_event_id).toBe('evt_y')
  })

  it('cancel and resubscribe within the same second: the payer keeps access', async () => {
    /*
     * The worst tie. Old subscription cancels and a new one is bought in the
     * same second, in either delivery order. Both orderings must end Pro —
     * one via the tie rule, the other via the subscription-id guard.
     */
    for (const order of ['cancel-first', 'buy-first'] as const) {
      const db = makeSharedDb(proRow({ stripe_subscription_id: 'sub_old' }))
      getSupabaseAdmin.mockReturnValue(db.client())
      const events =
        order === 'cancel-first'
          ? [subDeleted('evt_c', T.t2, 'sub_old'), checkoutCompleted('evt_b', T.t2, 'sub_new')]
          : [checkoutCompleted('evt_b', T.t2, 'sub_new'), subDeleted('evt_c', T.t2, 'sub_old')]
      for (const e of events) {
        constructEvent.mockReturnValueOnce(e)
        await webhook(signedPost())
      }
      expect(db.state.row?.plan, `order=${order}`).toBe('pro')
    }
  })
})

describe('two instances racing on one billing row', () => {
  it('REQUIRED: a cancel for an OLD subscription cannot revoke a subscription bought concurrently', async () => {
    /*
     * THE INTERLEAVING THAT BREAKS A READ-THEN-WRITE DESIGN.
     *
     * Starting state: the user is Free on a lapsed sub_old.
     *   A = checkout.session.completed, sub_new, t1  (they just paid)
     *   B = customer.subscription.deleted, sub_old, t2  (the lapsed one finally cancels)
     *
     * B is genuinely NEWER, so ordering alone permits it. The guard that should
     * refuse it is "a downgrade must name the subscription we hold" — but that
     * is computed from the row READ AT THE START. Both instances read
     * plan='free', so B never even classifies itself as a downgrade, and its
     * timestamp CAS passes because t1 <= t2.
     *
     * Result before the fix: the customer pays and is immediately downgraded.
     */
    const db = makeSharedDb({
      user_id: UID,
      plan: 'free',
      stripe_customer_id: 'cus_1',
      stripe_subscription_id: 'sub_old',
      subscription_status: 'canceled',
      last_stripe_event_id: 'evt_prev',
      last_stripe_event_at: new Date(T.t0 * 1000).toISOString(),
    })
    getSupabaseAdmin.mockReturnValue(db.client())

    // Force BOTH handlers to complete their read before either writes.
    let release!: () => void
    db.gate.holdReadsUntil = new Promise<void>((r) => (release = r))

    constructEvent.mockReturnValueOnce(checkoutCompleted('evt_a', T.t1, 'sub_new'))
    const first = webhook(signedPost())
    constructEvent.mockReturnValueOnce(subDeleted('evt_b', T.t2, 'sub_old'))
    const second = webhook(signedPost())

    release()
    await Promise.all([first, second])

    expect(
      db.state.row?.plan,
      'a cancellation of sub_old must never revoke access bought on sub_new',
    ).toBe('pro')
    expect(db.state.row?.stripe_subscription_id).toBe('sub_new')
  })

  it('REQUIRED: two events read concurrently cannot both win — the newer state survives', async () => {
    const db = makeSharedDb({
      user_id: UID,
      plan: 'pro',
      stripe_customer_id: 'cus_1',
      stripe_subscription_id: 'sub_1',
      subscription_status: 'active',
      last_stripe_event_id: 'evt_prev',
      last_stripe_event_at: new Date(T.t0 * 1000).toISOString(),
    })
    getSupabaseAdmin.mockReturnValue(db.client())

    let release!: () => void
    db.gate.holdReadsUntil = new Promise<void>((r) => (release = r))

    // The OLDER event is dispatched second, so a naive last-write-wins loses.
    constructEvent.mockReturnValueOnce(subDeleted('evt_new', T.t2, 'sub_1'))
    const first = webhook(signedPost())
    constructEvent.mockReturnValueOnce(checkoutCompleted('evt_old', T.t1, 'sub_1'))
    const second = webhook(signedPost())

    release()
    await Promise.all([first, second])

    // t2 (the cancel) is the newest event, so Free is correct here — what must
    // NOT happen is the t1 event landing on top of it.
    expect(Date.parse(String(db.state.row?.last_stripe_event_at))).toBe(T.t2 * 1000)
    expect(db.state.row?.plan).toBe('free')
  })

  it('a duplicate delivered to two instances at once writes once and stays consistent', async () => {
    const db = makeSharedDb({
      user_id: UID,
      plan: 'pro',
      stripe_customer_id: 'cus_1',
      stripe_subscription_id: 'sub_1',
      subscription_status: 'active',
      last_stripe_event_id: 'evt_prev',
      last_stripe_event_at: new Date(T.t0 * 1000).toISOString(),
    })
    getSupabaseAdmin.mockReturnValue(db.client())

    let release!: () => void
    db.gate.holdReadsUntil = new Promise<void>((r) => (release = r))

    constructEvent.mockReturnValueOnce(subDeleted('evt_same', T.t2, 'sub_1'))
    const first = webhook(signedPost())
    constructEvent.mockReturnValueOnce(subDeleted('evt_same', T.t2, 'sub_1'))
    const second = webhook(signedPost())

    release()
    const [r1, r2] = await Promise.all([first, second])

    expect(r1.status).toBe(200)
    expect(r2.status).toBe(200)
    expect(db.state.row?.last_stripe_event_id).toBe('evt_same')
    expect(db.state.row?.plan).toBe('free')
  })

  it('two instances seeing NO row cannot both insert', async () => {
    const db = makeSharedDb(null)
    getSupabaseAdmin.mockReturnValue(db.client())

    let release!: () => void
    db.gate.holdReadsUntil = new Promise<void>((r) => (release = r))

    constructEvent.mockReturnValueOnce(checkoutCompleted('evt_a', T.t1, 'sub_new'))
    const first = webhook(signedPost())
    constructEvent.mockReturnValueOnce(checkoutCompleted('evt_b', T.t2, 'sub_new'))
    const second = webhook(signedPost())

    release()
    const [r1, r2] = await Promise.all([first, second])

    expect(r1.status).toBe(200)
    expect(r2.status).toBe(200)
    expect(db.state.row).not.toBeNull()
    expect(db.state.row?.plan).toBe('pro')
  })
})
