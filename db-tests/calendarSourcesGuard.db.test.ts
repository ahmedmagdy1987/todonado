import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type pg from 'pg'
import { CALENDAR_URL_CASES } from '../src/features/calendar/urlPolicy'
import { MAX_CALENDAR_SOURCES_PER_USER } from '../src/lib/config'
import pgDriver from 'pg'
import {
  DATABASE_URL,
  STATEMENT_TIMEOUT_MS,
  connect,
  createScratchDatabase,
  databaseUrlFor,
  dropScratchDatabase,
} from './helpers.js'

/**
 * The FLAG-5 write guard, EXECUTED against a real PostgreSQL.
 *
 * ── WHY THE TEXT TESTS ARE NOT ENOUGH ───────────────────────────────────────
 *
 * `calendarCaps.test.ts` reads the migration and asserts what it SAYS. It
 * cannot tell you that the plpgsql compiles, that the regex in
 * `calendar_url_is_safe` decides the same cases the TypeScript does, or — the
 * one that actually matters — that the advisory lock really serialises two
 * concurrent inserts. A cap that holds when tested one row at a time and fails
 * under concurrency is the exact bug this design exists to avoid, and only two
 * real connections contending on one real database can show that it does not.
 *
 * ── THE SHARED TRUTH TABLE ──────────────────────────────────────────────────
 *
 * `CALENDAR_URL_CASES` is imported from the CLIENT module and run here against
 * the SQL function. One table, two implementations, in two languages. If they
 * ever disagree, this suite goes red instead of a user meeting a raw 23514 for
 * a URL the UI told them was fine.
 */

const SCRATCH_DB = 'todonado_calendar_guard'
const CAP = MAX_CALENDAR_SOURCES_PER_USER

interface Applier {
  applyChain: (client: pg.Client, opts?: { through?: string }) => Promise<string[]>
}

let admin: pg.Client
let db: pg.Client
let userA: string
let userB: string

/** A distinct, structurally valid subscription URL. */
const urlFor = (n: number) => `https://feed${n}.example.com/a.ics`

/**
 * A SECOND connection to the SCRATCH database.
 *
 * `helpers.connect()` opens the shared test database, which is the wrong one
 * here and would have made the race tests contend on a table that does not
 * carry this migration. The scratch database is where the chain was applied,
 * so every contender has to be pointed at it explicitly.
 */
async function connectScratch(): Promise<pgDriver.Client> {
  const client = new pgDriver.Client({ connectionString: databaseUrlFor(SCRATCH_DB) })
  await client.connect()
  await client.query(`set statement_timeout = ${STATEMENT_TIMEOUT_MS}`)
  // A blocked contender must FAIL rather than hang the suite.
  await client.query(`set lock_timeout = ${STATEMENT_TIMEOUT_MS}`)
  return client
}

async function makeUser(client: pg.Client, email: string): Promise<string> {
  const { rows } = await client.query(
    `insert into auth.users (email, email_confirmed_at) values ($1, now()) returning id`,
    [email],
  )
  return rows[0].id as string
}

type Attempt = { ok: true } | { ok: false; code: string; message: string }

async function insertSource(
  client: pg.Client,
  userId: string,
  url: string | null,
  kind: 'url' | 'file' = 'url',
): Promise<Attempt> {
  try {
    await client.query(
      `insert into public.calendar_sources (user_id, kind, label, url, ics_text)
       values ($1, $2, 'Cal', $3, $4)`,
      [userId, kind, url, kind === 'file' ? 'BEGIN:VCALENDAR' : null],
    )
    return { ok: true }
  } catch (err) {
    const e = err as { code?: string; message?: string }
    return { ok: false, code: e.code ?? '?', message: e.message ?? 'unknown' }
  }
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
  await db.query('delete from public.calendar_sources')
  await db.query('delete from auth.users')
  userA = await makeUser(db, 'cal.a@dbtest.local')
  userB = await makeUser(db, 'cal.b@dbtest.local')
})

// ───────────────────────────────────────────────────────────────────────────
describe('the structural URL policy agrees with the client, case for case', () => {
  it('decides every shared case the same way checkCalendarUrl does', async () => {
    /*
     * One query for the whole table rather than a test per case: the point is
     * the DIFF between the two implementations, and a single failure listing
     * every disagreement is far more useful than the first one aborting.
     */
    const urls = CALENDAR_URL_CASES.map((c) => c.url)
    const { rows } = await db.query<{ url: string; safe: boolean | null }>(
      `select u as url, public.calendar_url_is_safe(u) as safe
         from unnest($1::text[]) as u`,
      [urls],
    )
    const sqlSaid = new Map(rows.map((r) => [r.url, r.safe === true]))

    const disagreements = CALENDAR_URL_CASES.filter((c) => sqlSaid.get(c.url) !== c.ok).map(
      (c) => `${JSON.stringify(c.url)} (${c.note}): table says ${c.ok}, SQL says ${sqlSaid.get(c.url)}`,
    )
    expect(disagreements, disagreements.join('\n')).toEqual([])
  })

  it('answers null for null rather than throwing, so the CHECK can short-circuit', async () => {
    const { rows } = await db.query(`select public.calendar_url_is_safe(null) as safe`)
    expect(rows[0].safe).toBeNull()
  })
})

