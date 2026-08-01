import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import type pg from 'pg'
import { T, connect, iso, makeUser, resetBillingState } from './helpers.js'

/**
 * CONCURRENCY, EXECUTED — two independent PostgreSQL connections.
 *
 * The unit suites model these functions in TypeScript, which can only ever show
 * that the handlers call them correctly. The guarantees themselves are
 * `select … for update` and a partial unique index, and nothing but a real
 * database can demonstrate either.
 *
 * Every connection sets statement_timeout and lock_timeout, so a deadlock or a
 * lock that is never released FAILS this suite instead of hanging CI.
 */

let root: pg.Client
let userA = ''
let userB = ''

const MONTHLY = 'price_monthly'
const YEARLY = 'price_yearly'

beforeAll(async () => {
  root = await connect()
  await resetBillingState(root)
  userA = await makeUser(root, 'conc-a@dbtest.local')
  userB = await makeUser(root, 'conc-b@dbtest.local')
})
afterAll(async () => {
  await resetBillingState(root)
  await root?.end()
})
afterEach(async () => {
  await root.query('delete from public.checkout_attempts')
  await root.query('delete from public.billing')
})

/** Seed a billing row directly, as a prior verified checkout would have left it. */
async function seedBilling(
  userId: string,
  over: Record<string, unknown> = {},
): Promise<void> {
  const row = {
    plan: 'pro',
    stripe_customer_id: 'cus_1',
    stripe_subscription_id: 'sub_todonado',
    subscription_status: 'active',
    last_stripe_event_id: 'evt_seed',
    last_stripe_event_at: iso(T.t1),
    ...over,
  }
  await root.query(
    `insert into public.billing
       (user_id, plan, stripe_customer_id, stripe_subscription_id,
        subscription_status, last_stripe_event_id, last_stripe_event_at)
     values ($1,$2,$3,$4,$5,$6,$7)`,
    [
      userId,
      row.plan,
      row.stripe_customer_id,
      row.stripe_subscription_id,
      row.subscription_status,
      row.last_stripe_event_id,
      row.last_stripe_event_at,
    ],
  )
}

const applyEvent = (
  c: pg.Client,
  userId: string,
  o: { id: string; at: number; plan: string; sub: string; status?: string },
) =>
  c.query('select public.apply_stripe_billing_event($1,$2,$3,$4,$5,$6,$7,$8,$9) as outcome', [
    userId,
    o.id,
    iso(o.at),
    o.plan,
    'cus_1',
    o.sub,
    o.status ?? (o.plan === 'pro' ? 'active' : 'canceled'),
    null,
    false,
  ])

const billingOf = async (userId: string) =>
  (await root.query('select * from public.billing where user_id = $1', [userId])).rows[0]

// ─────────────────────────── BILLING EVENT ORDERING ─────────────────────────

