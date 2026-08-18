import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import type pg from 'pg'
import { connect, makeUser, SCHEMA_STATEMENT_TIMEOUT_MS } from './helpers'

/**
 * THE VOICE-NOTE STORAGE POLICY, EXECUTED.
 *
 * ── WHAT THIS PROVES, AND WHAT IT CANNOT ──────────────────────────────────
 *
 * PROVES: that dropping `journal_audio_insert_own` makes a direct authenticated
 * INSERT into the bucket impossible, while SELECT, UPDATE and DELETE on an
 * EXISTING object keep working. That is the exact security claim the proposed
 * migration makes, and it is the half that decides whether a Free session can
 * still store audio by talking to the database itself.
 *
 * CANNOT PROVE: that Supabase's signed-upload path still works afterwards. That
 * path is served by the Storage API, not by Postgres, and the test shim
 * (supabase/test/00_supabase_shim.sql) reproduces only the TABLE. Validating it
 * needs a real Supabase stack, which needs Docker, which this machine does not
 * have. That gap is stated in the migration's own header rather than papered
 * over, and it is why the client is not rewired yet.
 *
 * ── ONE DELIBERATE DEVIATION FROM THE SHIM ────────────────────────────────
 *
 * The shim creates `storage.objects` with RLS DISABLED, so its four policies
 * exist but never run. Real Supabase has RLS enabled. This file enables it for
 * the duration, because a policy test against a table where policies are inert
 * would pass no matter what the policies said.
 */

const PROPOSAL = fileURLToPath(
  new URL('../docs/proposals/20260818130000_journal_audio_pro_only.sql', import.meta.url),
)

const BUCKET = 'journal-audio'
let db: pg.Client

/** Insert an object as a genuine authenticated session for `uid`. */
async function insertAs(uid: string, name: string) {
  const c = await connect()
  try {
    await c.query(`set request.jwt.claim.sub = '${uid}'`)
    await c.query('set role authenticated')
    await c.query(
      `insert into storage.objects (bucket_id, name, owner) values ($1, $2, $3)`,
      [BUCKET, name, uid],
    )
    return { ok: true as const }
  } catch (e) {
    return { ok: false as const, message: String(e) }
  } finally {
    await c.end()
  }
}

beforeAll(async () => {
  db = await connect()
  await db.query(`set statement_timeout = ${SCHEMA_STATEMENT_TIMEOUT_MS}`)
  // Real Supabase has RLS on; the shim does not. Without this the policies are
  // inert and every assertion below would pass vacuously.
  await db.query('alter table storage.objects enable row level security')
  await db.query('grant insert, select, update, delete on storage.objects to authenticated')
}, 60_000)

afterAll(async () => {
  await db?.query('alter table storage.objects disable row level security').catch(() => {})
  await db?.end()
})

beforeEach(async () => {
  await db.query(`delete from storage.objects where bucket_id = $1`, [BUCKET])
  await db.query(`delete from auth.users where email like '%@dbtest.local'`)
})

describe('before the migration: the direct path is open', () => {
  it('any authenticated owner can create an object in their own folder', async () => {
    // This is the bypass. Nothing here asks about a plan, because the policy
    // authorises on ownership and ownership only.
    const uid = await makeUser(db, 'direct@dbtest.local')
    expect((await insertAs(uid, `${uid}/2026-08-18-abc.webm`)).ok).toBe(true)
  })

  it('but still cannot write into someone ELSE folder', async () => {
    // The ownership half is correct and must survive the change untouched.
    const me = await makeUser(db, 'me@dbtest.local')
    const them = await makeUser(db, 'them@dbtest.local')
    const r = await insertAs(me, `${them}/2026-08-18-abc.webm`)
    expect(r.ok).toBe(false)
    expect(r.message).toMatch(/row-level security/i)
  })
})

describe('after the migration: only a server-issued upload can create audio', () => {
  let uid: string
  let existing: string

  beforeEach(async () => {
    uid = await makeUser(db, 'after@dbtest.local')
    existing = `${uid}/2026-08-01-old.webm`

    // A recording made BEFORE the change, exactly like a Free user who used the
    // feature while the upload was ungated.
    await db.query(`insert into storage.objects (bucket_id, name, owner) values ($1,$2,$3)`, [
      BUCKET,
      existing,
      uid,
    ])

    await db.query(readFileSync(PROPOSAL, 'utf8'))
  })

  afterAll(async () => {
    // Restore the policy so this file leaves the database as it found it.
    await db
      .query(
        `create policy journal_audio_insert_own on storage.objects for insert to authenticated
         with check (bucket_id = 'journal-audio'
                     and (storage.foldername(name))[1] = auth.uid()::text)`,
      )
      .catch(() => {})
  })

  it('BLOCKS a direct authenticated upload — the bypass is closed', async () => {
    const r = await insertAs(uid, `${uid}/2026-08-18-new.webm`)
    expect(r.ok).toBe(false)
    expect(r.message).toMatch(/row-level security/i)
  })

  it('leaves the existing recording READABLE', async () => {
    const c = await connect()
    try {
      await c.query(`set request.jwt.claim.sub = '${uid}'`)
      await c.query('set role authenticated')
      const { rows } = await c.query(`select name from storage.objects where name = $1`, [existing])
      expect(rows).toHaveLength(1)
    } finally {
      await c.end()
    }
  })

  it('leaves the existing recording DELETABLE', async () => {
    /*
     * The requirement that matters most for a Free user who already recorded
     * something. Leaving somebody unable to remove their own audio would be
     * worse than leaving them unable to create more.
     */
    const c = await connect()
    try {
      await c.query(`set request.jwt.claim.sub = '${uid}'`)
      await c.query('set role authenticated')
      const { rowCount } = await c.query(`delete from storage.objects where name = $1`, [existing])
      expect(rowCount).toBe(1)
    } finally {
      await c.end()
    }
  })

  it('DELETES NOTHING of its own accord', async () => {
    // The migration is one DROP POLICY. It must not touch a single object.
    const { rows } = await db.query(
      `select count(*)::int as n from storage.objects where bucket_id = $1`,
      [BUCKET],
    )
    expect(rows[0].n).toBe(1)
  })

  it('keeps select, update and delete policies intact', async () => {
    const { rows } = await db.query(
      `select polname from pg_policy p
         join pg_class c on c.oid = p.polrelid
         join pg_namespace n on n.oid = c.relnamespace
        where n.nspname='storage' and c.relname='objects' and polname like 'journal_audio%'
        order by polname`,
    )
    expect(rows.map((r) => r.polname)).toEqual([
      'journal_audio_delete_own',
      'journal_audio_select_own',
      'journal_audio_update_own',
    ])
  })
})
