import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type pg from 'pg'
import {
  DATA_API_ROLES,
  TABLE_PRIVILEGES,
  connect,
  hasTablePrivilege,
  heldPrivileges,
  makeUser,
  resetBillingState,
  tableGrants,
  type TablePrivilege,
} from './helpers.js'

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

/* ===========================================================================
 *  billing — the SQL privilege layer, stated as a complete matrix.
 *
 *  This table had NO grant of any kind in the repository until
 *  20260801160000_billing_service_role_access.sql. What access existed came
 *  from the platform's ALTER DEFAULT PRIVILEGES, which is not versioned here
 *  and — since `auto_expose_new_tables` flipped on 2026-05-30 (see
 *  supabase/config.toml) — is not given any more. The local Supabase stack
 *  proved it by refusing the money path's own read with 42501.
 *
 *  Every role and every privilege is named, including the ones nobody would
 *  think to grant, because an audit that lists only the interesting cells has
 *  no way to notice a new one.
 * ======================================================================== */
describe('billing table privileges — the complete SQL matrix', () => {
  /**
   * THE INTENDED CONTRACT. Change this and you are changing what production is
   * allowed to do, so it lives in one place and every assertion below reads
   * from it.
   *
   *  service_role   SELECT  — three direct reads: create-checkout-session (the
   *                           duplicate-subscription guard), create-portal-
   *                           session, and resolveServerPlan. No write: every
   *                           write goes through the SECURITY DEFINER billing
   *                           functions, which own the ordering and downgrade
   *                           rules.
   *  authenticated  SELECT  — the signed-in user's OWN row, narrowed by the
   *                           billing_select_own policy. usePlan() and the
   *                           settings data export both depend on it.
   *  anon           nothing — no logged-out code path reads billing.
   *  PUBLIC         nothing — the role an unintended grant hides in.
   */
  const INTENDED: Record<string, TablePrivilege[]> = {
    public: [],
    anon: [],
    authenticated: ['SELECT'],
    service_role: ['SELECT'],
  }

  it.each(DATA_API_ROLES)('%s holds exactly the intended privileges', async (role) => {
    expect(await heldPrivileges(root, role, 'public.billing')).toEqual(INTENDED[role])
  })

  /*
   * The same contract again, one cell at a time. The aggregate assertion above
   * fails with a diff; these fail with the ROLE and the PRIVILEGE in the test
   * name, which is what a reviewer reads first.
   */
  const CELLS: [string, TablePrivilege, boolean][] = DATA_API_ROLES.flatMap((role) =>
    TABLE_PRIVILEGES.map(
      (privilege) => [role, privilege, INTENDED[role].includes(privilege)] as [
        string,
        TablePrivilege,
        boolean,
      ],
    ),
  )

  it.each(CELLS)('%s / %s === %s', async (role, privilege, expected) => {
    expect(await hasTablePrivilege(root, role, 'public.billing', privilege)).toBe(expected)
  })

  it('the installed ACL contains those grants and NOTHING else', async () => {
    // Asks the catalog rather than a list of roles someone remembered, so a
    // grant to a role not named above still surfaces.
    expect(await tableGrants(root, 'public.billing')).toEqual([
      { grantee: 'authenticated', privilege: 'SELECT' },
      { grantee: 'service_role', privilege: 'SELECT' },
    ])
  })
})

/* ===========================================================================
 *  billing — RLS, tested SEPARATELY, because it is a different control.
 *
 *  This distinction is the whole lesson of the 42501. Every comment in the
 *  repo said "the webhook uses the service-role key, which bypasses RLS" —
 *  true, and irrelevant. BYPASSRLS decides which ROWS a role sees once it is
 *  allowed to touch the table; the GRANT decides whether it may touch the
 *  table at all. Losing either one breaks something, and they fail in
 *  completely different ways, so they are never asserted through each other.
 * ======================================================================== */
