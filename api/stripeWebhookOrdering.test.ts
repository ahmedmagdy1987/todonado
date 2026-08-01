import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { MinimalStripeEvent } from '../src/features/billing/webhookMapping.js'

/**
 * The webhook's ORDERING behaviour, end to end through the handler (audit FLAG-3).
 *
 * `webhookOrdering.test.ts` pins the decision in isolation. This file pins that
 * the handler actually consults it, actually reads the current row first, and
 * actually refuses to write — because a correct decision function that the
 * handler ignores would leave the bug exactly where it was.
 *
 * NEGATIVE CONTROL: against the pre-fix handler (a blind
 * `upsert(row, {onConflict:'user_id'})` with no read), every test in the first
 * three describe blocks fails, each one showing the downgrade being written.
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

const webhookMod = await import('./stripe-webhook.js')
const webhook = webhookMod.webHandler

const UID = 'user-123'
const T = { early: 1_800_000_000, mid: 1_800_000_100, late: 1_800_000_200 } as const

const ENV_KEYS = [
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
] as const

function configure() {
  process.env.STRIPE_SECRET_KEY = 'sk_test_dummy'
  process.env.STRIPE_WEBHOOK_SECRET = 'whsec_dummy'
  process.env.SUPABASE_URL = 'https://p.supabase.co'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-dummy'
}

const signedPost = () =>
  new Request('https://www.todonado.com/api/stripe-webhook', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'stripe-signature': 't=1,v1=ok' },
    body: JSON.stringify({ ignored: 'the mock returns the event' }),
  })

interface RecordedWrite {
  kind: 'upsert' | 'insert' | 'update'
  row: Record<string, unknown>
  guard?: string
}

/**
 * A Supabase admin double that records every write and supports BOTH shapes:
 * the blind `.upsert()` of the old handler and the read-then-conditional-write
 * of the new one. Supporting both is what lets this exact file run unchanged
 * against the unfixed code to produce the negative control.
 */
function makeAdmin(
  current: Record<string, unknown> | null,
  opts: { readError?: { message: string; code?: string }; updateMatches?: boolean } = {},
) {
  const writes: RecordedWrite[] = []
  const admin = {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: opts.readError ? null : current,
            error: opts.readError ?? null,
          }),
        }),
      }),
      upsert: async (row: Record<string, unknown>) => {
        writes.push({ kind: 'upsert', row })
        return { error: null }
      },
      insert: async (row: Record<string, unknown>) => {
        writes.push({ kind: 'insert', row })
        return { error: null }
      },
      update: (row: Record<string, unknown>) => ({
        eq: () => ({
          or: (guard: string) => ({
            select: async () => {
              writes.push({ kind: 'update', row, guard })
              return {
                data: opts.updateMatches === false ? [] : [{ user_id: UID }],
                error: null,
              }
            },
          }),
        }),
      }),
    }),
  }
  return { admin, writes }
}

/** A row for a customer who is currently paying, on sub_new. */
const proRow = (over: Record<string, unknown> = {}) => ({
  plan: 'pro',
  stripe_subscription_id: 'sub_new',
  last_stripe_event_id: 'evt_applied',
  last_stripe_event_at: new Date(T.mid * 1000).toISOString(),
  ...over,
})

const deletedEvent = (id: string, created: number, subscription: string): MinimalStripeEvent => ({
  id,
  created,
  type: 'customer.subscription.deleted',
  data: {
    object: { id: subscription, status: 'canceled', customer: 'cus_1', metadata: { user_id: UID } },
  },
})

const updatedEvent = (id: string, created: number, subscription: string): MinimalStripeEvent => ({
  id,
  created,
  type: 'customer.subscription.updated',
  data: {
    object: {
      id: subscription,
      status: 'active',
      current_period_end: created + 2_592_000,
      customer: 'cus_1',
      metadata: { user_id: UID },
    },
  },
})

/** Any write that would put this user on the Free plan. */
const downgrades = (writes: RecordedWrite[]) => writes.filter((w) => w.row.plan === 'free')

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

describe('stripe-webhook — a stale event must not downgrade a paying customer', () => {
  it('REQUIRED: an out-of-order subscription.deleted writes NO downgrade', async () => {
    const { admin, writes } = makeAdmin(proRow())
    getSupabaseAdmin.mockReturnValue(admin)
    constructEvent.mockReturnValue(deletedEvent('evt_cancel', T.early, 'sub_old'))

    const res = await webhook(signedPost())

    expect(res.status).toBe(200)
    expect(
      downgrades(writes),
      'a redelivered cancel older than the stored state must never reach the billing row',
    ).toEqual([])
  })

  it('REQUIRED: a redelivery arriving after a newer event does not rewind the row', async () => {
    const { admin, writes } = makeAdmin(
      proRow({ last_stripe_event_id: 'evt_renew', last_stripe_event_at: new Date(T.late * 1000).toISOString() }),
    )
    getSupabaseAdmin.mockReturnValue(admin)
    constructEvent.mockReturnValue(deletedEvent('evt_cancel', T.mid, 'sub_old'))

    await webhook(signedPost())

    expect(downgrades(writes)).toEqual([])
  })

  it('REQUIRED: a newer delete for a subscription the user no longer holds is refused', async () => {
    const { admin, writes } = makeAdmin(proRow({ stripe_subscription_id: 'sub_new' }))
    getSupabaseAdmin.mockReturnValue(admin)
    constructEvent.mockReturnValue(deletedEvent('evt_cancel', T.late, 'sub_old'))

    await webhook(signedPost())

    expect(downgrades(writes)).toEqual([])
  })
})

