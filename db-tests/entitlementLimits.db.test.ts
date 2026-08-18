import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import type pg from 'pg'
import { connect, makeUser, SCHEMA_STATEMENT_TIMEOUT_MS } from './helpers'
import { ENTITLEMENTS } from '@/features/billing/entitlements'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  THE COMMERCIAL CAPS, EXECUTED AGAINST A REAL POSTGRES.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ── WHY THIS FILE HAD TO EXIST BEFORE ANY PRODUCTION WRITE ────────────────
 *
 * Everything asserted here was previously argued from reading SQL. That is not
 * good enough for two of these claims in particular:
 *
 *   RACE SAFETY   cannot be established by reading a `select count(*)` and an
 *                 `insert`. The whole question is what two connections do at
 *                 the same instant, so the race is EXECUTED here.
 *   FOUNDING PRO  is the claim with real consequences if wrong: the database
 *                 has no knowledge of the TypeScript email allowlist, so a
 *                 trigger that resolved the owner as Free would cap the owner.
 *
 * ── WHAT IT RUNS AGAINST ──────────────────────────────────────────────────
 *
 * A disposable local PostgreSQL with the shim plus the ENTIRE migration chain
 * applied from empty, exactly as `supabase db push` would.
 *
 * The trigger migration is applied from THE SAME FILE THAT SHIPS, so the thing
 * under test is the artefact and not a copy of it. It used to live in
 * docs/proposals/ and was promoted into supabase/migrations/ once the founding
 * seed made `billing` authoritative; the path followed it and nothing else
 * changed.
 *
 * ── WHAT IT DELIBERATELY DOES NOT DO ──────────────────────────────────────
 *
 * It never touches production, and `helpers.connect()` re-asserts that on every
 * connection through an allow-list over the parsed hostname.
 */

const PROPOSAL = fileURLToPath(
  new URL('../supabase/migrations/20260818120000_free_count_limits.sql', import.meta.url),
)

/** Every capped table, with the column set its NOT NULLs require. */
const CAPPED = [
  {
    table: 'user_templates',
    key: 'personalTemplates' as const,
    insert: (uid: string, n: number) =>
      [
        `insert into public.user_templates (user_id, title, tasks) values ($1, $2, '[]'::jsonb)`,
        [uid, `t${n}`],
      ] as const,
  },
  {
    table: 'vision_cards',
    key: 'visionCards' as const,
    insert: (uid: string, n: number) =>
      [`insert into public.vision_cards (user_id, title) values ($1, $2)`, [uid, `v${n}`]] as const,
  },
  {
    table: 'mind_maps',
    key: 'mindMaps' as const,
    insert: (uid: string, n: number) =>
      [`insert into public.mind_maps (user_id, title) values ($1, $2)`, [uid, `m${n}`]] as const,
  },
  {
    table: 'quit_habits',
    key: 'quitHabits' as const,
    insert: (uid: string, n: number) =>
      [`insert into public.quit_habits (user_id, name) values ($1, $2)`, [uid, `q${n}`]] as const,
  },
]

let db: pg.Client

/** Insert `n` rows for a user, asserting each one is accepted. */
async function fill(c: pg.Client, spec: (typeof CAPPED)[number], uid: string, n: number) {
  for (let i = 0; i < n; i += 1) {
    const [sql, params] = spec.insert(uid, i)
    await c.query(sql, params)
  }
}

const countOf = async (c: pg.Client, table: string, uid: string) =>
  Number(
    (await c.query(`select count(*)::int as n from public.${table} where user_id = $1`, [uid]))
      .rows[0].n,
  )

/** A user with the given billing shape. Returns the id. */
async function userWithPlan(
  c: pg.Client,
  email: string,
  billing: null | { plan: 'free' | 'pro'; status?: string | null; customer?: string | null },
) {
  const uid = await makeUser(c, email)
  if (billing) {
    await c.query(
      `insert into public.billing (user_id, plan, subscription_status, stripe_customer_id)
       values ($1, $2, $3, $4)`,
      [uid, billing.plan, billing.status ?? null, billing.customer ?? null],
    )
  }
  return uid
}

