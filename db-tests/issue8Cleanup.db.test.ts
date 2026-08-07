import { readFileSync } from 'node:fs'
import { fileURLToPath, URL } from 'node:url'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type pg from 'pg'
import { connect, createScratchDatabase, dropScratchDatabase } from './helpers.js'

/**
 * docs/ISSUE_8_cleanup_sandbox_billing.sql, EXECUTED — against a disposable
 * PostgreSQL built from nothing but supabase/migrations.
 *
 * ── WHY THIS EXISTS ────────────────────────────────────────────────────────
 *
 * That script deletes rows from public.billing on the production project, and
 * there is no client write path to that table: a row deleted by mistake cannot
 * be restored by the application, and every affected user silently becomes
 * Free. Reading it carefully is not the same as knowing it compiles, that its
 * guards actually raise, or that its predicate matches the rows it claims.
 * PL/pgSQL fails at RUN time, not at parse time, so a typo in a variable name
 * inside a branch that only fires on drift would sit there undetected until the
 * one moment it was needed.
 *
 * So every claim the script makes is exercised here in both directions: the
 * happy path deletes exactly four rows and nothing else, and each guard is
 * shown to ABORT against a database deliberately drifted to trip it.
 *
 * ── THE ONE PLACE THIS DEVIATES FROM THE COMMITTED FILE, AND WHY ───────────
 *
 * The committed file ends in `rollback;` so that running it by accident is
 * harmless. That default is pinned by src/test/issue8CleanupSafety.test.ts,
 * which runs in the unit suite with no database and therefore cannot be
 * skipped. But a script that always rolls back cannot be observed deleting
 * anything, and "the rows are still there" is equally consistent with "the
 * script silently did nothing at all".
 *
 * So this suite runs BOTH variants. The verbatim file must leave every row in
 * place while still emitting the NOTICE that proves both DELETEs really
 * executed; and a copy whose single trailing `rollback;` is swapped for
 * `commit;` IN MEMORY must leave exactly the right rows behind. The swap is
 * asserted to change exactly one statement, so it can never quietly become a
 * different script.
 *
 * The target is guarded by helpers.connect() -> assertDisposableDatabaseUrl
 * before a socket opens, and every test runs on its own scratch database.
 */

const SCRATCH_DB = 'todonado_issue8_cleanup'
const CLEANUP_SQL = readFileSync(
  fileURLToPath(new URL('../docs/ISSUE_8_cleanup_sandbox_billing.sql', import.meta.url)),
  'utf8',
)

/** The production inventory this script was written against (2026-08-07). */
const BILLING_USER = 'c208748a-cc5b-434b-993f-cf6e3f5093a9'
const OTHER_USER = 'fbc3f5a5-0000-4000-8000-000000000001'
const ATTEMPTS = {
  consumed: '39ce9677-ca5b-4a95-a928-91023bdf8ea8',
  failedA: '87224037-fa27-4309-be1f-1e5255d64dc3',
  failedB: 'c685bff6-6584-4a84-aae4-4a03d3eccc55',
} as const
const TEST_SESSION = 'cs_test_b1kSOOscgNKsVTWPlMdfZZhYYxKElXwL0xjF7IHK75rESyimnd9YFs9Kuq'
const SUBSCRIPTION = 'sub_1U18RSErddcRZaKJOqT3yBTS'

interface Applier {
  applyChain: (client: pg.Client, opts?: { through?: string }) => Promise<string[]>
}

let admin: pg.Client
let db: pg.Client

/**
 * The live variant. Exactly one statement differs, and that is asserted rather
 * than trusted: a sloppier replace could silently neutralise a guard.
 */
function committedVariant(): string {
  const live = CLEANUP_SQL.replace(/^rollback;$/m, 'commit;')
  if (live === CLEANUP_SQL) throw new Error('no trailing rollback; found to swap')
  if ((live.match(/^commit;$/gm) ?? []).length !== 1) throw new Error('swap produced != 1 commit')
  if (/^rollback;$/m.test(live)) throw new Error('swap left a rollback behind')
  return live
}

interface Run {
  ok: boolean
  message: string
  notices: string[]
}

/**
 * Run a variant and REPORT the outcome instead of throwing, so an abort is data
 * a test can assert on.
 *
 * The defensive `rollback` afterwards matters: when a statement inside a
 * multi-statement simple query fails, PostgreSQL aborts the batch but leaves
 * the explicit transaction open in a failed state, and every later query on
 * that connection would answer "current transaction is aborted".
 */
