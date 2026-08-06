import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath, URL } from 'node:url'
import {
  ALLOWED_SERVICE_HOSTS,
  DatabaseTargetError,
  assertDisposableDatabaseUrl,
  redactDatabaseUrl,
} from '../../scripts/databaseTarget.js'

/**
 * THE DATABASE SUITE MAY ONLY EVER POINT AT A DISPOSABLE POSTGRES.
 *
 * `db-tests/helpers.ts` used to hand `process.env.DATABASE_URL` straight to
 * `pg.Client` with no check at all, and `resetBillingState` runs
 *
 *     delete from public.checkout_attempts
 *     delete from public.billing
 *
 * with no WHERE clause. A developer with a production connection string
 * exported in their shell who ran the documented `npm run test:db` would have
 * deleted live billing irrecoverably: there is no client write path to that
 * table, so every paying customer silently becomes Free.
 *
 * Sibling of noProductionSupabaseInTests.test.ts, which pins the same promise
 * for the Supabase-facing suites. This one guards the only suite that issues
 * unqualified DELETEs, which is precisely the one that had no guard.
 */

const HOSTED = 'postgres://u:p@db.abcdefgh.supabase.co:5432/postgres'

describe('the guard accepts a clearly local, disposable target', () => {
  it('accepts localhost', () => {
    const url = 'postgres://postgres:postgres@localhost:5432/postgres'
    expect(assertDisposableDatabaseUrl(url)).toBe(url)
  })

  it('accepts 127.0.0.1', () => {
    const url = 'postgres://postgres:postgres@127.0.0.1:5432/postgres'
    expect(assertDisposableDatabaseUrl(url)).toBe(url)
  })

  it('accepts the whole 127.0.0.0/8 loopback block, not just .1', () => {
    expect(() =>
      assertDisposableDatabaseUrl('postgres://postgres@127.0.0.2:5432/postgres'),
    ).not.toThrow()
  })

  it('accepts ::1, bracketed as a URL requires', () => {
    const url = 'postgres://postgres:postgres@[::1]:5432/postgres'
    expect(assertDisposableDatabaseUrl(url)).toBe(url)
  })

  it('accepts the documented container service names', () => {
    // CI and the documented local recipe both run Postgres in a container,
    // where the host is a link name rather than an address.
    for (const host of ALLOWED_SERVICE_HOSTS) {
      expect(() =>
        assertDisposableDatabaseUrl(`postgres://postgres:postgres@${host}:5432/postgres`),
      ).not.toThrow()
    }
  })

  it('accepts the postgresql: scheme as well as postgres:', () => {
    expect(() =>
      assertDisposableDatabaseUrl('postgresql://postgres@localhost:5432/postgres'),
    ).not.toThrow()
  })
})