beforeAll(async () => {
  db = await connect()
  await db.query(`set statement_timeout = ${SCHEMA_STATEMENT_TIMEOUT_MS}`)
  // The artefact under review, applied verbatim.
  await db.query(readFileSync(PROPOSAL, 'utf8'))
}, 120_000)

afterAll(async () => {
  await db?.end()
})

beforeEach(async () => {
  for (const { table } of CAPPED) await db.query(`delete from public.${table}`)
  await db.query('delete from public.billing')
  await db.query(`delete from auth.users where email like '%@dbtest.local'`)
})

/* ═══════════════════════════════════════════════════════════════════════════
 *  effective_plan — the truth table, executed
 * ═══════════════════════════════════════════════════════════════════════════ */

describe('effective_plan(uuid)', () => {
  const plan = async (uid: string) =>
    (await db.query('select public.effective_plan($1) as p', [uid])).rows[0].p as string

  it('no billing row is an ANSWER: free', async () => {
    expect(await plan(await userWithPlan(db, 'norow@dbtest.local', null))).toBe('free')
  })

  it('a paid Pro row is pro', async () => {
    const uid = await userWithPlan(db, 'paid@dbtest.local', {
      plan: 'pro',
      status: 'active',
      customer: 'cus_x',
    })
    expect(await plan(uid)).toBe('pro')
  })

  it.each(['trialing', 'past_due'])('a pro row in %s is still pro', async (status) => {
    // The webhook already applied the status-to-plan policy, so `plan` IS the
    // answer and this function must not re-derive it.
    const uid = await userWithPlan(db, `s-${status}@dbtest.local`, { plan: 'pro', status })
    expect(await plan(uid)).toBe('pro')
  })

  it('A FOUNDING ROW IS PRO — with NULL Stripe identifiers', async () => {
    const uid = await userWithPlan(db, 'founder@dbtest.local', {
      plan: 'pro',
      status: 'founding',
      customer: null,
    })
    expect(await plan(uid)).toBe('pro')
  })

  it.each(['canceled', 'incomplete', 'unpaid'])('a free row in %s is free', async (status) => {
    const uid = await userWithPlan(db, `f-${status}@dbtest.local`, { plan: 'free', status })
    expect(await plan(uid)).toBe('free')
  })

  it('a CONTRADICTORY row resolves to the lower tier', async () => {
    // plan='free' with an active-looking status means the row is mid-update.
    // The safe reading of an inconsistent row is the tier that grants less.
    const uid = await userWithPlan(db, 'contra@dbtest.local', { plan: 'free', status: 'active' })
    expect(await plan(uid)).toBe('free')
  })

  it('an unknown user id is free, not an error', async () => {
    expect(await plan('00000000-0000-0000-0000-000000000000')).toBe('free')
  })
})

/* ═══════════════════════════════════════════════════════════════════════════
 *  The caps, per table, per tier
 * ═══════════════════════════════════════════════════════════════════════════ */

