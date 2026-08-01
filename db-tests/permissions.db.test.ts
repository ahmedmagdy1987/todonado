import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type pg from 'pg'
import { connect, makeUser, resetBillingState } from './helpers.js'

/**
 * WHO CAN ACTUALLY DO WHAT, read from the installed catalog.
 *
 * `REVOKE ... FROM anon, authenticated` in a migration file is not evidence.
 * PostgreSQL grants EXECUTE on every new function to PUBLIC by default, and
 * Supabase's ALTER DEFAULT PRIVILEGES hands tables and functions to
 * service_role. Only the catalog knows what survived.
 */

const BILLING_FUNCTIONS = [
  'apply_stripe_billing_event',
  'reserve_checkout_attempt',
  'mark_checkout_attempt',
  'bind_verified_checkout',
  'apply_stripe_subscription_event',
]

let root: pg.Client

beforeAll(async () => {
  root = await connect()
})
afterAll(async () => {
  await root?.end()
})

async function signature(fn: string): Promise<string> {
  const { rows } = await root.query(
    `select p.oid::regprocedure::text as sig
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = $1`,
    [fn],
  )
  expect(rows, `${fn} must exist after migration`).toHaveLength(1)
  return rows[0].sig as string
}

async function canExecute(role: string, fn: string): Promise<boolean> {
  const { rows } = await root.query('select has_function_privilege($1, $2, $3) as ok', [
    role,
    await signature(fn),
    'EXECUTE',
  ])
  return rows[0].ok as boolean
}

describe('function privileges — every billing RPC', () => {
  it.each(BILLING_FUNCTIONS)('%s: PUBLIC cannot execute', async (fn) => {
    // PostgreSQL grants EXECUTE to PUBLIC on CREATE FUNCTION. Revoking only
    // anon and authenticated would leave every one of these callable by anyone.
    expect(await canExecute('public', fn)).toBe(false)
  })

  it.each(BILLING_FUNCTIONS)('%s: anon cannot execute', async (fn) => {
    expect(await canExecute('anon', fn)).toBe(false)
  })

  it.each(BILLING_FUNCTIONS)('%s: authenticated cannot execute', async (fn) => {
    expect(await canExecute('authenticated', fn)).toBe(false)
  })

  it.each(BILLING_FUNCTIONS)('%s: service_role CAN execute', async (fn) => {
    // The money path must actually work, and this grant must be EXPLICIT rather
    // than inherited from Supabase's default privileges.
    expect(await canExecute('service_role', fn)).toBe(true)
  })

  it.each(BILLING_FUNCTIONS)('%s: is SECURITY DEFINER with a pinned search_path', async (fn) => {
    const { rows } = await root.query(
      `select p.prosecdef, p.proconfig, pg_get_userbyid(p.proowner) as owner
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = $1`,
      [fn],
    )
    expect(rows[0].prosecdef, 'must run as owner').toBe(true)
    // An unpinned search_path on SECURITY DEFINER is a privilege-escalation
    // primitive: the caller chooses which schema's objects the body resolves to.
    expect(rows[0].proconfig).toContain('search_path=public')
    expect(rows[0].owner).toBe('postgres')
  })
})