describe('the guard refuses everything else', () => {
  it('refuses a hosted Supabase host, with the wording CI greps for', () => {
    /*
     * The workflow's negative control asserts apply.mjs REFUSES rather than
     * merely failing to connect (db.abcdefgh.supabase.co does not resolve, so
     * exit code alone proves nothing). It greps for this exact sentence.
     */
    expect(() => assertDisposableDatabaseUrl(HOSTED)).toThrow(DatabaseTargetError)
    expect(() => assertDisposableDatabaseUrl(HOSTED)).toThrow(
      /REFUSING to run against a supabase\.co host/,
    )
  })

  it('refuses a Supabase pooler host', () => {
    expect(() =>
      assertDisposableDatabaseUrl(
        'postgres://postgres.abcdefgh:pw@aws-0-eu-central-1.pooler.supabase.com:6543/postgres',
      ),
    ).toThrow(DatabaseTargetError)
  })

  it('refuses another public hostname that has nothing to do with Supabase', () => {
    // THE POINT OF AN ALLOW-LIST. The previous guard was `/supabase\.co/`,
    // which happily accepted every one of these.
    for (const host of [
      'mydb.abcdefgh.eu-west-1.rds.amazonaws.com',
      'ep-cool-name-123456.eu-central-1.aws.neon.tech',
      'db.internal.example.com',
      'staging-db.company.io',
    ]) {
      expect(() =>
        assertDisposableDatabaseUrl(`postgres://u:p@${host}:5432/postgres`),
        `${host} must be refused`,
      ).toThrow(DatabaseTargetError)
    }
  })

  it('refuses a public IP address', () => {
    for (const ip of ['203.0.113.10', '8.8.8.8', '198.51.100.7']) {
      expect(() =>
        assertDisposableDatabaseUrl(`postgres://u:p@${ip}:5432/postgres`),
        `${ip} must be refused`,
      ).toThrow(/not a loopback address/)
    }
  })

  it('refuses a PRIVATE, non-loopback IP too', () => {
    // "Somewhere on my LAN" is not a disposable database, and a shared staging
    // box is exactly the sort of thing that would get wiped.
    for (const ip of ['10.0.0.5', '192.168.1.20', '172.16.4.9']) {
      expect(() =>
        assertDisposableDatabaseUrl(`postgres://u:p@${ip}:5432/postgres`),
        `${ip} must be refused`,
      ).toThrow(DatabaseTargetError)
    }
  })

  it('refuses a missing, empty or whitespace DATABASE_URL', () => {
    for (const value of [undefined, null, '', '   ']) {
      expect(() => assertDisposableDatabaseUrl(value), `${JSON.stringify(value)}`).toThrow(
        /is not set/,
      )
    }
  })

  it('refuses a malformed URL', () => {
    for (const value of ['not-a-url', 'postgres://', '://missing-scheme']) {
      expect(() => assertDisposableDatabaseUrl(value), value).toThrow(DatabaseTargetError)
    }
  })

  it('refuses a non-postgres protocol', () => {
    expect(() => assertDisposableDatabaseUrl('https://localhost:5432/postgres')).toThrow(
      /expected postgres:/,
    )
  })

  it('is not fooled by a hostname that merely CONTAINS an allowed name', () => {
    // `localhost.evil.com` and `postgres.example.com` both resolve publicly.
    for (const host of ['localhost.evil.com', 'postgres.example.com', 'notlocalhost']) {
      expect(() =>
        assertDisposableDatabaseUrl(`postgres://u:p@${host}:5432/postgres`),
        `${host} must be refused`,
      ).toThrow(DatabaseTargetError)
    }
  })

  it('never echoes the password when it names the host it refused', () => {
    // The connection string carries a credential; an error message is a log line.
    const secret = 'sup3r-s3cret-pw'
    let message = ''
    try {
      assertDisposableDatabaseUrl(`postgres://admin:${secret}@db.example.com:5432/postgres`)
    } catch (err) {
      message = (err as Error).message
    }
    expect(message).toContain('db.example.com')
    expect(message).not.toContain(secret)
    expect(redactDatabaseUrl(`postgres://admin:${secret}@db.example.com:5432/postgres`)).toBe(
      'db.example.com:5432',
    )
  })
})

describe('the two hosted-host scanners cannot drift apart', () => {
  /*
   * There are TWO scanners enforcing "no test source names a hosted Supabase
   * host": the vitest one in noProductionSupabaseInTests.test.ts and the CI
   * one in scripts/assert-local-supabase.mjs. Each keeps its own EXEMPT list.
   *
   * Adding scripts/databaseTarget.js to only the first is exactly what
   * happened while writing this change, and it passed locally and then failed
   * two CI jobs. One list falling behind the other is a silent trap, so the
   * lists are pinned to each other here.
   */
  const readList = (rel: string) => {
    const source = readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')
    const at = source.indexOf('const EXEMPT')
    expect(at, `EXEMPT not found in ${rel}`).toBeGreaterThan(-1)
    const block = source.slice(at, source.indexOf('])', at))
    return [...block.matchAll(/'([^']+)'/g)].map((m) => m[1]).sort()
  }

  it('both EXEMPT lists hold exactly the same files', () => {
    const fromTest = readList('./noProductionSupabaseInTests.test.ts')
    const fromScript = readList('../../scripts/assert-local-supabase.mjs')
    expect(fromScript).toEqual(fromTest)
    expect(fromTest).toContain('scripts/databaseTarget.js')
  })
})

