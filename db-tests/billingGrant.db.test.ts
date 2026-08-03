import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type pg from 'pg'
import {
  TABLE_PRIVILEGES,
  connect,
  createScratchDatabase,
  dropScratchDatabase,
  heldPrivileges,
  tableGrants,
  type TablePrivilege,
} from './helpers.js'

/**
 * WHERE DOES THE PRIVILEGE COME FROM? — the staged regression proof.
 *
 * The rest of the suite runs against a database with the WHOLE chain applied,
 * so it can show that service_role ends up able to read public.billing. It
 * cannot show WHY. "The migration grants it" and "the bootstrap happened to
 * grant it" produce identical catalogs, and telling them apart is the entire
 * point: the previous shim granted service_role ALL on every table in public,
 * so the raw-PostgreSQL suite reported a working money path while the real
 * local Supabase stack answered
 *
 *     42501 permission denied for table billing
 *
 * This file applies the chain to a THROWAWAY database only as far as
 * 20260801150000, checks that the privilege is genuinely absent, applies
 * 20260801160000_billing_service_role_access.sql alone, and checks it appears.
 * If someone re-adds a blanket grant to the shim, the "before" assertions go
 * red — which is exactly the regression that shipped last time.
 *
 * It deliberately does NOT match on migration text. A file can contain the word
 * GRANT and install nothing.
 */

const SCRATCH_DB = 'todonado_billing_grant_probe'
const LAST_MIGRATION_BEFORE_THE_GRANT = '20260801150000'
const THE_GRANT_MIGRATION = '20260801160000'

interface Applier {
  applyChain: (client: pg.Client, opts: { through?: string }) => Promise<string[]>
  applyOne: (client: pg.Client, prefix: string) => Promise<string>
}

type Attempt = { ok: true } | { ok: false; code: string; message: string }

/** Run a statement as a role and report the outcome instead of throwing. */
async function attemptAs(c: pg.Client, role: string, sql: string): Promise<Attempt> {
  await c.query(`set role ${role}`)
  try {
    await c.query(sql)
    return { ok: true }
  } catch (err) {
    const e = err as { code?: string; message?: string }
    return { ok: false, code: e.code ?? '?', message: e.message ?? 'unknown' }
  } finally {
    await c.query('reset role')
  }
}

interface Snapshot {
  held: Record<string, TablePrivilege[]>
  select: Attempt
}

let admin: pg.Client
let scratch: pg.Client
let before: Snapshot
let after: Snapshot
let afterWrites: Record<'insert' | 'update' | 'delete', Attempt>
let grantsAfter: { grantee: string; privilege: string }[]
let appliedThrough: string[] = []

const snapshot = async (c: pg.Client): Promise<Snapshot> => ({
  held: {
    public: await heldPrivileges(c, 'public', 'public.billing'),
    anon: await heldPrivileges(c, 'anon', 'public.billing'),
    authenticated: await heldPrivileges(c, 'authenticated', 'public.billing'),
    service_role: await heldPrivileges(c, 'service_role', 'public.billing'),
  },
  // EXECUTED, not merely catalogued: this is the statement the local Supabase
  // stack refused, run as the role that will run it in production.
  select: await attemptAs(
    c,
    'service_role',
    'select plan, stripe_customer_id, stripe_subscription_id, subscription_status from public.billing',
  ),
})

beforeAll(async () => {
  admin = await connect()
  scratch = await createScratchDatabase(admin, SCRATCH_DB)

  const applier = (await import('../supabase/test/apply.mjs')) as unknown as Applier

  appliedThrough = await applier.applyChain(scratch, {
    through: LAST_MIGRATION_BEFORE_THE_GRANT,
  })
  before = await snapshot(scratch)

  await applier.applyOne(scratch, THE_GRANT_MIGRATION)
  after = await snapshot(scratch)
  grantsAfter = await tableGrants(scratch, 'public.billing')

  afterWrites = {
    insert: await attemptAs(
      scratch,
      'service_role',
      `insert into public.billing (user_id, plan) values ('00000000-0000-4000-8000-00000000dead', 'pro')`,
    ),
    update: await attemptAs(scratch, 'service_role', `update public.billing set plan = 'pro'`),
    delete: await attemptAs(scratch, 'service_role', 'delete from public.billing'),
  }
}, 120_000)

afterAll(async () => {
  await scratch?.end()
  if (admin) await dropScratchDatabase(admin, SCRATCH_DB)
  await admin?.end()
})

describe('the staged apply itself', () => {
  it('stopped at the migration before the grant, and that file is not in it', () => {
    expect(appliedThrough.at(-1)).toMatch(new RegExp(`^${LAST_MIGRATION_BEFORE_THE_GRANT}`))
    expect(appliedThrough.some((f) => f.startsWith(THE_GRANT_MIGRATION))).toBe(false)
  })
})

describe('BEFORE 20260801160000 — the defect, reproduced', () => {
  it('service_role holds NO privilege at all on public.billing', () => {
    // If this ever passes with SELECT present, something outside the migrations
    // is granting it again — which is precisely the bug this file guards.
    expect(before.held.service_role).toEqual([])
  })

  it('the exact server-side read is refused, with 42501', () => {
    expect(before.select.ok, 'the read must fail before the grant exists').toBe(false)
    if (before.select.ok) return
    expect(before.select.code).toBe('42501')
    expect(before.select.message).toMatch(/permission denied for table billing/i)
  })

  it('authenticated cannot read it either — usePlan would be dead too', () => {
    expect(before.held.authenticated).toEqual([])
  })
})

describe('AFTER 20260801160000 — the contract it installs', () => {
  it('service_role holds EXACTLY SELECT — the read works', () => {
    expect(after.held.service_role).toEqual(['SELECT'])
  })

  it('the exact server-side read now succeeds', () => {
    expect(
      after.select.ok,
      after.select.ok ? '' : `${after.select.code} ${after.select.message}`,
    ).toBe(true)
  })

  it.each(TABLE_PRIVILEGES.filter((p) => p !== 'SELECT'))(
    'service_role still does NOT hold %s',
    (privilege) => {
      expect(after.held.service_role).not.toContain(privilege)
    },
  )

  it.each(['insert', 'update', 'delete'] as const)(
    'an executed direct %s by service_role is refused',
    (op) => {
      const outcome = afterWrites[op]
      expect(outcome.ok, `a direct ${op} must not be possible`).toBe(false)
      if (outcome.ok) return
      expect(outcome.code).toBe('42501')
    },
  )

  it('authenticated holds EXACTLY SELECT — the browser self-read survives', () => {
    // usePlan() and the settings data export both read the signed-in user's own
    // row. Narrowing this to nothing would have been a silent product break.
    expect(after.held.authenticated).toEqual(['SELECT'])
  })

  it('anon holds nothing', () => {
    expect(after.held.anon).toEqual([])
  })

  it('PUBLIC holds nothing', () => {
    expect(after.held.public).toEqual([])
  })

  it('the installed ACL contains those two grants and NOTHING else', () => {
    // The matrix above asks about roles someone thought to list. This asks the
    // catalog what is actually there, so a grant to an unlisted role shows up.
    expect(grantsAfter).toEqual([
      { grantee: 'authenticated', privilege: 'SELECT' },
      { grantee: 'service_role', privilege: 'SELECT' },
    ])
  })
})