// ───────────────────────────────────────────────────────────────────────────
describe('the CHECK constraint refuses what the policy rejects', () => {
  it('accepts a normal subscription', async () => {
    expect(await insertSource(db, userA, 'https://calendar.google.com/x/basic.ics')).toEqual({
      ok: true,
    })
  })

  for (const bad of [
    'https://169.254.169.254/latest/meta-data/',
    'https://127.0.0.1/a.ics',
    'https://[::1]/a.ics',
    'https://localhost/a.ics',
    'https://user:pass@example.com/a.ics',
    'ftp://example.com/a.ics',
    'file:///etc/passwd',
    'https://example.com:22/a.ics',
  ]) {
    it(`refuses ${bad}`, async () => {
      const attempt = await insertSource(db, userA, bad)
      expect(attempt.ok).toBe(false)
      if (!attempt.ok) expect(attempt.code).toBe('23514')
    })
  }
})

// ───────────────────────────────────────────────────────────────────────────
describe('the shape constraint', () => {
  it('refuses a url source with no url', async () => {
    const attempt = await insertSource(db, userA, null, 'url')
    expect(attempt.ok).toBe(false)
  })

  it('refuses a file source that also carries a url', async () => {
    const attempt = await db
      .query(
        `insert into public.calendar_sources (user_id, kind, label, url, ics_text)
         values ($1, 'file', 'Cal', 'https://example.com/a.ics', 'BEGIN:VCALENDAR')`,
        [userA],
      )
      .then(() => ({ ok: true }) as Attempt)
      .catch((e: { code?: string }) => ({ ok: false, code: e.code ?? '?', message: '' }) as Attempt)
    expect(attempt.ok).toBe(false)
  })

  it('accepts an uploaded file with no url', async () => {
    expect(await insertSource(db, userA, null, 'file')).toEqual({ ok: true })
  })
})

// ───────────────────────────────────────────────────────────────────────────
describe('exact duplicates', () => {
  it('refuses the same subscription twice for one user', async () => {
    expect(await insertSource(db, userA, urlFor(1))).toEqual({ ok: true })
    const second = await insertSource(db, userA, urlFor(1))
    expect(second.ok).toBe(false)
    if (!second.ok) expect(second.code).toBe('23505')
  })

  it('lets two different users subscribe to the same calendar', async () => {
    expect(await insertSource(db, userA, urlFor(1))).toEqual({ ok: true })
    expect(await insertSource(db, userB, urlFor(1))).toEqual({ ok: true })
  })
})

// ───────────────────────────────────────────────────────────────────────────
describe('the durable per-user cap', () => {
  it(`accepts sources 1 through ${CAP} and refuses the next`, async () => {
    for (let n = 1; n <= CAP; n += 1) {
      expect(await insertSource(db, userA, urlFor(n)), `source ${n}`).toEqual({ ok: true })
    }
    const overflow = await insertSource(db, userA, urlFor(CAP + 1))
    expect(overflow.ok).toBe(false)
    if (!overflow.ok) {
      expect(overflow.code).toBe('23514')
      expect(overflow.message).toMatch(/maximum per user/)
    }
  })

  it('counts uploaded files too, so storage is capped as well as fan-out', async () => {
    for (let n = 1; n <= CAP; n += 1) {
      expect(await insertSource(db, userA, null, 'file')).toEqual({ ok: true })
    }
    expect((await insertSource(db, userA, urlFor(1))).ok).toBe(false)
  })

  it('frees a slot on delete', async () => {
    for (let n = 1; n <= CAP; n += 1) await insertSource(db, userA, urlFor(n))
    expect((await insertSource(db, userA, urlFor(99))).ok).toBe(false)
    await db.query(`delete from public.calendar_sources where url = $1`, [urlFor(1)])
    expect(await insertSource(db, userA, urlFor(99))).toEqual({ ok: true })
  })

  it("one user's cap does not touch another's", async () => {
    for (let n = 1; n <= CAP; n += 1) await insertSource(db, userA, urlFor(n))
    expect((await insertSource(db, userA, urlFor(99))).ok).toBe(false)
    expect(await insertSource(db, userB, urlFor(1)), 'B is unaffected').toEqual({ ok: true })
  })

  it('refuses moving a row to an owner who is already full', async () => {
    for (let n = 1; n <= CAP; n += 1) await insertSource(db, userA, urlFor(n))
    await insertSource(db, userB, urlFor(500))
    const moved = await db
      .query(`update public.calendar_sources set user_id = $1 where user_id = $2`, [userA, userB])
      .then(() => ({ ok: true }) as Attempt)
      .catch((e: { code?: string }) => ({ ok: false, code: e.code ?? '?', message: '' }) as Attempt)
    expect(moved.ok).toBe(false)
  })
})

