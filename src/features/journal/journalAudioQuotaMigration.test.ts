import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath, URL } from 'node:url'
import { JOURNAL_AUDIO_QUOTA_BYTES } from './api/useJournal'

/**
 * The SERVER half of the journal-audio quota (audit FLAG-7).
 *
 * `supabase/migrations/20260801130000_journal_audio_quota.sql` is committed and
 * NOT applied. That is the same gap `limits.test.ts` guards, with one extra
 * hazard: this file's number is the ONLY thing standing between a paying
 * account and unbounded storage once it runs, and it is written twice — once in
 * TypeScript for the friendly refusal, once in SQL for the real one. If they
 * drift, the client either refuses uploads the database would have accepted, or
 * (worse) promises headroom the database will reject.
 *
 * Everything below reads the migration TEXT. None of it proves the trigger
 * fires — only applying it and attempting an upload can do that, and section 4
 * of the migration says exactly how. What these assertions do buy is that the
 * file cannot quietly stop meaning what its header claims.
 */

const sql = readFileSync(
  fileURLToPath(
    new URL('../../../supabase/migrations/20260801130000_journal_audio_quota.sql', import.meta.url),
  ),
  'utf8',
)

/** Strip `-- …` comments: the header discusses these numbers in prose. */
const body = sql.replace(/--[^\n]*/g, '')

describe('the quota number is the same on both sides', () => {
  it('the SQL constant equals JOURNAL_AUDIO_QUOTA_BYTES', () => {
    const m = /select\s+(\d+)::bigint/.exec(body)
    expect(m, 'no `select <n>::bigint` constant found').not.toBeNull()
    expect(Number(m![1])).toBe(JOURNAL_AUDIO_QUOTA_BYTES)
  })

  it('keeps the limit in ONE place, so raising it is one line', () => {
    // The trigger must read the function, never inline the literal a second
    // time. Two copies is how a "raise the cap" change half-lands.
    expect(body).toContain('public.journal_audio_quota_bytes()')
    const literals = [...body.matchAll(new RegExp(String(JOURNAL_AUDIO_QUOTA_BYTES), 'g'))]
    expect(literals.length, 'the byte count appears more than once in executable SQL').toBe(1)
  })

  it('refuses strictly ABOVE the limit, matching exceedsQuota', () => {
    // `exceedsQuota` is `used + incoming > quota`, so landing exactly on the
    // limit is allowed. A `>=` here would reject an upload the client had
    // already told the user was fine.
    expect(body).toMatch(/existing \+ incoming > limit_b/)
    expect(body).not.toMatch(/existing \+ incoming >= limit_b/)
  })
})

describe('the trigger closes the path a policy could not', () => {
  it('fires on INSERT and on UPDATE OF metadata', () => {
    // The resumable (TUS) path creates the row before the size is known. An
    // insert-only guard would read a NULL size, treat it as zero, and wave
    // through exactly the upload path an abuser would reach for.
    expect(body).toMatch(/before insert on storage\.objects/)
    expect(body).toMatch(/before update of metadata on storage\.objects/)
  })

  it('is BEFORE, never AFTER', () => {
    // An AFTER trigger that raised would still roll back, but only once the
    // storage backend had already accepted the bytes.
    expect(body).not.toMatch(/\bafter\s+(insert|update)\s+.*on storage\.objects/i)
  })

  it('leaves every other bucket alone', () => {
    expect(body).toMatch(/bucket_id is distinct from 'journal-audio'/)
    expect(body).toMatch(/return new;/)
  })

  it('excludes the row being updated from the existing sum', () => {
    // Without this an UPDATE counts the row twice: once at its old size in the
    // sum, once at its new size as `incoming`. Every resumable upload would
    // then be charged double and fail early.
    expect(body).toMatch(/o\.id is distinct from new\.id/)
  })

  it('sums by name PREFIX, so the existing index can serve it', () => {
    // `storage.foldername(name)[1] = …` reads better and is unindexable: it
    // would sequential-scan every object in the bucket on every upload.
    expect(body).toMatch(/o\.name like folder \|\| '\/%'/)
    expect(body).not.toMatch(/foldername\(o\.name\)/)
  })

  it('scopes the sum to the journal-audio bucket', () => {
    expect(body).toMatch(/o\.bucket_id = 'journal-audio'/)
  })

  it('treats a missing size as zero rather than failing the upload', () => {
    // A NULL size must not raise; the UPDATE trigger is what catches it once
    // the true size lands.
    expect(body).toMatch(/coalesce\(\(new\.metadata ->> 'size'\)::bigint, 0\)/)
  })
})

describe('the counting function is trustworthy', () => {
  it('is SECURITY DEFINER with a pinned search_path', () => {
    // A quota that reads zero because RLS hid the rows is not a quota. Definer
    // rights make the sum authoritative; the pinned path stops the definer
    // context being steered by a caller-set search_path.
    expect(body).toMatch(/security definer/)
    expect(body).toMatch(/set search_path = storage, public, pg_temp/)
  })

  it('stores no counter, so nothing can drift', () => {
    // The sum is computed live. Deleting a recording frees the space with no
    // bookkeeping -- the same discipline as the points score and challenge bars.
    expect(body).not.toMatch(/create table/i)
    expect(body).not.toMatch(/alter table .*add column/i)
  })

  it('adds no readable surface over the recordings', () => {
    // The only new callable is the constant. Anything returning object names or
    // sizes would be a read path over the most private data in the product.
    const functions = [...body.matchAll(/create or replace function ([\w.]+)\(/g)].map((m) => m[1])
    expect(functions.sort()).toEqual([
      'public.enforce_journal_audio_quota',
      'public.journal_audio_quota_bytes',
    ])
  })

  it('grants nothing to anon', () => {
    expect(body).not.toMatch(/\bto anon\b/i)
    expect(body).not.toMatch(/grant .* anon/i)
  })
})
