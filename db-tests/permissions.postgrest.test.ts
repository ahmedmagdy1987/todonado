import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { beforeAll, describe, expect, it } from 'vitest'

/**
 * THE DEPLOYED INVOCATION PATH, not the database underneath it.
 *
 * db-tests/permissions.db.test.ts reads pg_proc and has_table_privilege on a
 * bare PostgreSQL. That proves the catalog is right. It does NOT prove what
 * happens when a request arrives through PostgREST carrying an anon or a user
 * JWT, which is the only way the real application is ever reached — and the gap
 * between the two is not academic: the raw-Postgres suite called the money
 * path green for three migrations while this one answered
 *
 *     42501 permission denied for table billing
 *
 * to the exact SELECT api/create-checkout-session.ts performs. Fixed by
 * supabase/migrations/20260801160000_billing_service_role_access.sql; the reads
 * are asserted here in the same shape the handlers issue them, so a future
 * revoke breaks this suite rather than production.
 *
 * Runs against a FULLY LOCAL Supabase stack started by the CLI in CI. The URL
 * and keys come from `supabase status`; there is no production endpoint here.
 */

const URL_ = process.env.SUPABASE_URL ?? ''
const ANON = process.env.SUPABASE_ANON_KEY ?? ''
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''

/** Loud rather than silently skipped: an unproven permission is not a pass. */
beforeAll(() => {
  if (!URL_ || !ANON || !SERVICE) {
    throw new Error(
      'SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY are required. ' +
        'Start a LOCAL stack with `supabase start` and export them from `supabase status -o env`.',
    )
  }
  if (/supabase\.co/.test(URL_)) {
    throw new Error('REFUSING to run against a hosted Supabase project. Local stack only.')
  }
})

const anon = () => createClient(URL_, ANON, { auth: { persistSession: false } })
const service = () => createClient(URL_, SERVICE, { auth: { persistSession: false } })

/** A real signed-up user, with a real JWT, through GoTrue. */
async function signUp(email: string): Promise<SupabaseClient> {
  const c = anon()
  const { data, error } = await c.auth.signUp({ email, password: 'test-password-123!' })
  if (error) throw new Error(`signUp(${email}) failed: ${error.message}`)
  const token = data.session?.access_token
  if (!token) throw new Error(`signUp(${email}) returned no session (is autoconfirm on?)`)
  return createClient(URL_, ANON, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false },
  })
}

const idOf = async (c: SupabaseClient): Promise<string> => {
  const { data } = await c.auth.getUser()
  const id = data.user?.id ?? ''
  expect(id).toBeTruthy()
  return id
}

/**
 * THE TWO DIRECT READS, WRITTEN EXACTLY AS THE HANDLERS WRITE THEM.
 *
 * Copied column-for-column from api/create-checkout-session.ts and
 * api/_lib/entitlement.ts. A paraphrase would still have passed while the real
 * column list was refused, so these are deliberately not "a select on billing"
 * but the select those files issue.
 */
const duplicateSubscriptionGuardRead = (c: SupabaseClient, userId: string) =>
  c
    .from('billing')
    .select('stripe_customer_id, stripe_subscription_id, subscription_status')
    .eq('user_id', userId)
    .maybeSingle()

const resolveServerPlanRead = (c: SupabaseClient, userId: string) =>
  c.from('billing').select('plan').eq('user_id', userId).maybeSingle()

/** api/create-portal-session.ts — the third one, and the one nobody listed. */
const portalCustomerRead = (c: SupabaseClient, userId: string) =>
  c.from('billing').select('stripe_customer_id').eq('user_id', userId).maybeSingle()

const RPCS = [
  ['reserve_checkout_attempt', { p_user_id: '00000000-0000-4000-8000-000000000001', p_price_id: 'price_x' }],
  ['mark_checkout_attempt', { p_attempt_id: '00000000-0000-4000-8000-000000000001', p_status: 'failed' }],
  ['apply_stripe_subscription_event', {
    p_subscription_id: 'sub_x', p_event_id: 'evt_x', p_event_at: new Date().toISOString(),
    p_plan: 'pro', p_customer_id: 'cus_x', p_status: 'active', p_period_end: null, p_set_period_end: false,
  }],
] as const

