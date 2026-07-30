import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath, URL } from 'node:url'
import { MAX_VISION_TITLE, MAX_VISION_WHY } from './vision'

/**
 * Pins the client caps to the DB CHECKs (the `personalCaps.test.ts` technique)
 * and pins the parts of the schema that are security-relevant rather than
 * cosmetic — owner-only RLS, no anon grant, and the guard that stops a
 * user-scoped row pointing at a workspace-scoped project the caller cannot read.
 *
 * NOTE: this migration is committed but NOT YET APPLIED (CLAUDE.md §7). The test
 * reads the FILE, so it is meaningful before the push.
 */

const MIGRATION = '20260730140000_vision_cards.sql'

const sql = readFileSync(
  fileURLToPath(new URL(`../../../supabase/migrations/${MIGRATION}`, import.meta.url)),
  'utf8',
)

function sqlNumber(pattern: RegExp): number {
  const match = pattern.exec(sql)
  expect(match, `migration is missing: ${pattern}`).not.toBeNull()
  return Number(match![1])
}

describe('client caps match the database CHECK constraints', () => {
  it('title-length cap agrees', () => {
    expect(sqlNumber(/char_length\(btrim\(title\)\)\s*between\s*1\s*and\s*(\d+)/)).toBe(
      MAX_VISION_TITLE,
    )
  })

  it('why-length cap agrees', () => {
    expect(sqlNumber(/char_length\(why\)\s*<=\s*(\d+)/)).toBe(MAX_VISION_WHY)
  })
})

describe('the migration keeps vision cards private', () => {
  it('gives the table the full owner-only policy set', () => {
    for (const action of ['select', 'insert', 'update', 'delete']) {
      expect(sql, `missing ${action} policy`).toContain(`vision_cards_${action}_own`)
    }
  })

  it('enables RLS and grants anon nothing', () => {
    expect(sql).toMatch(/alter table public\.vision_cards enable row level security/i)
    expect(sql).toContain('user_id = auth.uid()')
    expect(sql).not.toMatch(/to\s+anon/i)
  })

  it('cascades on user delete, so account deletion stays complete', () => {
    expect(sql).toMatch(/user_id\s+uuid not null references auth\.users \(id\) on delete cascade/)
  })
})

describe('the project link is guarded, not merely nullable', () => {
  it('requires can_access_project on BOTH write paths', () => {
    // vision_cards is user-scoped while projects are workspace-scoped, so
    // owner-only RLS alone would let a hostile client store a project_id it
    // cannot read. Both write policies must call the SECURITY DEFINER helper.
    const guards = sql.match(/project_id is null or public\.can_access_project\(project_id\)/g) ?? []
    expect(guards.length, 'insert AND update must both guard the link').toBe(2)
  })

  it('UNLINKS rather than deleting the goal when a project goes away', () => {
    // `on delete cascade` here would destroy someone's goal because a project
    // was archived. That would be indefensible; the link is what goes.
    expect(sql).toMatch(/project_id\s+uuid references public\.projects \(id\) on delete set null/)
    expect(sql).not.toMatch(/references public\.projects \(id\) on delete cascade/)
  })
})

describe('the schema supports the app it was written for', () => {
  it('stores position as double precision, so a drag is ONE row update', () => {
    // An integer column would force a reindex or a batch write on every drag.
    expect(sql).toMatch(/position\s+double precision not null default 0/)
  })

  it('keeps the shared updated_at trigger', () => {
    expect(sql).toMatch(/create trigger set_updated_at before update on public\.vision_cards/)
    expect(sql).toContain('public.set_updated_at()')
  })

  it('indexes by owner and by project', () => {
    expect(sql).toContain('vision_cards_user_id_idx')
    expect(sql).toContain('vision_cards_project_id_idx')
  })

  it('leaves the target date genuinely optional', () => {
    expect(sql).toMatch(/target_date date\b/)
    expect(sql).not.toMatch(/target_date date not null/)
  })

  it('ships NO image column — the fake door decides that, not this table', () => {
    // Comments stripped first: the header explains at length WHY there are no
    // images, so asserting against the raw file would match its own rationale.
    const ddl = sql.replace(/--[^\n]*/g, '')
    expect(ddl).not.toMatch(/image|photo|storage|bucket|attachment/i)
  })

  it('is re-runnable', () => {
    expect(sql).toContain('create table if not exists public.vision_cards')
    expect(sql).toMatch(/do \$\$/)
    const policies = sql.match(/create policy/g) ?? []
    const drops = sql.match(/drop policy if exists/g) ?? []
    expect(drops.length).toBe(policies.length)
  })
})