describe('apply_stripe_billing_event under real concurrency', () => {
  it('THE LOCK IS REAL: a second caller BLOCKS until the first transaction commits', async () => {
    /*
     * NECESSARY BUT NOT SUFFICIENT, and worth being precise about.
     *
     * This proves the operation is serialised. It does NOT prove `for update`
     * is present: without it the second caller still blocks, just at the UPDATE
     * rather than the SELECT. A mutation run removing `for update` left this
     * test green.
     *
     * The test that DOES catch that mutation is "two concurrent events cannot
     * both win" below — with a plain select, the loser decides on a stale read
     * and overwrites the newer mark, and the final row shows t1 where t3 belongs.
     * A hand-written "decision under the lock" test was tried here and deleted:
     * in READ COMMITTED every statement takes a fresh snapshot, so it passed
     * with and without the lock and proved nothing.
     */
    await seedBilling(userA)
    const a = await connect()
    const b = await connect()
    try {
      await a.query('begin')
      await applyEvent(a, userA, { id: 'evt_a', at: T.t2, plan: 'pro', sub: 'sub_todonado' })

      let bDone = false
      const bPromise = b
        .query('select public.apply_stripe_billing_event($1,$2,$3,$4,$5,$6,$7,$8,$9)', [
          userA, 'evt_b', iso(T.t3), 'free', 'cus_1', 'sub_todonado', 'canceled', null, false,
        ])
        .then((r) => {
          bDone = true
          return r
        })

      await new Promise((r) => setTimeout(r, 400))
      expect(bDone, 'B must be blocked while A holds the row').toBe(false)

      await a.query('commit')
      await bPromise
      expect(bDone).toBe(true)
    } finally {
      await a.query('rollback').catch(() => {})
      await a.end()
      await b.end()
    }
  })

  it('REQUIRED: an old cancellation for sub_old cannot revoke a newly bound sub_new', async () => {
    await seedBilling(userA, { stripe_subscription_id: 'sub_new', last_stripe_event_at: iso(T.t2) })
    const a = await connect()
    const b = await connect()
    try {
      // Both transactions start before either writes.
      await a.query('begin')
      await b.query('begin')
      await applyEvent(a, userA, { id: 'evt_new', at: T.t3, plan: 'pro', sub: 'sub_new' })
      await a.query('commit')

      const r = await applyEvent(b, userA, {
        id: 'evt_old_cancel', at: T.t3 + 1, plan: 'free', sub: 'sub_old',
      })
      await b.query('commit')

      expect(r.rows[0].outcome).toBe('downgrade_for_other_subscription')
      const row = await billingOf(userA)
      expect(row.plan).toBe('pro')
      expect(row.stripe_subscription_id).toBe('sub_new')
    } finally {
      await a.end()
      await b.end()
    }
  })

  /**
   * MUTATION-VERIFIED: removing `for update` from apply_stripe_billing_event
   * makes this fail with `expected 1800000100000 to be 1800000300000` — the
   * older event's mark overwriting the newer one.
   */
  it('REQUIRED: two concurrent events cannot both win — the newer survives', async () => {
    await seedBilling(userA, { last_stripe_event_at: iso(T.t0) })
    const a = await connect()
    const b = await connect()
    try {
      // The OLDER event is submitted second; last-write-wins would lose.
      await Promise.all([
        applyEvent(a, userA, { id: 'evt_newer', at: T.t3, plan: 'free', sub: 'sub_todonado' }),
        applyEvent(b, userA, { id: 'evt_older', at: T.t1, plan: 'pro', sub: 'sub_todonado' }),
      ])
      const row = await billingOf(userA)
      expect(Date.parse(row.last_stripe_event_at).valueOf()).toBe(T.t3 * 1000)
      expect(row.plan).toBe('free')
    } finally {
      await a.end()
      await b.end()
    }
  })

  it('REQUIRED: duplicate delivery is deterministic', async () => {
    await seedBilling(userA, { last_stripe_event_id: 'evt_dup', last_stripe_event_at: iso(T.t1) })
    const r = await applyEvent(root, userA, {
      id: 'evt_dup', at: T.t3, plan: 'free', sub: 'sub_todonado',
    })
    expect(r.rows[0].outcome).toBe('duplicate_event')
    expect((await billingOf(userA)).plan).toBe('pro')
  })

  it('REQUIRED: an equal timestamp lets an upgrade through and refuses a downgrade', async () => {
    await seedBilling(userA, { plan: 'free', last_stripe_event_at: iso(T.t2) })
    const up = await applyEvent(root, userA, {
      id: 'evt_up', at: T.t2, plan: 'pro', sub: 'sub_todonado',
    })
    expect(up.rows[0].outcome).toBe('applied')
    expect((await billingOf(userA)).plan).toBe('pro')

    const down = await applyEvent(root, userA, {
      id: 'evt_down', at: T.t2, plan: 'free', sub: 'sub_todonado',
    })
    expect(down.rows[0].outcome).toBe('stale_downgrade')
    expect((await billingOf(userA)).plan).toBe('pro')
  })

  it('REQUIRED: two first-ever events race with NO billing row and produce exactly one', async () => {
    const a = await connect()
    const b = await connect()
    try {
      const results = await Promise.all([
        applyEvent(a, userB, { id: 'evt_first_a', at: T.t1, plan: 'pro', sub: 'sub_x' }),
        applyEvent(b, userB, { id: 'evt_first_b', at: T.t2, plan: 'pro', sub: 'sub_x' }),
      ])
      const { rows } = await root.query('select * from public.billing where user_id = $1', [userB])
      expect(rows, 'user_id is the primary key; exactly one row must exist').toHaveLength(1)
      expect(results.every((r) => typeof r.rows[0].outcome === 'string')).toBe(true)
      // Whichever committed second, the newer event must be the stored mark.
      expect(Date.parse(rows[0].last_stripe_event_at).valueOf()).toBe(T.t2 * 1000)
    } finally {
      await a.end()
      await b.end()
    }
  })
})

// ─────────────────────────── CHECKOUT RESERVATION ───────────────────────────

const reserve = (c: pg.Client, userId: string, price: string) =>
  c.query('select (public.reserve_checkout_attempt($1,$2)).*', [userId, price])

const openAttempts = async (userId: string) =>
  (
    await root.query(
      `select * from public.checkout_attempts
        where user_id = $1 and status in ('reserved','session_created','completed')`,
      [userId],
    )
  ).rows