let userA: SupabaseClient
let userB: SupabaseClient
/** A third user, given a REAL Pro binding, so the legitimate self-read can be
 *  proved without depending on what an earlier describe happened to leave. */
let userC: SupabaseClient
let userAId = ''
let userBId = ''
let userCId = ''
const stamp = Date.now()

beforeAll(async () => {
  userA = await signUp(`a-${stamp}@dbtest.local`)
  userB = await signUp(`b-${stamp}@dbtest.local`)
  userC = await signUp(`c-${stamp}@dbtest.local`)
  userAId = await idOf(userA)
  userBId = await idOf(userB)
  userCId = await idOf(userC)

  /*
   * Bind C a subscription through the ONLY sanctioned path — reserve, then
   * bind — so the row under test was produced the way production produces one.
   */
  const reserved = await service().rpc('reserve_checkout_attempt', {
    p_user_id: userCId, p_price_id: 'price_monthly',
  })
  expect(reserved.error).toBeNull()
  const attempt = reserved.data as { id: string; price_id: string }
  const bound = await service().rpc('bind_verified_checkout', {
    p_attempt_id: attempt.id, p_event_id: `evt_c_${stamp}`,
    p_event_at: new Date().toISOString(),
    p_customer_id: `cus_c_${stamp}`, p_subscription_id: `sub_c_${stamp}`,
    p_price_id: attempt.price_id, p_status: 'active', p_period_end: null, p_plan: 'pro',
  })
  expect(bound.data, `binding user C failed: ${JSON.stringify(bound.error)}`).toBe('applied')
})

/*
 * There is no afterAll cleanup any more, and its absence is deliberate. It used
 * to be `service().from('checkout_attempts').delete()`, which has been a silent
 * no-op ever since 20260801150000 revoked service_role's direct table access —
 * a tidy-up that could not tidy anything and whose failure nobody checked. The
 * stack is disposable; CI stops it in an `if: always()` step.
 */

describe('anon, through PostgREST', () => {
  it('cannot READ checkout_attempts', async () => {
    const { data, error } = await anon().from('checkout_attempts').select('*')
    // Either a hard permission error or an empty result is acceptable; leaking
    // a row is not.
    expect(error ?? { message: 'no error' }).toBeTruthy()
    expect(data ?? []).toEqual([])
  })

  it('cannot INSERT into checkout_attempts', async () => {
    const { error } = await anon()
      .from('checkout_attempts')
      .insert({ user_id: userAId, price_id: 'price_x' })
    expect(error, 'anon must not be able to create an attempt').toBeTruthy()
  })

  it('cannot UPDATE checkout_attempts', async () => {
    const { error } = await anon().from('checkout_attempts').update({ status: 'consumed' }).neq('id', '')
    expect(error).toBeTruthy()
  })

  it('cannot READ billing at all — refused, not merely filtered', async () => {
    /*
     * Before 20260801160000 this answered `200 []`: anon held a table-wide
     * SELECT from the platform default and RLS filtered every row away. The
     * empty array looked like proof and was not — it would have kept looking
     * like proof if the select-own policy had ever been widened. anon now has
     * no grant, so the request dies before RLS is consulted.
     */
    const { data, error } = await anon().from('billing').select('*')
    expect(error, 'anon must be refused outright').toBeTruthy()
    expect(data ?? []).toEqual([])
  })

  it('cannot read a KNOWN user billing row', async () => {
    const { data, error } = await anon().from('billing').select('plan').eq('user_id', userCId)
    expect(error).toBeTruthy()
    expect(data ?? []).toEqual([])
  })

  it('cannot mutate billing', async () => {
    const insert = await anon().from('billing').insert({ user_id: userAId, plan: 'pro' })
    expect(insert.error, 'anon must not be able to create a billing row').toBeTruthy()
    const update = await anon().from('billing').update({ plan: 'pro' }).eq('user_id', userAId)
    expect(update.error, 'anon must not be able to change a plan').toBeTruthy()
    const remove = await anon().from('billing').delete().eq('user_id', userAId)
    expect(remove.error, 'anon must not be able to delete billing state').toBeTruthy()
  })

  it.each(RPCS)('cannot invoke %s', async (fn, args) => {
    const { error } = await anon().rpc(fn as string, args as Record<string, unknown>)
    expect(error, `anon must not be able to call ${fn}`).toBeTruthy()
  })

  it('cannot invoke bind_verified_checkout', async () => {
    const { error } = await anon().rpc('bind_verified_checkout', {
      p_attempt_id: '00000000-0000-4000-8000-000000000001',
      p_event_id: 'evt_forged', p_event_at: new Date().toISOString(),
      p_customer_id: 'cus_x', p_subscription_id: 'sub_x', p_price_id: 'price_x',
      p_status: 'active', p_period_end: null, p_plan: 'pro',
    })
    expect(error).toBeTruthy()
  })

  it('cannot invoke apply_stripe_billing_event', async () => {
    const { error } = await anon().rpc('apply_stripe_billing_event', {
      p_user_id: userAId, p_event_id: 'evt_forged', p_event_at: new Date().toISOString(),
      p_plan: 'pro', p_customer_id: 'cus_x', p_subscription_id: 'sub_x',
      p_status: 'active', p_period_end: null, p_set_period_end: false,
    })
    expect(error).toBeTruthy()
  })
})