/* ───────────────── THE GUARD FIRES BEFORE ANY SOCKET IS OPENED ─────────────
 *
 * The assertions above prove the RULE. These prove the WIRING, which is the
 * part that actually protects the database: a correct rule called too late, or
 * not called at all, protects nothing.
 */

const connectSpy = vi.fn()
const querySpy = vi.fn()
const constructSpy = vi.fn()

vi.mock('pg', () => {
  class Client {
    constructor(config: unknown) {
      constructSpy(config)
    }
    connect = connectSpy
    query = querySpy
    end = vi.fn()
  }
  return { default: { Client } }
})

/** Load db-tests/helpers.ts fresh, since it reads DATABASE_URL at module scope. */
async function loadHelpers(databaseUrl: string | undefined) {
  vi.resetModules()
  if (databaseUrl === undefined) delete process.env.DATABASE_URL
  else process.env.DATABASE_URL = databaseUrl
  return import('../../db-tests/helpers')
}

describe('db-tests/helpers refuses before it connects', () => {
  const original = process.env.DATABASE_URL

  beforeEach(() => {
    connectSpy.mockReset()
    querySpy.mockReset()
    constructSpy.mockReset()
  })

  afterEach(() => {
    if (original === undefined) delete process.env.DATABASE_URL
    else process.env.DATABASE_URL = original
  })

  it('connect() throws on a hosted target and NEVER constructs a client', async () => {
    const { connect } = await loadHelpers(HOSTED)
    await expect(connect()).rejects.toThrow(/REFUSING to run against a supabase\.co host/)
    expect(constructSpy, 'no pg.Client may be constructed').not.toHaveBeenCalled()
    expect(connectSpy, 'no socket may be opened').not.toHaveBeenCalled()
  })

  it('connect() throws when DATABASE_URL is unset, and never constructs a client', async () => {
    const { connect } = await loadHelpers(undefined)
    await expect(connect()).rejects.toThrow(/is not set/)
    expect(constructSpy).not.toHaveBeenCalled()
    expect(connectSpy).not.toHaveBeenCalled()
  })

  it('connect() proceeds normally for a local target', async () => {
    const { connect } = await loadHelpers('postgres://postgres:postgres@localhost:5432/postgres')
    await connect()
    expect(constructSpy).toHaveBeenCalledOnce()
    expect(connectSpy).toHaveBeenCalledOnce()
  })

  it('resetBillingState REFUSES to issue a single DELETE against a hosted target', async () => {
    /*
     * The whole point. Even handed a live client, the delete must not run.
     * `connect()` is not the only way a client can reach this function.
     */
    const { resetBillingState } = await loadHelpers(HOSTED)
    const client = { query: querySpy } as unknown as Parameters<typeof resetBillingState>[0]

    /*
     * Matched on the MESSAGE, not on `instanceof DatabaseTargetError`.
     * `loadHelpers` calls `vi.resetModules()`, so helpers.ts imports a fresh
     * copy of the guard module and its error class is a different object from
     * the one imported at the top of this file. Asserting class identity there
     * would fail for a reason that has nothing to do with the behaviour.
     */
    await expect(resetBillingState(client)).rejects.toThrow(
      /REFUSING to run against a supabase\.co host/,
    )
    expect(querySpy, 'not one statement may be sent').not.toHaveBeenCalled()
  })

  it('resetBillingState runs its deletes for a local target', async () => {
    const { resetBillingState } = await loadHelpers(
      'postgres://postgres:postgres@localhost:5432/postgres',
    )
    const client = { query: querySpy } as unknown as Parameters<typeof resetBillingState>[0]

    await resetBillingState(client)
    const statements = querySpy.mock.calls.map((c) => String(c[0]))
    expect(statements).toEqual([
      'delete from public.checkout_attempts',
      'delete from public.billing',
      expect.stringContaining('delete from auth.users'),
    ])
  })
})