describe('reserve_checkout_attempt under real concurrency', () => {
  it('REQUIRED: two connections reserving at once yield ONE attempt, and both see it', async () => {
    const a = await connect()
    const b = await connect()
    try {
      const [ra, rb] = await Promise.all([
        reserve(a, userA, MONTHLY),
        reserve(b, userA, MONTHLY),
      ])
      expect(ra.rows[0].id).toBe(rb.rows[0].id)
      expect(await openAttempts(userA)).toHaveLength(1)
    } finally {
      await a.end()
      await b.end()
    }
  })

  it('REQUIRED: a monthly and a yearly request race — the first reserved price wins', async () => {
    const a = await connect()
    const b = await connect()
    try {
      const [ra, rb] = await Promise.all([
        reserve(a, userA, MONTHLY),
        reserve(b, userA, YEARLY),
      ])
      expect(ra.rows[0].id).toBe(rb.rows[0].id)
      expect(ra.rows[0].price_id).toBe(rb.rows[0].price_id)
      const open = await openAttempts(userA)
      expect(open).toHaveLength(1)
      expect([MONTHLY, YEARLY]).toContain(open[0].price_id)
    } finally {
      await a.end()
      await b.end()
    }
  })

  it('REQUIRED: the partial unique index rejects a second DIRECT insert', async () => {
    await reserve(root, userA, MONTHLY)
    await expect(
      root.query(
        `insert into public.checkout_attempts (user_id, price_id, status)
         values ($1, $2, 'reserved')`,
        [userA, YEARLY],
      ),
    ).rejects.toThrow(/duplicate key value violates unique constraint/i)
  })

  it.each(['reserved', 'session_created', 'completed'])(
    'REQUIRED: status %s blocks a second attempt',
    async (status) => {
      const r = await reserve(root, userA, MONTHLY)
      await root.query('update public.checkout_attempts set status = $2 where id = $1', [
        r.rows[0].id,
        status,
      ])
      const again = await reserve(root, userA, YEARLY)
      expect(again.rows[0].id).toBe(r.rows[0].id)
      expect(await openAttempts(userA)).toHaveLength(1)
    },
  )

  it.each(['consumed', 'expired', 'failed'])(
    'REQUIRED: terminal status %s permits a NEW attempt',
    async (status) => {
      const first = await reserve(root, userA, MONTHLY)
      await root.query('update public.checkout_attempts set status = $2 where id = $1', [
        first.rows[0].id,
        status,
      ])
      const second = await reserve(root, userA, YEARLY)
      expect(second.rows[0].id).not.toBe(first.rows[0].id)
      expect(second.rows[0].price_id).toBe(YEARLY)
    },
  )
})