async function run(client: pg.Client, sql: string): Promise<Run> {
  const notices: string[] = []
  const collect = (n: { message?: string }) => notices.push(n.message ?? '')
  client.on('notice', collect)
  try {
    await client.query(sql)
    return { ok: true, message: '', notices }
  } catch (err) {
    return { ok: false, message: (err as Error).message, notices }
  } finally {
    client.off('notice', collect)
    await client.query('rollback').catch(() => {})
  }
}

const count = async (client: pg.Client, table: string): Promise<number> => {
  const { rows } = await client.query(`select count(*)::int as n from ${table}`)
  return rows[0].n as number
}

/** The exact production shape: one Stripe-derived billing row, three terminal attempts. */
async function seedInventory(client: pg.Client): Promise<void> {
  await client.query('delete from public.checkout_attempts')
  await client.query('delete from public.billing')
  await client.query('delete from auth.users')

  await client.query(
    `insert into auth.users (id, email, email_confirmed_at)
     values ($1, 'sandbox.buyer@dbtest.local', now()),
            ($2, 'someone.else@dbtest.local',  now())`,
    [BILLING_USER, OTHER_USER],
  )

  // Application data for the second user, so "nothing else moved" has something
  // to be true about.
  await client.query(
    `insert into public.tasks (workspace_id, title, effort_minutes)
     select w.id, 'unrelated work', 30 from public.workspaces w where w.owner_id = $1`,
    [OTHER_USER],
  )

  await client.query(
    `insert into public.billing
       (user_id, plan, subscription_status, stripe_customer_id, stripe_subscription_id,
        last_stripe_event_id, last_stripe_event_at)
     values ($1, 'pro', 'active', 'cus_V1AnWqR8DqgM8W', $2,
             'evt_1U18RTErddcRZaKJwYulGXkq', '2026-08-05T17:17:23Z')`,
    [BILLING_USER, SUBSCRIPTION],
  )

  await client.query(
    `insert into public.checkout_attempts
       (id, user_id, price_id, status, stripe_session_id, stripe_subscription_id)
     values ($1, $4, 'price_1U14IOErddcRZaKJjnKUaA9P', 'consumed', $5, $6),
            ($2, $4, 'price_1U14IbErddcRZaKJCXH8NQ8t', 'failed',   null, null),
            ($3, $4, 'price_1U14IbErddcRZaKJCXH8NQ8t', 'failed',   null, null)`,
    [
      ATTEMPTS.consumed,
      ATTEMPTS.failedA,
      ATTEMPTS.failedB,
      BILLING_USER,
      TEST_SESSION,
      SUBSCRIPTION,
    ],
  )
}

beforeAll(async () => {
  admin = await connect()
  db = await createScratchDatabase(admin, SCRATCH_DB)
  const applier = (await import('../supabase/test/apply.mjs')) as unknown as Applier
  await applier.applyChain(db)
}, 180_000)

afterAll(async () => {
  await db?.end()
  if (admin) await dropScratchDatabase(admin, SCRATCH_DB)
  await admin?.end()
})

beforeEach(async () => {
  await seedInventory(db)
})

describe('the committed file, run verbatim', () => {
  it('completes without error and leaves every row exactly where it was', async () => {
    const result = await run(db, CLEANUP_SQL)

    expect(result.message).toBe('')
    expect(result.ok).toBe(true)
    expect(await count(db, 'public.billing')).toBe(1)
    expect(await count(db, 'public.checkout_attempts')).toBe(3)
  })

  it('really executed both deletes before throwing them away', async () => {
    /*
     * Without this, "the rows are still there" would also be the result of a
     * script that skipped straight past its own DELETEs. The NOTICEs are
     * emitted between the deletes and the rollback, so they are the only
     * evidence that the dry run exercised the real thing.
     */
    const result = await run(db, CLEANUP_SQL)

    expect(result.notices.join('\n')).toMatch(/deleted 3 checkout_attempts row\(s\)/)
    expect(result.notices.join('\n')).toMatch(/deleted 1 billing row\(s\)/)
    expect(result.notices.join('\n')).toMatch(/CLEAN\. checkout_attempts rows remaining: 0/)
  })
})