describe.each(CAPPED)('$table', (spec) => {
  const cap = ENTITLEMENTS.free.limits[spec.key]

  it(`FREE: allows exactly ${ENTITLEMENTS.free.limits[spec.key]} and refuses the next`, async () => {
    const uid = await userWithPlan(db, `free-${spec.table}@dbtest.local`, { plan: 'free' })
    await fill(db, spec, uid, cap)
    expect(await countOf(db, spec.table, uid)).toBe(cap)

    const [sql, params] = spec.insert(uid, 999)
    await expect(db.query(sql, params)).rejects.toThrow(/free_limit_reached/)
    expect(await countOf(db, spec.table, uid)).toBe(cap)
  })

  it('FREE: the refusal names the feature and the cap, machine-readably', async () => {
    const uid = await userWithPlan(db, `msg-${spec.table}@dbtest.local`, { plan: 'free' })
    await fill(db, spec, uid, cap)
    const [sql, params] = spec.insert(uid, 999)
    await expect(db.query(sql, params)).rejects.toThrow(
      new RegExp(`free_limit_reached:${spec.key}:${cap}`),
    )
  })

  it('PRO: goes well past the Free cap', async () => {
    const uid = await userWithPlan(db, `pro-${spec.table}@dbtest.local`, {
      plan: 'pro',
      status: 'active',
      customer: 'cus_x',
    })
    await fill(db, spec, uid, cap + 3)
    expect(await countOf(db, spec.table, uid)).toBe(cap + 3)
  })

  it('FOUNDING PRO: goes past the Free cap on a row with NULL Stripe ids', async () => {
    /*
     * THE PROOF THIS WHOLE EXERCISE WAS BLOCKED ON. The database cannot see the
     * TypeScript email allowlist, so a founding account is Pro here only if the
     * seeded row makes it so.
     */
    const uid = await userWithPlan(db, `founding-${spec.table}@dbtest.local`, {
      plan: 'pro',
      status: 'founding',
      customer: null,
    })
    await fill(db, spec, uid, cap + 3)
    expect(await countOf(db, spec.table, uid)).toBe(cap + 3)
  })

  it('counts PER USER, so one account cannot exhaust another', async () => {
    const a = await userWithPlan(db, `a-${spec.table}@dbtest.local`, { plan: 'free' })
    const b = await userWithPlan(db, `b-${spec.table}@dbtest.local`, { plan: 'free' })
    await fill(db, spec, a, cap)
    await fill(db, spec, b, cap)
    expect(await countOf(db, spec.table, b)).toBe(cap)
  })
})

/* ═══════════════════════════════════════════════════════════════════════════
 *  Grandfathering — the property that makes this safe to deploy
 * ═══════════════════════════════════════════════════════════════════════════ */

describe('an account already OVER the cap when the trigger arrives', () => {
  const spec = CAPPED[2] // mind_maps, cap 3
  const cap = ENTITLEMENTS.free.limits[spec.key]
  const OVER = cap + 4

  let uid: string

  beforeEach(async () => {
    /*
     * Reproduces the real sequence: the rows exist BEFORE enforcement does.
     * Dropping and recreating the trigger is how a test can stand where a
     * deployment stands, rather than asserting about a state it never entered.
     */
    await db.query(`drop trigger if exists enforce_free_limit on public.${spec.table}`)
    uid = await userWithPlan(db, 'grandfathered@dbtest.local', { plan: 'free' })
    await fill(db, spec, uid, OVER)
    await db.query(
      `create trigger enforce_free_limit before insert on public.${spec.table}
       for each row execute function public.enforce_free_count_limit('${spec.key}', '${cap}')`,
    )
  })

  it('KEEPS every existing row — nothing is deleted, hidden or archived', async () => {
    expect(await countOf(db, spec.table, uid)).toBe(OVER)
  })

  it('can still READ them', async () => {
    const { rows } = await db.query(
      `select id, title from public.${spec.table} where user_id = $1 order by title`,
      [uid],
    )
    expect(rows).toHaveLength(OVER)
  })

  it('can still UPDATE them: the cap gates creation, not editing', async () => {
    const { rowCount } = await db.query(
      `update public.${spec.table} set title = 'renamed' where user_id = $1`,
      [uid],
    )
    expect(rowCount).toBe(OVER)
  })

  it('can still DELETE them', async () => {
    const { rowCount } = await db.query(
      `delete from public.${spec.table} where user_id = $1 and title = 'm0'`,
      [uid],
    )
    expect(rowCount).toBe(1)
  })

  it('REFUSES a new one until the count falls back under the cap', async () => {
    const [sql, params] = spec.insert(uid, 999)
    await expect(db.query(sql, params)).rejects.toThrow(/free_limit_reached/)

    // Delete down to cap - 1, and creation becomes possible again.
    await db.query(
      `delete from public.${spec.table}
        where id in (select id from public.${spec.table} where user_id = $1 limit $2)`,
      [uid, OVER - (cap - 1)],
    )
    await db.query(sql, params)
    expect(await countOf(db, spec.table, uid)).toBe(cap)
  })

  it('becomes unlimited the moment the account is Pro, with no data migration', async () => {
    await db.query(`update public.billing set plan = 'pro' where user_id = $1`, [uid])
    const [sql, params] = spec.insert(uid, 998)
    await db.query(sql, params)
    expect(await countOf(db, spec.table, uid)).toBe(OVER + 1)
  })
})