describe('bind_verified_checkout under real concurrency', () => {
  const bind = (
    c: pg.Client,
    attemptId: string,
    o: { event: string; at: number; sub: string; price: string; plan?: string; status?: string },
  ) =>
    c.query('select public.bind_verified_checkout($1,$2,$3,$4,$5,$6,$7,$8,$9) as outcome', [
      attemptId,
      o.event,
      iso(o.at),
      'cus_1',
      o.sub,
      o.price,
      o.status ?? 'active',
      null,
      o.plan ?? 'pro',
    ])

  it('REQUIRED: two DIFFERENT sessions cannot both bind the same attempt', async () => {
    const r = await reserve(root, userA, MONTHLY)
    const id = r.rows[0].id

    const first = await bind(root, id, { event: 'evt_s1', at: T.t2, sub: 'sub_one', price: MONTHLY })
    expect(first.rows[0].outcome).toBe('applied')

    const second = await bind(root, id, {
      event: 'evt_s2', at: T.t3, sub: 'sub_two', price: MONTHLY,
    })
    expect(second.rows[0].outcome).toBe('attempt_already_consumed')

    const row = await billingOf(userA)
    expect(row.stripe_subscription_id).toBe('sub_one')
  })

  it('REQUIRED: replaying the SAME verified session is idempotent', async () => {
    const r = await reserve(root, userA, MONTHLY)
    const id = r.rows[0].id
    await bind(root, id, { event: 'evt_same', at: T.t2, sub: 'sub_one', price: MONTHLY })
    const replay = await bind(root, id, {
      event: 'evt_same', at: T.t2, sub: 'sub_one', price: MONTHLY,
    })
    expect(replay.rows[0].outcome).toBe('duplicate_event')
    expect((await billingOf(userA)).plan).toBe('pro')
  })

  it('REQUIRED: an unknown attempt id binds nothing', async () => {
    const r = await bind(root, '00000000-0000-4000-8000-0000000000ff', {
      event: 'evt_x', at: T.t2, sub: 'sub_x', price: MONTHLY,
    })
    expect(r.rows[0].outcome).toBe('unknown_attempt')
    expect(await billingOf(userA)).toBeUndefined()
  })

  it('REQUIRED: a price that is not what the attempt reserved binds nothing', async () => {
    const r = await reserve(root, userA, MONTHLY)
    const out = await bind(root, r.rows[0].id, {
      event: 'evt_x', at: T.t2, sub: 'sub_x', price: YEARLY,
    })
    expect(out.rows[0].outcome).toBe('attempt_price_mismatch')
    expect(await billingOf(userA)).toBeUndefined()
  })

  it('REQUIRED: two concurrent binds of one attempt produce exactly one subscription', async () => {
    const r = await reserve(root, userA, MONTHLY)
    const id = r.rows[0].id
    const a = await connect()
    const b = await connect()
    try {
      const outcomes = await Promise.all([
        bind(a, id, { event: 'evt_a', at: T.t2, sub: 'sub_a', price: MONTHLY }),
        bind(b, id, { event: 'evt_b', at: T.t3, sub: 'sub_b', price: MONTHLY }),
      ])
      const results = outcomes.map((o) => o.rows[0].outcome)
      expect(results.filter((x) => x === 'applied')).toHaveLength(1)
      expect(results).toContain('attempt_already_consumed')

      const row = await billingOf(userA)
      expect(['sub_a', 'sub_b']).toContain(row.stripe_subscription_id)
    } finally {
      await a.end()
      await b.end()
    }
  })

  it('the attempt is consumed even when the subscription does NOT entitle Pro', async () => {
    // Session complete, subscription incomplete. The user must not be stuck
    // with a permanently open attempt, and must not be granted Pro.
    const r = await reserve(root, userA, MONTHLY)
    const out = await bind(root, r.rows[0].id, {
      event: 'evt_inc', at: T.t2, sub: 'sub_inc', price: MONTHLY,
      plan: 'free', status: 'incomplete',
    })
    expect(out.rows[0].outcome).toBe('applied')

    const attempt = (
      await root.query('select * from public.checkout_attempts where id = $1', [r.rows[0].id])
    ).rows[0]
    expect(attempt.status, 'consumed, so a new attempt is possible').toBe('consumed')
    expect(attempt.stripe_subscription_id).toBe('sub_inc')

    const row = await billingOf(userA)
    expect(row.plan, 'a complete session is not an entitlement').toBe('free')
    expect(row.stripe_subscription_id, 'but the binding exists, so a later update can upgrade').toBe(
      'sub_inc',
    )
  })
})

describe('apply_stripe_subscription_event under real concurrency', () => {
  it('REQUIRED: an event for a subscription we do not hold writes nothing', async () => {
    await seedBilling(userA)
    const r = await root.query(
      'select public.apply_stripe_subscription_event($1,$2,$3,$4,$5,$6,$7,$8) as outcome',
      ['sub_other_hbv', 'evt_other', iso(T.t3), 'free', 'cus_1', 'canceled', null, false],
    )
    expect(r.rows[0].outcome).toBe('unknown_subscription')
    expect((await billingOf(userA)).plan).toBe('pro')
  })

  it('REQUIRED: it can never CREATE a binding', async () => {
    const r = await root.query(
      'select public.apply_stripe_subscription_event($1,$2,$3,$4,$5,$6,$7,$8) as outcome',
      ['sub_unknown', 'evt_x', iso(T.t3), 'pro', 'cus_1', 'active', null, false],
    )
    expect(r.rows[0].outcome).toBe('unknown_subscription')
    const { rows } = await root.query('select count(*)::int as n from public.billing')
    expect(rows[0].n).toBe(0)
  })

  it('the exact bound subscription CAN revoke', async () => {
    await seedBilling(userA)
    const r = await root.query(
      'select public.apply_stripe_subscription_event($1,$2,$3,$4,$5,$6,$7,$8) as outcome',
      ['sub_todonado', 'evt_cancel', iso(T.t3), 'free', 'cus_1', 'canceled', null, false],
    )
    expect(r.rows[0].outcome).toBe('applied')
    expect((await billingOf(userA)).plan).toBe('free')
  })

  it('an older lifecycle event cannot regress newer truth', async () => {
    await seedBilling(userA, { plan: 'free', subscription_status: 'canceled', last_stripe_event_at: iso(T.t3) })
    const r = await root.query(
      'select public.apply_stripe_subscription_event($1,$2,$3,$4,$5,$6,$7,$8) as outcome',
      ['sub_todonado', 'evt_stale_active', iso(T.t1), 'pro', 'cus_1', 'active', null, false],
    )
    expect(r.rows[0].outcome).toBe('stale_event')
    expect((await billingOf(userA)).plan, 'an old active update must not resurrect access').toBe('free')
  })
})