// ───────────────────────────────────────────────────────────────────────────
describe('THE RACE — the reason this is a trigger and not a count', () => {
  it('two concurrent transactions cannot both take the last slot', async () => {
    /*
     * The precise failure being excluded: at CAP-1 rows, two transactions each
     * `select count(*)`, both read CAP-1, both insert, and the user ends with
     * CAP+1. Under READ COMMITTED that is the DEFAULT outcome without a lock.
     *
     * Both connections open a transaction and insert BEFORE either commits, so
     * the second genuinely contends rather than merely arriving later.
     */
    for (let n = 1; n < CAP; n += 1) await insertSource(db, userA, urlFor(n))
    expect(await count(userA)).toBe(CAP - 1)

    const one = await connectScratch()
    const two = await connectScratch()
    try {
      await one.query('begin')
      await two.query('begin')

      const first = insertSourceOn(one, userA, urlFor(900))
      const second = insertSourceOn(two, userA, urlFor(901))
      const [a, b] = await Promise.all([first, second])

      await one.query('commit').catch(() => {})
      await two.query('commit').catch(() => {})

      const winners = [a, b].filter((r) => r.ok).length
      expect(winners, 'exactly one insert may take the last slot').toBe(1)
      expect(await count(userA)).toBe(CAP)
    } finally {
      await one.query('rollback').catch(() => {})
      await two.query('rollback').catch(() => {})
      await one.end()
      await two.end()
    }
  })

  it('twenty concurrent inserts from empty still land on the cap, never above', async () => {
    /*
     * THE CASE THAT KILLS THE OBVIOUS ALTERNATIVE. Locking the user's existing
     * rows `for update` passes the test above and fails this one: a user with
     * zero rows has nothing to lock, so every transaction sees zero and every
     * one succeeds. An advisory lock keyed on the user id exists whether or not
     * a row does.
     */
    const clients = await Promise.all(Array.from({ length: 20 }, () => connectScratch()))
    try {
      const results = await Promise.all(
        clients.map((c, i) =>
          (async () => {
            await c.query('begin')
            const r = await insertSourceOn(c, userA, urlFor(1000 + i))
            await c.query(r.ok ? 'commit' : 'rollback').catch(() => {})
            return r
          })(),
        ),
      )
      expect(results.filter((r) => r.ok).length).toBe(CAP)
      expect(await count(userA)).toBe(CAP)
    } finally {
      await Promise.all(clients.map((c) => c.end().catch(() => {})))
    }
  }, 60_000)
})

