import pg from 'pg'

/**
 * Integration tests against a REAL, DISPOSABLE PostgreSQL.
 *
 * Everything here executes SQL. No Supabase mock, no model, no string matching
 * against the migration file. The clause-pinning suites in api/ are still
 * useful as documentation, but they cannot tell you whether a function COMPILES,
 * whether a partial unique index actually serialises two connections, or
 * whether PUBLIC still holds EXECUTE. This can.
 */
export const DATABASE_URL = process.env.DATABASE_URL ?? ''

/** Every query gets a timeout so a deadlock FAILS CI rather than hanging it. */
export const STATEMENT_TIMEOUT_MS = 5_000

export async function connect(role?: string): Promise<pg.Client> {
  const client = new pg.Client({ connectionString: DATABASE_URL })
  await client.connect()
  await client.query(`set statement_timeout = ${STATEMENT_TIMEOUT_MS}`)
  await client.query(`set lock_timeout = ${STATEMENT_TIMEOUT_MS}`)
  if (role) await client.query(`set role ${role}`)
  return client
}

/** Create a user in the shim's auth.users and return its id. */
export async function makeUser(c: pg.Client, email: string): Promise<string> {
  const { rows } = await c.query(
    `insert into auth.users (email, email_confirmed_at) values ($1, now()) returning id`,
    [email],
  )
  return rows[0].id as string
}

export async function resetBillingState(c: pg.Client): Promise<void> {
  await c.query('delete from public.checkout_attempts')
  await c.query('delete from public.billing')
  await c.query(`delete from auth.users where email like '%@dbtest.local'`)
}

export const iso = (unixSeconds: number) => new Date(unixSeconds * 1000).toISOString()

/** Deterministic timestamps for ordering assertions. */
export const T = {
  t0: 1_800_000_000,
  t1: 1_800_000_100,
  t2: 1_800_000_200,
  t3: 1_800_000_300,
} as const