/* ═══════════════════════════════════════════════════════════════════════════
 *  The race — executed, not reasoned about
 * ═══════════════════════════════════════════════════════════════════════════ */

describe('two concurrent inserts at the final Free slot', () => {
  const spec = CAPPED[3] // quit_habits, cap 3

  it('lets exactly ONE through, and the final count is the cap', async () => {
    /*
     * WITHOUT THE ADVISORY LOCK BOTH WOULD SUCCEED. Each transaction reads
     * `count(*) = cap - 1`, each decides there is room, and the table ends at
     * cap + 1. The lock serialises the two for this user, so the second counts
     * only after the first has committed.
     *
     * Both connections hold their transaction open until both inserts have been
     * issued, which is what forces genuine contention rather than two
     * statements that merely happen to be close together.
     */
    const cap = ENTITLEMENTS.free.limits[spec.key]
    const uid = await userWithPlan(db, 'race@dbtest.local', { plan: 'free' })
    await fill(db, spec, uid, cap - 1)

    const a = await connect()
    const b = await connect()
    try {
      const [sql, p1] = spec.insert(uid, 101)
      const [, p2] = spec.insert(uid, 102)

      /*
       * NO EXPLICIT TRANSACTIONS, AND THAT IS THE POINT.
       *
       * The first attempt at this test wrapped both connections in `begin` and
       * only committed after BOTH inserts had settled. That deadlocks by
       * construction: the second statement blocks on the advisory lock waiting
       * for the first transaction to commit, and the first cannot commit
       * because the harness is waiting for the second. It failed with a
       * statement timeout, which was in fact the lock working perfectly and the
       * test being wrong.
       *
       * Each insert is now its own implicit transaction, so the winner commits
       * and releases the xact lock immediately; the loser then wakes, counts,
       * and finds the cap already reached. That is exactly the production shape.
       */
      const results = await Promise.allSettled([a.query(sql, p1), b.query(sql, p2)])

      const won = results.filter((r) => r.status === 'fulfilled').length
      const lost = results.filter((r) => r.status === 'rejected')

      expect(won, 'exactly one insert must win').toBe(1)
      expect(lost).toHaveLength(1)
      expect(String((lost[0] as PromiseRejectedResult).reason)).toMatch(/free_limit_reached/)
      expect(await countOf(db, spec.table, uid)).toBe(cap)
    } finally {
      await a.end()
      await b.end()
    }
  })

  it('a Pro account is not serialised into a refusal by the same race', async () => {
    // The lock is taken only after Pro has been allowed through, so two
    // concurrent Pro inserts must both succeed.
    const uid = await userWithPlan(db, 'race-pro@dbtest.local', { plan: 'pro' })
    const a = await connect()
    const b = await connect()
    try {
      const [sql, p1] = spec.insert(uid, 201)
      const [, p2] = spec.insert(uid, 202)
      const results = await Promise.allSettled([a.query(sql, p1), b.query(sql, p2)])
      expect(results.every((r) => r.status === 'fulfilled')).toBe(true)
      expect(await countOf(db, spec.table, uid)).toBe(2)
    } finally {
      await a.end()
      await b.end()
    }
  })
})

/* ═══════════════════════════════════════════════════════════════════════════
 *  Direct bypass — no UI in the loop
 * ═══════════════════════════════════════════════════════════════════════════ */