describe('billing RLS — rows, not table access', () => {
  let ownerId = ''
  let otherId = ''

  beforeAll(async () => {
    ownerId = await makeUser(root, 'rls-owner@dbtest.local')
    otherId = await makeUser(root, 'rls-other@dbtest.local')
    for (const id of [ownerId, otherId]) {
      await root.query(
        `insert into public.billing (user_id, plan, stripe_customer_id) values ($1, 'pro', $2)
         on conflict (user_id) do update set plan = 'pro'`,
        [id, `cus_${id.slice(0, 8)}`],
      )
    }
  })

  afterAll(async () => {
    await root.query('delete from public.billing where user_id = any($1)', [[ownerId, otherId]])
    await root.query(`delete from auth.users where email like 'rls-%@dbtest.local'`)
  })

  it('row level security is ENABLED on the table', async () => {
    const { rows } = await root.query(
      `select relrowsecurity from pg_class where oid = 'public.billing'::regclass`,
    )
    expect(rows[0].relrowsecurity).toBe(true)
  })

  it('the ONLY policy is billing_select_own, and it is SELECT-only', async () => {
    const { rows } = await root.query(
      `select policyname, cmd, qual, with_check from pg_policies
        where schemaname = 'public' and tablename = 'billing' order by policyname`,
    )
    expect(rows).toHaveLength(1)
    expect(rows[0].policyname).toBe('billing_select_own')
    expect(rows[0].cmd).toBe('SELECT')
    expect(rows[0].qual).toMatch(/auth\.uid\(\)/)
    // No write policy of ANY kind: a client can never write its own plan.
    expect(rows[0].with_check).toBeNull()
  })

  it('an authenticated user sees ITS OWN row and only that row', async () => {
    const c = await connect('authenticated')
    try {
      await c.query(`select set_config('request.jwt.claim.sub', $1, true)`, [ownerId])
      const { rows } = await c.query('select user_id from public.billing')
      expect(rows).toHaveLength(1)
      expect(rows[0].user_id).toBe(ownerId)
    } finally {
      await c.end()
    }
  })

  it("an authenticated user cannot see another user's row even when it names it", async () => {
    const c = await connect('authenticated')
    try {
      await c.query(`select set_config('request.jwt.claim.sub', $1, true)`, [ownerId])
      const { rows } = await c.query('select user_id from public.billing where user_id = $1', [
        otherId,
      ])
      expect(rows).toEqual([])
    } finally {
      await c.end()
    }
  })

  it('an authenticated user cannot INSERT or UPDATE — there is no write policy AND no grant', async () => {
    const c = await connect('authenticated')
    try {
      await c.query(`select set_config('request.jwt.claim.sub', $1, true)`, [ownerId])
      await expect(
        c.query(`update public.billing set plan = 'pro' where user_id = $1`, [ownerId]),
      ).rejects.toThrow(/permission denied/i)
      await expect(
        c.query(`insert into public.billing (user_id, plan) values ($1,'pro')`, [ownerId]),
      ).rejects.toThrow(/permission denied/i)
    } finally {
      await c.end()
    }
  })

  it('service_role BYPASSES RLS and sees every row — which is why the GRANT was the gate', async () => {
    /*
     * The point of this test is the contrast with the one above it. RLS never
     * stopped service_role; the missing table privilege did. If someone
     * "fixes" a future permission error by loosening a policy, this stays green
     * and the matrix suite goes red, which is the correct division of labour.
     */
    const c = await connect('service_role')
    try {
      const { rows } = await c.query('select user_id from public.billing')
      expect(rows.length).toBeGreaterThanOrEqual(2)
      expect(rows.map((r) => r.user_id as string)).toEqual(
        expect.arrayContaining([ownerId, otherId]),
      )
    } finally {
      await c.end()
    }
  })
})