describe('authenticated user A, through PostgREST', () => {
  it.each(RPCS)('cannot invoke %s', async (fn, args) => {
    const { error } = await userA.rpc(fn as string, args as Record<string, unknown>)
    expect(error, `an authenticated user must not be able to call ${fn}`).toBeTruthy()
  })

  it('cannot MANUFACTURE a Pro binding', async () => {
    const { error } = await userA.rpc('bind_verified_checkout', {
      p_attempt_id: '00000000-0000-4000-8000-000000000001',
      p_event_id: 'evt_forged', p_event_at: new Date().toISOString(),
      p_customer_id: 'cus_x', p_subscription_id: 'sub_x', p_price_id: 'price_x',
      p_status: 'active', p_period_end: null, p_plan: 'pro',
    })
    expect(error, 'this is the call that would mint Pro').toBeTruthy()
  })

  it('cannot invoke apply_stripe_billing_event', async () => {
    const { error } = await userA.rpc('apply_stripe_billing_event', {
      p_user_id: userAId, p_event_id: 'evt_forged', p_event_at: new Date().toISOString(),
      p_plan: 'pro', p_customer_id: 'cus_x', p_subscription_id: 'sub_x',
      p_status: 'active', p_period_end: null, p_set_period_end: false,
    })
    expect(error).toBeTruthy()
  })

  it('cannot read or mutate checkout_attempts', async () => {
    const read = await userA.from('checkout_attempts').select('*')
    expect(read.data ?? []).toEqual([])
    const write = await userA.from('checkout_attempts').insert({ user_id: userAId, price_id: 'p' })
    expect(write.error).toBeTruthy()
  })

  it('cannot write its own billing row to Pro', async () => {
    const { error } = await userA.from('billing').upsert({ user_id: userAId, plan: 'pro' })
    expect(error, 'billing has no client write path').toBeTruthy()
  })

  it('cannot INSERT, UPDATE or DELETE billing by any route', async () => {
    // The upsert above is the obvious attempt. These are the other three verbs,
    // because a grant is per-verb and an audit that checks one has checked one.
    const insert = await userA.from('billing').insert({ user_id: userAId, plan: 'pro' })
    expect(insert.error).toBeTruthy()
    const update = await userA.from('billing').update({ plan: 'pro' }).eq('user_id', userAId)
    expect(update.error).toBeTruthy()
    const remove = await userA.from('billing').delete().eq('user_id', userAId)
    expect(remove.error).toBeTruthy()
  })

  it("cannot read user C's billing row, filtered or unfiltered", async () => {
    const targeted = await userA.from('billing').select('*').eq('user_id', userCId)
    expect(targeted.error).toBeNull()
    expect(targeted.data ?? []).toEqual([])

    // Unfiltered: isolation must be in the database, not in a client filter.
    const sweep = await userA.from('billing').select('*')
    expect(sweep.error).toBeNull()
    expect(sweep.data ?? [], 'A has no billing row and must see nobody else').toEqual([])
  })

  it("cannot UPDATE user C's plan", async () => {
    const { error } = await userA.from('billing').update({ plan: 'free' }).eq('user_id', userCId)
    expect(error, "A must not be able to touch C's subscription").toBeTruthy()
  })
})