describe('stripe-webhook — de-duplication of a redelivered event', () => {
  it('REQUIRED: a duplicate delivery of the same event id writes nothing at all', async () => {
    const { admin, writes } = makeAdmin(proRow())
    getSupabaseAdmin.mockReturnValue(admin)
    constructEvent.mockReturnValue(updatedEvent('evt_applied', T.late, 'sub_new'))

    const res = await webhook(signedPost())

    expect(res.status).toBe(200)
    expect(writes, 'a Stripe redelivery must be a true no-op, not a rewrite').toEqual([])
  })
})

describe('stripe-webhook — the high-water mark is actually persisted', () => {
  it('stamps the event id and Stripe’s created time onto the row it writes', async () => {
    const { admin, writes } = makeAdmin(proRow())
    getSupabaseAdmin.mockReturnValue(admin)
    constructEvent.mockReturnValue(updatedEvent('evt_new', T.late, 'sub_new'))

    await webhook(signedPost())

    expect(writes).toHaveLength(1)
    expect(writes[0].row.last_stripe_event_id).toBe('evt_new')
    expect(writes[0].row.last_stripe_event_at).toBe(new Date(T.late * 1000).toISOString())
  })

  it('guards the UPDATE on the stored mark, so a concurrent newer write wins', async () => {
    const { admin, writes } = makeAdmin(proRow())
    getSupabaseAdmin.mockReturnValue(admin)
    constructEvent.mockReturnValue(updatedEvent('evt_new', T.late, 'sub_new'))

    await webhook(signedPost())

    expect(writes[0].kind).toBe('update')
    expect(
      writes[0].guard,
      'the write must be a compare-and-swap, not an unconditional overwrite',
    ).toContain('last_stripe_event_at')
  })

  it('answers 200 without error when the compare-and-swap matches no row', async () => {
    // Another delivery won the race with a newer event. Losing is correct and
    // must not look like a failure to Stripe, or it will retry forever.
    const { admin } = makeAdmin(proRow(), { updateMatches: false })
    getSupabaseAdmin.mockReturnValue(admin)
    constructEvent.mockReturnValue(updatedEvent('evt_new', T.late, 'sub_new'))

    const res = await webhook(signedPost())
    expect(res.status).toBe(200)
  })
})

describe('stripe-webhook — the fix must not be so tight that real events stop landing', () => {
  it('applies a genuine cancellation of the subscription actually held', async () => {
    const { admin, writes } = makeAdmin(proRow({ stripe_subscription_id: 'sub_new' }))
    getSupabaseAdmin.mockReturnValue(admin)
    constructEvent.mockReturnValue(deletedEvent('evt_cancel', T.late, 'sub_new'))

    await webhook(signedPost())

    expect(downgrades(writes)).toHaveLength(1)
  })

  it('inserts the first ever event for a user with no billing row', async () => {
    const { admin, writes } = makeAdmin(null)
    getSupabaseAdmin.mockReturnValue(admin)
    constructEvent.mockReturnValue(updatedEvent('evt_first', T.mid, 'sub_new'))

    await webhook(signedPost())

    expect(writes).toHaveLength(1)
    expect(writes[0].kind).toBe('insert')
    expect(writes[0].row.plan).toBe('pro')
  })

  it('still 200s and writes nothing for an unrelated event type', async () => {
    const { admin, writes } = makeAdmin(proRow())
    getSupabaseAdmin.mockReturnValue(admin)
    constructEvent.mockReturnValue({
      id: 'evt_x',
      created: T.late,
      type: 'invoice.paid',
      data: { object: {} },
    } as MinimalStripeEvent)

    const res = await webhook(signedPost())
    expect(res.status).toBe(200)
    expect(writes).toEqual([])
  })
})

describe('stripe-webhook — precondition: the ordering columns must exist', () => {
  it('fails CLOSED with 503 when the migration has not been applied', async () => {
    const { admin, writes } = makeAdmin(null, {
      readError: {
        code: '42703',
        message: 'column billing.last_stripe_event_id does not exist',
      },
    })
    getSupabaseAdmin.mockReturnValue(admin)
    constructEvent.mockReturnValue(updatedEvent('evt_new', T.late, 'sub_new'))

    const res = await webhook(signedPost())

    expect(res.status).toBe(503)
    await expect(res.json()).resolves.toEqual({ error: 'billing_schema_outdated' })
    expect(writes, 'nothing may be granted or revoked against an unmigrated schema').toEqual([])
  })

  it('does not leak the column name or any secret to the caller', async () => {
    const { admin } = makeAdmin(null, {
      readError: { code: '42703', message: 'column billing.last_stripe_event_id does not exist' },
    })
    getSupabaseAdmin.mockReturnValue(admin)
    constructEvent.mockReturnValue(updatedEvent('evt_new', T.late, 'sub_new'))

    const text = await (await webhook(signedPost())).text()
    expect(text).toBe('{"error":"billing_schema_outdated"}')
  })

  it('a generic read failure is a 500, distinct from the schema case', async () => {
    const { admin } = makeAdmin(null, { readError: { code: '08006', message: 'connection reset' } })
    getSupabaseAdmin.mockReturnValue(admin)
    constructEvent.mockReturnValue(updatedEvent('evt_new', T.late, 'sub_new'))

    const res = await webhook(signedPost())
    expect(res.status).toBe(500)
    await expect(res.json()).resolves.toEqual({ error: 'billing_read_failed' })
  })
})