describe('the commit variant removes exactly the sandbox state', () => {
  it('deletes the one billing row and all three checkout attempts', async () => {
    const result = await run(db, committedVariant())

    expect(result.message).toBe('')
    expect(await count(db, 'public.billing')).toBe(0)
    expect(await count(db, 'public.checkout_attempts')).toBe(0)
  })

  it('leaves auth.users completely alone', async () => {
    const before = await count(db, 'auth.users')
    await run(db, committedVariant())

    expect(await count(db, 'auth.users')).toBe(before)
    const { rows } = await db.query('select id from auth.users where id = $1', [BILLING_USER])
    expect(rows).toHaveLength(1)
  })

  it('leaves application data alone', async () => {
    const before = {
      profiles: await count(db, 'public.profiles'),
      workspaces: await count(db, 'public.workspaces'),
      tasks: await count(db, 'public.tasks'),
    }
    await run(db, committedVariant())

    expect({
      profiles: await count(db, 'public.profiles'),
      workspaces: await count(db, 'public.workspaces'),
      tasks: await count(db, 'public.tasks'),
    }).toEqual(before)
  })
})

/* ────────────────────────────────────────────────────────────────────────────
 * FAIL CLOSED.
 *
 * Every case below runs the COMMIT variant, because a guard that only holds in
 * the rollback variant guards nothing. Each drifts the database in one way a
 * real month of production could, and each must abort with nothing deleted.
 * ──────────────────────────────────────────────────────────────────────────── */
describe('it refuses to run against a database that has drifted', () => {
  it('aborts when a second billing row has appeared', async () => {
    await db.query(
      `insert into public.billing (user_id, plan, subscription_status)
       values ($1, 'pro', 'founding')`,
      [OTHER_USER],
    )

    const result = await run(db, committedVariant())

    expect(result.ok).toBe(false)
    expect(result.message).toMatch(/billing has 2 row\(s\); the inventory saw 1/)
    expect(await count(db, 'public.billing')).toBe(2)
    expect(await count(db, 'public.checkout_attempts')).toBe(3)
  })

  it('aborts rather than deleting a row that has become a manual grant', async () => {
    /*
     * THE FOUNDING-ROW GUARANTEE, in its sharpest form. The named user is
     * unchanged; only the Stripe identifiers are gone, which is exactly the
     * shape docs/BILLING_SETUP.md section 6 writes to grant Pro by hand. The
     * script must notice that its delete set is now empty and refuse, rather
     * than deleting an entitlement it was never asked to touch.
     */
    await db.query(
      `update public.billing
          set stripe_customer_id = null, stripe_subscription_id = null,
              last_stripe_event_id = null, subscription_status = 'founding'
        where user_id = $1`,
      [BILLING_USER],
    )

    const result = await run(db, committedVariant())

    expect(result.ok).toBe(false)
    expect(result.message).toMatch(/Stripe-touched billing set is \{\}/)
    expect(await count(db, 'public.billing')).toBe(1)
  })

  it('aborts when the billing row belongs to a founding account', async () => {
    await db.query(`update auth.users set email = $2 where id = $1`, [
      BILLING_USER,
      'journeypixofficial@gmail.com',
    ])

    const result = await run(db, committedVariant())

    expect(result.ok).toBe(false)
    expect(result.message).toMatch(/belong to a founding account/)
    expect(await count(db, 'public.billing')).toBe(1)
  })

  it('aborts when a fourth checkout attempt has appeared', async () => {
    await db.query(
      `insert into public.checkout_attempts (user_id, price_id, status)
       values ($1, 'price_new', 'failed')`,
      [OTHER_USER],
    )

    const result = await run(db, committedVariant())

    expect(result.ok).toBe(false)
    expect(result.message).toMatch(/checkout_attempts has 4 row\(s\); the inventory saw 3/)
    expect(await count(db, 'public.checkout_attempts')).toBe(4)
  })

  it('aborts when a checkout is still open, so no payable session is orphaned', async () => {
    await db.query(`update public.checkout_attempts set status = 'reserved' where id = $1`, [
      ATTEMPTS.failedA,
    ])

    const result = await run(db, committedVariant())

    expect(result.ok).toBe(false)
    expect(result.message).toMatch(/1 non-terminal checkout attempt\(s\) exist/)
    expect(await count(db, 'public.checkout_attempts')).toBe(3)
  })

  it('aborts when a session id is not test mode', async () => {
    await db.query(`update public.checkout_attempts set stripe_session_id = $2 where id = $1`, [
      ATTEMPTS.consumed,
      'cs_live_somethingthatmustneverbedeletedblindly',
    ])

    const result = await run(db, committedVariant())

    expect(result.ok).toBe(false)
    expect(result.message).toMatch(/not cs_test_/)
    expect(await count(db, 'public.checkout_attempts')).toBe(3)
    expect(await count(db, 'public.billing')).toBe(1)
  })
})
