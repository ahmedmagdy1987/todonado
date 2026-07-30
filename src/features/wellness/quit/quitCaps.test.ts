import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath, URL } from 'node:url'
import { MAX_QUIT_NAME, MAX_QUIT_NOTES, MAX_QUIT_REPLACEMENT } from './caps'
import { QUIT_PRESETS } from './presets'

/**
 * The same discipline as `personalCaps.test.ts`: the field caps exist in TWO
 * places — the client constants in `caps.ts` (which stop typing at the limit)
 * and the CHECK constraints in the migration (the backstop against a hostile or
 * buggy client). If the client were the looser of the two, a user could fill a
 * field and get an opaque Postgres `23514` instead of a `maxLength`.
 *
 * This file also pins the SENSITIVE parts of the schema shut, because this is
 * the one feature in the app where a policy mistake would leak something a user
 * would be mortified to have leaked: owner-only on both tables, no anon grant,
 * no UPDATE on the check-in log, and the UNIQUE that makes a double check-in a
 * no-op instead of a duplicate row.
 *
 * NOTE: the migration is committed but NOT YET APPLIED to the cloud DB (see
 * CLAUDE.md §7). This test reads the FILE, so it is meaningful before the push.
 */

const MIGRATION = '20260730120000_quit_habits.sql'

const sql = readFileSync(
  fileURLToPath(new URL(`../../../../supabase/migrations/${MIGRATION}`, import.meta.url)),
  'utf8',
)

/** First capture group of `pattern` in the migration, as a number. */
function sqlNumber(pattern: RegExp): number {
  const match = pattern.exec(sql)
  expect(match, `migration is missing: ${pattern}`).not.toBeNull()
  return Number(match![1])
}

describe('client caps match the database CHECK constraints', () => {
  it('name-length cap agrees', () => {
    expect(sqlNumber(/char_length\(btrim\(name\)\)\s*between\s*1\s*and\s*(\d+)/)).toBe(MAX_QUIT_NAME)
  })

  it('replacement-action cap agrees', () => {
    expect(sqlNumber(/char_length\(replacement_action\)\s*<=\s*(\d+)/)).toBe(MAX_QUIT_REPLACEMENT)
  })

  it('notes cap agrees', () => {
    expect(sqlNumber(/char_length\(notes\)\s*<=\s*(\d+)/)).toBe(MAX_QUIT_NOTES)
  })

  it('keeps the preset_key cap wide enough for every preset the client can write', () => {
    const cap = sqlNumber(/char_length\(btrim\(preset_key\)\)\s*between\s*1\s*and\s*(\d+)/)
    const longest = Math.max(...QUIT_PRESETS.map((p) => p.key.length))
    expect(longest).toBeGreaterThan(0)
    expect(cap).toBeGreaterThanOrEqual(longest)
  })

  it('keeps the longest-streak sanity bound', () => {
    // Not a client twin — it exists to catch a client bug writing garbage, so
    // this only pins that the backstop is still there and still generous enough
    // for a real human lifetime of clean days.
    expect(sqlNumber(/longest_streak_days\s*between\s*0\s*and\s*(\d+)/)).toBeGreaterThanOrEqual(36500)
  })
})

describe('the migration keeps this sensitive data owner-only', () => {
  it('gives quit_habits the full owner-only policy set', () => {
    for (const action of ['select', 'insert', 'update', 'delete']) {
      expect(sql, `missing quit_habits ${action} policy`).toContain(`quit_habits_${action}_own`)
    }
  })

  it('gives quit_checkins an append-only policy set and NO update', () => {
    for (const action of ['select', 'insert', 'delete']) {
      expect(sql, `missing quit_checkins ${action} policy`).toContain(`quit_checkins_${action}_own`)
    }
    // A check-in is a fact about a day that already happened; undoing one means
    // deleting it. An UPDATE policy would let a row be silently re-dated.
    expect(sql).not.toContain('quit_checkins_update_own')
  })

  it('enables RLS on both tables', () => {
    expect(sql).toMatch(/alter table public\.quit_habits enable row level security/i)
    expect(sql).toMatch(/alter table public\.quit_checkins enable row level security/i)
  })

  it('scopes every policy to the caller and grants anon nothing', () => {
    expect(sql).toContain('user_id = auth.uid()')
    // The fake-door tables deliberately grant `to anon`; this one must not.
    expect(sql).not.toMatch(/to\s+anon/i)
  })

  it('cascades both tables on user delete, so account deletion is complete', () => {
    const cascades = sql.match(/references auth\.users \(id\) on delete cascade/g) ?? []
    expect(cascades.length).toBe(2)
  })

  it('cascades check-ins when their habit is deleted', () => {
    expect(sql).toMatch(
      /habit_id\s+uuid not null references public\.quit_habits \(id\) on delete cascade/,
    )
  })

  it('makes a same-day repeat check-in a no-op, not a duplicate row', () => {
    expect(sql).toMatch(/unique \(habit_id, checked_on\)/)
  })

  it('keeps the shared updated_at trigger on quit_habits', () => {
    expect(sql).toMatch(/create trigger set_updated_at before update on public\.quit_habits/)
    expect(sql).toContain('public.set_updated_at()')
  })

  it('indexes both tables by owner', () => {
    expect(sql).toContain('quit_habits_user_id_idx')
    expect(sql).toContain('quit_checkins_user_id_idx')
  })

  it('is re-runnable', () => {
    // Every DDL statement is guarded, so a second `db push` is a no-op rather
    // than an error — the same property every other migration in this repo has.
    expect(sql).toContain('create table if not exists public.quit_habits')
    expect(sql).toContain('create table if not exists public.quit_checkins')
    expect(sql).toMatch(/do \$\$/)
    const policies = sql.match(/create policy/g) ?? []
    const drops = sql.match(/drop policy if exists/g) ?? []
    expect(drops.length).toBe(policies.length)
  })
})

describe('the presets stay neutral', () => {
  it('has stable, unique keys', () => {
    const keys = QUIT_PRESETS.map((p) => p.key)
    expect(new Set(keys).size).toBe(keys.length)
    // These four are written into user rows; renaming one would orphan real data.
    for (const key of ['unhealthy_eating', 'smoking', 'adult_content', 'alcohol', 'custom']) {
      expect(keys, `preset key ${key} must not be renamed`).toContain(key)
    }
  })

  it('ends with the custom fallback, which is what unknown keys resolve to', () => {
    expect(QUIT_PRESETS[QUIT_PRESETS.length - 1].key).toBe('custom')
  })

  it('carries no judgemental language in any label', () => {
    const banned = /bad|dirty|shame|weak|fail|vice|addict|filthy|disgust/i
    for (const p of QUIT_PRESETS) {
      expect(p.label, `preset label "${p.label}"`).not.toMatch(banned)
    }
  })
})