describe('checkout_attempts table privileges', () => {
  // TRIGGER was missing from this list, so a grant of it would have gone
  // unnoticed. TABLE_PRIVILEGES is the complete set PostgreSQL can hand out.
  it.each(DATA_API_ROLES)('%s holds NO privilege at all', async (role) => {
    // service_role included: every access goes through SECURITY DEFINER
    // functions that run as the table owner, so a direct grant to ANY Data API
    // role is unnecessary surface. That is what makes the function boundary
    // real rather than decorative.
    expect(await heldPrivileges(root, role, 'public.checkout_attempts')).toEqual([])
  })

  it('nothing at all is granted on it', async () => {
    expect(await tableGrants(root, 'public.checkout_attempts')).toEqual([])
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

  it('anon cannot read the billing table — refused at the GRANT, not by RLS', async () => {
    /*
     * This assertion used to be `expect(rows).toEqual([])`, on the reasoning
     * that billing has a select-own policy and anon has no uid, so RLS returns
     * nothing. That was true AND it was hiding something: the empty array only
     * ever proved RLS worked, and it went on proving it while anon held a
     * table-wide SELECT grant handed out by the old shim.
     *
     * 20260801160000 revokes it. anon has no legitimate read — usePlan is
     * disabled until there is a user — so the request is now refused before RLS
     * is consulted at all. Two controls, and this is the outer one.
     */
    const c = await connect('anon')
    try {
      await expect(c.query('select * from public.billing')).rejects.toThrow(
        /permission denied for table billing/i,
      )
    } finally {
      await c.end()
    }
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

describe('SCHEMA privileges — the search_path of a SECURITY DEFINER function', () => {
  /**
   * REVOKE EXECUTE is not the whole story.
   *
   * Every one of these functions runs as `postgres` with `search_path=public`.
   * If an untrusted role could CREATE objects in a schema on that path, it
   * could plant a function or operator that the body resolves to instead of the
   * intended one, and it would run with the definer's rights. That is the
   * classic SECURITY DEFINER escalation, and no amount of revoking EXECUTE on
   * the outer function prevents it.
   *
   * PostgreSQL 15 removed PUBLIC's CREATE on `public` by default, so on a
   * modern server this holds without help. It is asserted anyway because it is
   * a property we depend on, not one we control.
   */
  const SEARCH_PATH_SCHEMAS = ['public']

  it('every function search_path is exactly the schemas we audit here', async () => {
    // If a function ever gains another schema on its path, this fails and the
    // list above must grow — otherwise the audit silently covers less than the
    // functions actually resolve against.
    const { rows } = await root.query(
      `select p.proname, p.proconfig
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = any($1)`,
      [BILLING_FUNCTIONS],
    )
    for (const r of rows) {
      const cfg = (r.proconfig as string[]).find((c) => c.startsWith('search_path='))
      expect(cfg, `${r.proname} must pin search_path`).toBeTruthy()
      const schemas = cfg!.replace('search_path=', '').split(',').map((s) => s.trim())
      expect(schemas).toEqual(SEARCH_PATH_SCHEMAS)
    }
  })

  it.each(['public', 'anon', 'authenticated'])(
    'REQUIRED: %s cannot CREATE objects in any searched schema',
    async (role) => {
      for (const schema of SEARCH_PATH_SCHEMAS) {
        const { rows } = await root.query('select has_schema_privilege($1,$2,$3) as ok', [
          role,
          schema,
          'CREATE',
        ])
        expect(
          rows[0].ok,
          `${role} holding CREATE on ${schema} would let it shadow an object a SECURITY DEFINER function resolves`,
        ).toBe(false)
      }
    },
  )

  it('the searched schema is owned by the same role that owns the functions', async () => {
    const { rows } = await root.query(
      `select nspowner::regrole::text as owner from pg_namespace where nspname = 'public'`,
    )
    expect(rows[0].owner).toBe('postgres')
  })

  it('service_role can USE public but does not own it', async () => {
    const usage = await root.query(
      `select has_schema_privilege('service_role','public','USAGE') as ok`,
    )
    expect(usage.rows[0].ok).toBe(true)
    const create = await root.query(
      `select has_schema_privilege('service_role','public','CREATE') as ok`,
    )
    // Not required by anything the money path does, so it should not have it.
    expect(create.rows[0].ok).toBe(false)
  })
})