describe('the failure modes at the boundary, and which way they fail', () => {
  it('an UNCOMMITTED delete does not free a slot', async () => {
    // The safety-critical direction. If a delete that later rolls back could
    // free a slot, the cap would be defeated by opening a transaction.
    for (let n = 1; n <= CAP; n += 1) await insertSource(db, userA, urlFor(n))
    const deleter = await connectScratch()
    const inserter = await connectScratch()
    try {
      await deleter.query('begin')
      await inserter.query('begin')
      await deleter.query(`delete from public.calendar_sources where user_id = $1 and url = $2`, [
        userA,
        urlFor(1),
      ])
      const raced = insertSourceOn(inserter, userA, urlFor(900))
      await deleter.query('rollback')
      const result = await raced
      await inserter.query('rollback').catch(() => {})

      expect(result.ok).toBe(false)
      expect(await count(userA)).toBe(CAP)
    } finally {
      await deleter.end()
      await inserter.end()
    }
  })

  it('never exceeds the cap when a slot frees mid-statement, whichever way it lands', async () => {
    /*
     * THE OUTCOME HERE IS TIMING-DEPENDENT, AND ASSERTING IT WOULD BE FLAKY.
     * An earlier version of this test did assert it and failed intermittently,
     * which is how the dependency was found.
     *
     * If the INSERT statement starts before the DELETE commits, it waits on the
     * advisory lock with a snapshot already taken — under READ COMMITTED an
     * advisory wait does not re-snapshot (only a row lock triggers EvalPlanQual)
     * — so it still counts the row being deleted and REFUSES. If the commit wins
     * the race, the insert takes a fresh snapshot and SUCCEEDS. Both are safe;
     * which one happens depends on scheduling that no test controls.
     *
     * So the assertion is the invariant that holds either way: the cap is never
     * exceeded, and the reported outcome always agrees with the resulting row
     * count. The user-visible cost of the refusing branch is one spurious
     * "maximum" and a retry; the sequential delete-then-insert the app actually
     * performs is unaffected. Removing that false negative would take
     * SERIALIZABLE or a per-user counter row held FOR UPDATE, both of which cost
     * more machinery than a rare, safe retry.
     */
    for (let n = 1; n <= CAP; n += 1) await insertSource(db, userA, urlFor(n))
    const deleter = await connectScratch()
    const inserter = await connectScratch()
    try {
      await deleter.query('begin')
      await inserter.query('begin')
      await deleter.query(`delete from public.calendar_sources where user_id = $1 and url = $2`, [
        userA,
        urlFor(1),
      ])
      const raced = insertSourceOn(inserter, userA, urlFor(901))
      await deleter.query('commit')
      const result = await raced
      await inserter.query('commit').catch(() => {})

      const rows = await count(userA)
      expect(rows, 'the cap is never exceeded either way').toBeLessThanOrEqual(CAP)
      // 9 rows remain after the delete; the insert either took the freed slot or did not.
      expect(rows).toBe(result.ok ? CAP : CAP - 1)
      if (!result.ok) expect(result.code).toBe('23514')
    } finally {
      await deleter.end()
      await inserter.end()
    }
  })

  it('holds the cap inside ONE transaction inserting many rows sequentially', async () => {
    // The advisory lock is re-entrant for the same session, so this must not
    // self-deadlock, and each insert must see the ones before it.
    const one = await connectScratch()
    try {
      await one.query('begin')
      const results: string[] = []
      for (let n = 1; n <= CAP + 1; n += 1) {
        const r = await insertSourceOn(one, userA, urlFor(n))
        results.push(r.ok ? 'ok' : r.code)
        if (!r.ok) break
      }
      await one.query('rollback')
      expect(results.filter((r) => r === 'ok')).toHaveLength(CAP)
      expect(results.at(-1)).toBe('23514')
    } finally {
      await one.end()
    }
  })

  it('releases the advisory lock on ROLLBACK, leaving none held', async () => {
    const one = await connectScratch()
    try {
      await one.query('begin')
      await insertSourceOn(one, userA, urlFor(1))
      await one.query('rollback')
    } finally {
      await one.end()
    }
    const { rows } = await db.query<{ n: number }>(
      `select count(*)::int as n from pg_locks where locktype = 'advisory'`,
    )
    expect(rows[0].n).toBe(0)
  })

  it('still enforces the pre-existing length cap on the url', async () => {
    // calendar_url_is_safe says nothing about length ON PURPOSE — that is
    // `calendar_sources_len`, which predates this migration. Asserted here so
    // the split is visible rather than assumed.
    const tooLong = `https://cal.example.com/${'a'.repeat(2100)}.ics`
    const attempt = await insertSource(db, userA, tooLong)
    expect(attempt.ok).toBe(false)
    if (!attempt.ok) expect(attempt.code).toBe('23514')
  })
})

async function count(userId: string): Promise<number> {
  const { rows } = await db.query<{ n: string }>(
    `select count(*)::int as n from public.calendar_sources where user_id = $1`,
    [userId],
  )
  return Number(rows[0].n)
}

async function insertSourceOn(client: pg.Client, userId: string, url: string): Promise<Attempt> {
  try {
    await client.query(
      `insert into public.calendar_sources (user_id, kind, label, url)
       values ($1, 'url', 'Cal', $2)`,
      [userId, url],
    )
    return { ok: true }
  } catch (err) {
    const e = err as { code?: string; message?: string }
    return { ok: false, code: e.code ?? '?', message: e.message ?? 'unknown' }
  }
}

// ───────────────────────────────────────────────────────────────────────────
describe('nothing existing was broken', () => {
  it('still refuses a row owned by somebody else at the FK level', async () => {
    const attempt = await insertSource(db, '00000000-0000-4000-8000-0000000000ff', urlFor(1))
    expect(attempt.ok).toBe(false)
  })

  it('the scratch database really is the disposable one', () => {
    expect(DATABASE_URL).toMatch(/localhost|127\.0\.0\.1/)
  })
})
