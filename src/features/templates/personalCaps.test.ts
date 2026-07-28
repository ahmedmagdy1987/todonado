import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath, URL } from 'node:url'
import { MAX_TEMPLATE_DESCRIPTION, MAX_TEMPLATE_TASKS, MAX_TEMPLATE_TITLE } from './personal'

/**
 * The personal-template size caps exist in TWO places: the client constants in
 * `personal.ts` (which produce a kind, inline message) and the CHECK constraints
 * in the migration (the backstop against a hostile or buggy client).
 *
 * They must agree. If the client were the LOOSER of the two, a user could type a
 * valid-looking template and get an opaque Postgres 23514 instead of the helpful
 * error — the exact failure this pins shut. Verified live on 2026-07-29: all four
 * CHECKs reject as designed (see §6 of docs/AUDIT_2026-07-28_prelaunch.md).
 */

const sql = readFileSync(
  fileURLToPath(new URL('../../../supabase/migrations/20260728120000_user_templates.sql', import.meta.url)),
  'utf8',
)

/** First capture group of `pattern` in the migration, as a number. */
function sqlNumber(pattern: RegExp): number {
  const match = pattern.exec(sql)
  expect(match, `migration is missing: ${pattern}`).not.toBeNull()
  return Number(match![1])
}

describe('client caps match the database CHECK constraints', () => {
  it('task-count cap agrees', () => {
    expect(sqlNumber(/jsonb_array_length\(tasks\)\s*<=\s*(\d+)/)).toBe(MAX_TEMPLATE_TASKS)
  })

  it('title-length cap agrees', () => {
    expect(sqlNumber(/char_length\(btrim\(title\)\)\s*between\s*1\s*and\s*(\d+)/)).toBe(
      MAX_TEMPLATE_TITLE,
    )
  })

  it('description-length cap agrees', () => {
    expect(sqlNumber(/char_length\(description\)\s*<=\s*(\d+)/)).toBe(MAX_TEMPLATE_DESCRIPTION)
  })

  it('keeps a byte cap on the jsonb column', () => {
    // No client twin (the client counts entries, not bytes) — this only pins that
    // the backstop still exists, so 100 entries can never be megabytes.
    expect(sqlNumber(/pg_column_size\(tasks\)\s*<=\s*(\d+)/)).toBeGreaterThan(0)
  })

  it('keeps the owner-only policy set intact', () => {
    for (const action of ['select', 'insert', 'update', 'delete']) {
      expect(sql, `missing ${action} policy`).toContain(`user_templates_${action}_own`)
    }
    // Every policy scopes to the caller — no anon access of any kind.
    expect(sql).toContain('user_id = auth.uid()')
    expect(sql).not.toMatch(/to\s+anon/i)
  })
})