/* ===========================================================================
 *  THE ONE THING AN AUTHENTICATED USER IS SUPPOSED TO BE ABLE TO DO.
 *
 *  Everything above is a refusal. If the migration had over-corrected and
 *  revoked authenticated's SELECT as well, every one of those tests would
 *  still be green while usePlan() and the settings data export silently
 *  returned nothing and every paying customer read as Free. This describe is
 *  the reason that cannot happen quietly.
 * ======================================================================== */
describe('authenticated user C — the legitimate self-read', () => {
  it('CAN read its own billing row', async () => {
    const { data, error } = await userC.from('billing').select('*').eq('user_id', userCId).maybeSingle()
    expect(error, error ? `${error.code} ${error.message}` : '').toBeNull()
    expect(data, 'the row bound in beforeAll must be readable by its owner').toBeTruthy()
    expect((data as { plan?: string } | null)?.plan).toBe('pro')
  })

  it('reads its own row with select * — the exact shape usePlan() issues', async () => {
    // usePlan() selects every column. If a future migration adds a column with
    // a column-level grant this would be the first thing to notice.
    const { data, error } = await userC.from('billing').select('*')
    expect(error).toBeNull()
    expect(data ?? []).toHaveLength(1)
    const row = (data ?? [])[0] as Record<string, unknown>
    expect(row.user_id).toBe(userCId)
    expect(row.plan).toBe('pro')
    // The ordering columns are on the row and readable by its owner. Nothing
    // secret lives here — it is Stripe's event id for the user's own row.
    expect(row).toHaveProperty('last_stripe_event_id')
    expect(row).toHaveProperty('stripe_subscription_id')
  })

  it('still cannot write it', async () => {
    const { error } = await userC.from('billing').update({ plan: 'free' }).eq('user_id', userCId)
    expect(error, 'reading your own plan is not permission to set it').toBeTruthy()
  })
})

describe('authenticated user B cannot reach user A state', () => {
  it('sees nothing of A attempts', async () => {
    // Seed A an attempt through the intended server path.
    const { error } = await service().rpc('reserve_checkout_attempt', {
      p_user_id: userAId, p_price_id: 'price_x',
    })
    expect(error).toBeNull()

    const { data } = await userB.from('checkout_attempts').select('*')
    expect(data ?? []).toEqual([])
  })

  it('cannot read A billing row', async () => {
    const { data } = await userB.from('billing').select('*').eq('user_id', userAId)
    expect(data ?? []).toEqual([])
  })

  it("cannot read C's bound subscription — the row that actually exists", async () => {
    // A missing row proves nothing about isolation. C has a real Pro row.
    const { data, error } = await userB.from('billing').select('*').eq('user_id', userCId)
    expect(error).toBeNull()
    expect(data ?? [], "B must not see C's Stripe ids").toEqual([])
  })

  it("cannot ALTER C's billing state", async () => {
    const update = await userB.from('billing').update({ plan: 'free' }).eq('user_id', userCId)
    expect(update.error).toBeTruthy()
    const remove = await userB.from('billing').delete().eq('user_id', userCId)
    expect(remove.error).toBeTruthy()

    // And it really is untouched.
    const { data } = await service().from('billing').select('plan').eq('user_id', userCId).maybeSingle()
    expect((data as { plan?: string } | null)?.plan).toBe('pro')
  })

  it("cannot mark or consume A's checkout attempt", async () => {
    const { error } = await userB.rpc('mark_checkout_attempt', {
      p_attempt_id: '00000000-0000-4000-8000-000000000001', p_status: 'consumed',
    })
    expect(error).toBeTruthy()
  })
})