describe('checkout_attempts table privileges', () => {
  const PRIVS = ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES'] as const

  it.each(['public', 'anon', 'authenticated'])('%s holds NO privilege at all', async (role) => {
    for (const p of PRIVS) {
      const { rows } = await root.query('select has_table_privilege($1,$2,$3) as ok', [
        role,
        'public.checkout_attempts',
        p,
      ])
      expect(rows[0].ok, `${role} must not have ${p}`).toBe(false)
    }
  })

  it('service_role has no DIRECT table access either — only the functions', async () => {
    // Every access goes through SECURITY DEFINER functions that run as the
    // owner, so direct grants are unnecessary surface.
    for (const p of ['SELECT', 'INSERT', 'UPDATE', 'DELETE'] as const) {
      const { rows } = await root.query('select has_table_privilege($1,$2,$3) as ok', [
        'service_role',
        'public.checkout_attempts',
        p,
      ])
      expect(rows[0].ok, `service_role must not have direct ${p}`).toBe(false)
    }
  })

  it('RLS is enabled and there is no policy of any kind', async () => {
    const { rows: cls } = await root.query(
      `select relrowsecurity from pg_class where oid = 'public.checkout_attempts'::regclass`,
    )
    expect(cls[0].relrowsecurity).toBe(true)

    const { rows: pol } = await root.query(
      `select policyname from pg_policies where schemaname='public' and tablename='checkout_attempts'`,
    )
    expect(pol, 'a select policy would expose another user Checkout Session id').toEqual([])
  })

  it('the one-open-attempt index exists and is UNIQUE and PARTIAL', async () => {
    const { rows } = await root.query(
      `select indexdef from pg_indexes
        where schemaname='public' and indexname='checkout_attempts_one_open_per_user'`,
    )
    expect(rows).toHaveLength(1)
    expect(rows[0].indexdef).toContain('CREATE UNIQUE INDEX')
    expect(rows[0].indexdef).toContain('WHERE')
  })
})

describe('what each role can actually DO, executed', () => {
  let userA = ''
  let userB = ''

  beforeAll(async () => {
    await resetBillingState(root)
    userA = await makeUser(root, 'a@dbtest.local')
    userB = await makeUser(root, 'b@dbtest.local')
  })

  it('anon cannot execute reserve_checkout_attempt', async () => {
    const c = await connect('anon')
    await expect(
      c.query('select public.reserve_checkout_attempt($1,$2)', [userA, 'price_x']),
    ).rejects.toThrow(/permission denied/i)
    await c.end()
  })

  it('an authenticated user cannot reserve an attempt directly', async () => {
    const c = await connect('authenticated')
    await expect(
      c.query('select public.reserve_checkout_attempt($1,$2)', [userA, 'price_x']),
    ).rejects.toThrow(/permission denied/i)
    await c.end()
  })

  it('an authenticated user cannot MANUFACTURE a verified binding', async () => {
    const c = await connect('authenticated')
    await expect(
      c.query('select public.bind_verified_checkout($1,$2,$3,$4,$5,$6,$7,$8,$9)', [
        '00000000-0000-4000-8000-000000000001',
        'evt_forged',
        new Date().toISOString(),
        'cus_forged',
        'sub_forged',
        'price_x',
        'active',
        null,
        'pro',
      ]),
    ).rejects.toThrow(/permission denied/i)
    await c.end()
  })

  it('an authenticated user cannot insert an attempt row directly', async () => {
    const c = await connect('authenticated')
    await c.query(`select set_config('request.jwt.claim.sub', $1, true)`, [userA])
    await expect(
      c.query(`insert into public.checkout_attempts (user_id, price_id) values ($1,'price_x')`, [
        userA,
      ]),
    ).rejects.toThrow(/permission denied/i)
    await c.end()
  })

  it('user A cannot read user B attempt', async () => {
    // Seed B an attempt through the intended server path.
    await root.query('select public.reserve_checkout_attempt($1,$2)', [userB, 'price_x'])

    const c = await connect('authenticated')
    await c.query(`select set_config('request.jwt.claim.sub', $1, true)`, [userA])
    await expect(c.query('select * from public.checkout_attempts')).rejects.toThrow(
      /permission denied/i,
    )
    await c.end()
  })

  it('anon cannot read the billing table', async () => {
    const c = await connect('anon')
    const { rows } = await c.query('select * from public.billing')
    // billing has a select-own policy; anon has no uid, so RLS returns nothing.
    expect(rows).toEqual([])
    await c.end()
  })

  it('the service role CAN do everything the money path needs', async () => {
    const c = await connect('service_role')
    const r = await c.query('select public.reserve_checkout_attempt($1,$2) as a', [
      userA,
      'price_x',
    ])
    expect(r.rows[0].a).toBeTruthy()
    await c.end()
  })
})