describe('a caller going straight at the database', () => {
  const spec = CAPPED[0] // user_templates, cap 5

  it('is refused over the cap even as `authenticated`, with no client code involved', async () => {
    /*
     * The reason the trigger exists. Every one of these tables is written by the
     * browser straight through PostgREST, so the only refusal an attacker cannot
     * skip is one the database makes.
     */
    const cap = ENTITLEMENTS.free.limits[spec.key]
    const uid = await userWithPlan(db, 'bypass@dbtest.local', { plan: 'free' })
    await fill(db, spec, uid, cap)

    const attacker = await connect()
    try {
      /*
       * A GENUINE AUTHENTICATED SESSION, not merely `set role`.
       *
       * The shim's `auth.uid()` reads `request.jwt.claim.sub`, so without it RLS
       * refuses first and the test proves nothing about the trigger. Setting the
       * claim to the user's own id is what PostgREST does for a real request,
       * and it puts the caller past every ownership check — which is precisely
       * the position an attacker with a valid session is in.
       */
      await attacker.query(`set request.jwt.claim.sub = '${uid}'`)
      await attacker.query('set role authenticated')

      // Sanity: RLS is satisfied, so a refusal now can only be the trigger.
      const [sql, params] = spec.insert(uid, 999)
      await expect(attacker.query(sql, params)).rejects.toThrow(/free_limit_reached/)
    } finally {
      await attacker.end()
    }
    expect(await countOf(db, spec.table, uid)).toBe(cap)
  })

  it('cannot talk its way past by claiming a plan in the inserted row', async () => {
    // There is no column to claim it in, and the trigger reads `billing` rather
    // than anything in `new`. Asserted by inserting with an explicit id and
    // still being refused.
    const cap = ENTITLEMENTS.free.limits[spec.key]
    const uid = await userWithPlan(db, 'claim@dbtest.local', { plan: 'free' })
    await fill(db, spec, uid, cap)
    await expect(
      db.query(
        `insert into public.user_templates (id, user_id, title, tasks)
         values (gen_random_uuid(), $1, 'sneaky', '[]'::jsonb)`,
        [uid],
      ),
    ).rejects.toThrow(/free_limit_reached/)
  })
})

/* ═══════════════════════════════════════════════════════════════════════════
 *  The security/commercial separation, asserted on the live catalog
 * ═══════════════════════════════════════════════════════════════════════════ */

describe('the migration changed nothing it should not have', () => {
  it('left every RLS policy on the capped tables untouched', async () => {
    const { rows } = await db.query(
      `select c.relname, count(*)::int as policies
         from pg_policy p
         join pg_class c on c.oid = p.polrelid
         join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public'
          and c.relname = any($1)
        group by c.relname order by c.relname`,
      [CAPPED.map((s) => s.table)],
    )
    // Four owner-only policies per table (select/insert/update/delete), exactly
    // as the original migrations created them.
    expect(rows).toHaveLength(4)
    for (const r of rows) expect(r.policies, r.relname).toBe(4)
  })

  it('added a BEFORE INSERT trigger and nothing else, on each capped table', async () => {
    for (const { table } of CAPPED) {
      const { rows } = await db.query(
        `select t.tgname, t.tgtype from pg_trigger t
           join pg_class c on c.oid = t.tgrelid
          where c.relname = $1 and t.tgname = 'enforce_free_limit' and not t.tgisinternal`,
        [table],
      )
      expect(rows, table).toHaveLength(1)
      // tgtype bit 0 = ROW, bit 1 = BEFORE, bit 2 = INSERT  → 1|2|4 = 7
      expect(Number(rows[0].tgtype) & 7, `${table} must be BEFORE INSERT FOR EACH ROW`).toBe(7)
    }
  })

  it('left user_challenges alone, as decided', async () => {
    // Its limit counts a DERIVED phase needing the TypeScript catalog, a
    // progress computation over four tables and the user's local day. A trigger
    // counting `status = 'active'` would be stricter than the UI.
    const { rows } = await db.query(
      `select 1 from pg_trigger t join pg_class c on c.oid = t.tgrelid
        where c.relname = 'user_challenges' and t.tgname = 'enforce_free_limit'`,
    )
    expect(rows).toHaveLength(0)
  })
})
