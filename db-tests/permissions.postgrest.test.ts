import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

/**
 * THE DEPLOYED INVOCATION PATH, not the database underneath it.
 *
 * db-tests/permissions.db.test.ts reads pg_proc and has_function_privilege on a
 * bare PostgreSQL. That proves the catalog is right. It does NOT prove what
 * happens when a request arrives through PostgREST carrying an anon or a user
 * JWT, which is the only way the real application is ever reached.
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
let userAId = ''
const stamp = Date.now()

beforeAll(async () => {
  userA = await signUp(`a-${stamp}@dbtest.local`)
  userB = await signUp(`b-${stamp}@dbtest.local`)
  const { data } = await userA.auth.getUser()
  userAId = data.user?.id ?? ''
  expect(userAId).toBeTruthy()
})

afterAll(async () => {
  // Leave the local stack clean; it is torn down anyway.
  await service().from('checkout_attempts').delete().neq('id', '00000000-0000-0000-0000-000000000000')
})

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
})

describe('service_role, through PostgREST', () => {
  it('CAN invoke the SECURITY DEFINER functions', async () => {
    const { data, error } = await service().rpc('reserve_checkout_attempt', {
      p_user_id: userAId, p_price_id: 'price_x',
    })
    expect(error).toBeNull()
    expect(data).toBeTruthy()
  })

  it('does NOT need direct table privileges — and does not have them', async () => {
    // The function is the access boundary. A direct read must fail even for
    // service_role, which is what makes that boundary real.
    const { error } = await service().from('checkout_attempts').select('*')
    expect(error, 'service_role should have no direct table access').toBeTruthy()
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

  it('CANNOT bypass the state machine merely because it is service_role', async () => {
    const reserved = await service().rpc('reserve_checkout_attempt', {
      p_user_id: userAId, p_price_id: 'price_monthly',
    })
    const attemptId = (reserved.data as { id: string }).id

    // Wrong price for what the attempt reserved: refused, not forced through.
    const { data } = await service().rpc('bind_verified_checkout', {
      p_attempt_id: attemptId, p_event_id: 'evt_1', p_event_at: new Date().toISOString(),
      p_customer_id: 'cus_1', p_subscription_id: 'sub_1', p_price_id: 'price_something_else',
      p_status: 'active', p_period_end: null, p_plan: 'pro',
    })
    expect(data, 'the function validates its own transitions regardless of caller').toBe(
      'attempt_price_mismatch',
    )
  })

  it('a controlled binding flow reaches Pro', async () => {
    const reserved = await service().rpc('reserve_checkout_attempt', {
      p_user_id: userAId, p_price_id: 'price_monthly',
    })
    const attemptId = (reserved.data as { id: string }).id

    const { data } = await service().rpc('bind_verified_checkout', {
      p_attempt_id: attemptId, p_event_id: `evt_ok_${stamp}`, p_event_at: new Date().toISOString(),
      p_customer_id: 'cus_1', p_subscription_id: `sub_${stamp}`, p_price_id: 'price_monthly',
      p_status: 'active', p_period_end: null, p_plan: 'pro',
    })
    expect(data).toBe('applied')

    const { data: billing } = await service().from('billing').select('*').eq('user_id', userAId)
    expect(billing?.[0]?.plan).toBe('pro')
  })
})
