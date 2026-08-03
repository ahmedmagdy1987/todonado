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

/** DDL is slower than a contention test and is not what deadlocks. */
export const SCHEMA_STATEMENT_TIMEOUT_MS = 60_000

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

/* ─────────────────────── SQL PRIVILEGES, READ FROM THE CATALOG ─────────────
 *
 * `has_table_privilege` answers the question RLS cannot: may this role address
 * the table AT ALL. The two are different controls and the money path was
 * broken by confusing them — service_role is BYPASSRLS, which decides which
 * ROWS come back, and says nothing about whether the SELECT is allowed to run.
 * See supabase/migrations/20260801160000_billing_service_role_access.sql.
 */

/** Every table privilege PostgreSQL can grant, so the matrix has no blind spot. */
export const TABLE_PRIVILEGES = [
  'SELECT',
  'INSERT',
  'UPDATE',
  'DELETE',
  'TRUNCATE',
  'REFERENCES',
  'TRIGGER',
] as const
export type TablePrivilege = (typeof TABLE_PRIVILEGES)[number]

/** PUBLIC is a role name to has_table_privilege, and the one an audit forgets. */
export const DATA_API_ROLES = ['public', 'anon', 'authenticated', 'service_role'] as const

export async function hasTablePrivilege(
  c: pg.Client,
  role: string,
  table: string,
  privilege: TablePrivilege,
): Promise<boolean> {
  const { rows } = await c.query('select has_table_privilege($1,$2,$3) as ok', [
    role,
    table,
    privilege,
  ])
  return rows[0].ok as boolean
}

/** The privileges a role actually holds on a table, in TABLE_PRIVILEGES order. */
export async function heldPrivileges(
  c: pg.Client,
  role: string,
  table: string,
): Promise<TablePrivilege[]> {
  const held: TablePrivilege[] = []
  for (const p of TABLE_PRIVILEGES) {
    if (await hasTablePrivilege(c, role, table, p)) held.push(p)
  }
  return held
}

/**
 * Every (grantee, privilege) pair installed on a table, from `relacl` itself.
 *
 * The matrix above asks about roles we thought of. This asks the catalog what
 * is actually there, so a grant to a role nobody listed still shows up. The
 * table owner's own implicit entry is dropped: it is not a grant anyone made.
 */
export async function tableGrants(
  c: pg.Client,
  table: string,
): Promise<{ grantee: string; privilege: string }[]> {
  const { rows } = await c.query(
    `select a.grantee::regrole::text as grantee, a.privilege_type as privilege
       from pg_class cls
       cross join lateral aclexplode(coalesce(cls.relacl, acldefault('r', cls.relowner))) a
      where cls.oid = $1::regclass
        and a.grantee <> cls.relowner
      order by 1, 2`,
    [table],
  )
  return rows.map((r) => ({
    // grantee 0 is PUBLIC, which regrole renders as '-'.
    grantee: r.grantee === '-' ? 'PUBLIC' : (r.grantee as string),
    privilege: r.privilege as string,
  }))
}

/* ─────────────────────────── A THROWAWAY DATABASE ──────────────────────────
 *
 * The staged proof in billingGrant.db.test.ts has to apply the chain WITHOUT
 * the newest migration, which the shared test database has already had applied.
 * It gets its own database rather than trying to un-apply anything.
 */
export function databaseUrlFor(name: string): string {
  const u = new URL(DATABASE_URL)
  u.pathname = `/${name}`
  return u.toString()
}

export async function createScratchDatabase(admin: pg.Client, name: string): Promise<pg.Client> {
  await dropScratchDatabase(admin, name)
  // Not parameterisable — an identifier, and CREATE DATABASE cannot run inside
  // a transaction. `name` is a literal in the test, never external input.
  await admin.query(`create database "${name}"`)
  const c = new pg.Client({ connectionString: databaseUrlFor(name) })
  await c.connect()
  /*
   * Deliberately NOT the 5s the contention tests use. This connection applies
   * the whole migration chain, and a CREATE INDEX on a cold database is not a
   * deadlock. Still bounded, so a genuine hang fails CI rather than occupying
   * it for the full job timeout.
   */
  await c.query(`set statement_timeout = ${SCHEMA_STATEMENT_TIMEOUT_MS}`)
  return c
}

export async function dropScratchDatabase(admin: pg.Client, name: string): Promise<void> {
  await admin.query(
    `select pg_terminate_backend(pid) from pg_stat_activity where datname = $1 and pid <> pg_backend_pid()`,
    [name],
  )
  await admin.query(`drop database if exists "${name}"`)
}

export const iso = (unixSeconds: number) => new Date(unixSeconds * 1000).toISOString()

/** Deterministic timestamps for ordering assertions. */
export const T = {
  t0: 1_800_000_000,
  t1: 1_800_000_100,
  t2: 1_800_000_200,
  t3: 1_800_000_300,
} as const