describe('service_role, through PostgREST', () => {
  it('CAN invoke the SECURITY DEFINER functions', async () => {
    const { data, error } = await service().rpc('reserve_checkout_attempt', {
      p_user_id: userAId, p_price_id: 'price_x',
    })
    expect(error).toBeNull()
    expect(data).toBeTruthy()
  })

  it('does NOT need direct checkout_attempts privileges — and does not have them', async () => {
    // The function is the access boundary. A direct read must fail even for
    // service_role, which is what makes that boundary real.
    const { error } = await service().from('checkout_attempts').select('*')
    expect(error, 'service_role should have no direct table access').toBeTruthy()
  })

  /* ── THE READ THAT WAS 42501 ─────────────────────────────────────────── */

  it('CAN perform the exact duplicate-subscription guard SELECT', async () => {
    const { data, error } = await duplicateSubscriptionGuardRead(service(), userCId)
    expect(
      error,
      error ? `the checkout guard is still refused: ${error.code} ${error.message}` : '',
    ).toBeNull()
    expect(data, 'the guard must be able to see an existing subscription').toBeTruthy()
  })

  it('receives the expected duplicate-subscription DATA, not just a 200', async () => {
    // A green permission check that returns the wrong columns still breaks the
    // guard: it keys on stripe_subscription_id and subscription_status.
    const { data } = await duplicateSubscriptionGuardRead(service(), userCId)
    const row = data as Record<string, unknown> | null
    expect(row?.stripe_subscription_id).toBe(`sub_c_${stamp}`)
    expect(row?.stripe_customer_id).toBe(`cus_c_${stamp}`)
    expect(row?.subscription_status).toBe('active')
    // The guard blocks on exactly this set; 'active' is in it.
    expect(['active', 'trialing', 'past_due', 'unpaid', 'paused', 'incomplete']).toContain(
      row?.subscription_status,
    )
  })

  it('CAN perform the exact resolveServerPlan SELECT, and gets the entitlement', async () => {
    const { data, error } = await resolveServerPlanRead(service(), userCId)
    expect(error, error ? `${error.code} ${error.message}` : '').toBeNull()
    expect((data as { plan?: string } | null)?.plan, 'a paying user must resolve to pro').toBe('pro')
  })

  it('CAN perform the create-portal-session SELECT', async () => {
    const { data, error } = await portalCustomerRead(service(), userCId)
    expect(error, error ? `${error.code} ${error.message}` : '').toBeNull()
    expect((data as { stripe_customer_id?: string } | null)?.stripe_customer_id).toBe(
      `cus_c_${stamp}`,
    )
  })

  it('reads a user with no billing row as null, not as an error', async () => {
    // resolveServerPlan relies on this: absent row means Free, and it must be
    // distinguishable from "the read failed".
    const { data, error } = await resolveServerPlanRead(service(), userBId)
    expect(error).toBeNull()
    expect(data).toBeNull()
  })

  /* ── AND THE WRITES IT MUST STILL NOT HAVE ───────────────────────────── */

  it('CANNOT directly INSERT a manufactured Pro billing row', async () => {
    const { error } = await service()
      .from('billing')
      .insert({ user_id: userBId, plan: 'pro', subscription_status: 'active' })
    expect(error, 'a direct insert would bypass every ordering rule').toBeTruthy()

    // And nothing landed.
    const { data } = await resolveServerPlanRead(service(), userBId)
    expect(data).toBeNull()
  })

  it("CANNOT directly UPDATE a user's plan to Pro", async () => {
    const { error } = await service().from('billing').update({ plan: 'pro' }).eq('user_id', userCId)
    expect(error, 'the plan is only ever moved by apply_stripe_billing_event').toBeTruthy()
  })

  it('CANNOT directly DELETE billing state', async () => {
    const { error } = await service().from('billing').delete().eq('user_id', userCId)
    expect(error).toBeTruthy()

    const { data } = await resolveServerPlanRead(service(), userCId)
    expect((data as { plan?: string } | null)?.plan, 'C is still Pro').toBe('pro')
  })

  it('receives the documented outcome values', async () => {
    const { data } = await service().rpc('bind_verified_checkout', {
      p_attempt_id: '00000000-0000-4000-8000-0000000000ff',
      p_event_id: 'evt_unknown', p_event_at: new Date().toISOString(),
      p_customer_id: 'cus_x', p_subscription_id: 'sub_x', p_price_id: 'price_x',
      p_status: 'active', p_period_end: null, p_plan: 'pro',
    })
    expect(data).toBe('unknown_attempt')
  })

  /*
   * RESERVE RETURNS THE EXISTING OPEN ATTEMPT, whatever price it was created
   * with. That is the one-open-attempt invariant doing its job, and the first
   * version of the two tests below assumed the opposite: each called reserve
   * with 'price_monthly', got back an attempt reserved earlier in this file
   * with 'price_x', and the binding failed with attempt_price_mismatch. The
   * invariant working is what broke the assumption. Read the price off the
   * attempt that comes back rather than the one that was asked for.
   */
  const openAttempt = async (): Promise<{ id: string; price_id: string }> => {
    const { data, error } = await service().rpc('reserve_checkout_attempt', {
      p_user_id: userAId, p_price_id: 'price_monthly',
    })
    expect(error).toBeNull()
    return data as { id: string; price_id: string }
  }

  it('CANNOT bypass the state machine merely because it is service_role', async () => {
    const attempt = await openAttempt()

    // A price that is NOT what this attempt reserved: refused, not forced through.
    const { data } = await service().rpc('bind_verified_checkout', {
      p_attempt_id: attempt.id, p_event_id: 'evt_1', p_event_at: new Date().toISOString(),
      p_customer_id: 'cus_1', p_subscription_id: 'sub_1',
      p_price_id: `${attempt.price_id}_definitely_not_this`,
      p_status: 'active', p_period_end: null, p_plan: 'pro',
    })
    expect(data, 'the function validates its own transitions regardless of caller').toBe(
      'attempt_price_mismatch',
    )
  })

  it('cannot force an attempt into a state the CHECK forbids', async () => {
    const attempt = await openAttempt()
    const { error } = await service().rpc('mark_checkout_attempt', {
      p_attempt_id: attempt.id, p_status: 'definitely_not_a_status',
    })
    expect(error, 'the status CHECK is the database refusing, not the handler').toBeTruthy()
  })

  it('a controlled binding flow reaches Pro', async () => {
    const attempt = await openAttempt()

    const { data } = await service().rpc('bind_verified_checkout', {
      p_attempt_id: attempt.id, p_event_id: `evt_ok_${stamp}`,
      p_event_at: new Date().toISOString(),
      p_customer_id: 'cus_1', p_subscription_id: `sub_${stamp}`,
      p_price_id: attempt.price_id,
      p_status: 'active', p_period_end: null, p_plan: 'pro',
    })
    expect(data).toBe('applied')

    /*
     * Verify the binding two ways, because the first attempt at this assertion
     * failed with a bare `expected undefined to be 'pro'`, which says nothing
     * about whether the row is missing or merely unreadable.
     *
     * 1. FUNCTIONALLY, through a channel already proven to work: a lifecycle
     *    event for that exact subscription must now resolve to a user. Before
     *    the binding it would answer 'unknown_subscription'. This does not
     *    depend on service_role being able to SELECT anything.
     */
    const lifecycle = await service().rpc('apply_stripe_subscription_event', {
      p_subscription_id: `sub_${stamp}`,
      p_event_id: `evt_after_${stamp}`,
      p_event_at: new Date(Date.now() + 60_000).toISOString(),
      p_plan: 'pro',
      p_customer_id: 'cus_1',
      p_status: 'active',
      p_period_end: null,
      p_set_period_end: false,
    })
    expect(
      lifecycle.data,
      'the subscription must now be bound to a user; unknown_subscription means it is not',
    ).toBe('applied')

    /*
     * 2. By reading the row. This is the assertion that used to be written
     *    defensively ("IF service_role can read it") because it could not, and
     *    it is now a plain requirement: 20260801160000 grants the SELECT and
     *    three handlers depend on it.
     */
    const read = await service().from('billing').select('plan').eq('user_id', userAId)
    expect(
      read.error,
      read.error
        ? `service_role could not read billing through PostgREST: ${read.error.code ?? '?'} ${read.error.message}`
        : '',
    ).toBeNull()
    expect(read.data?.[0]?.plan, `billing rows returned: ${JSON.stringify(read.data)}`).toBe('pro')
  })
})
