import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath, URL } from 'node:url'
import { MAX_MAP_EDGES, MAX_MAP_NODES, MAX_MAP_TITLE } from './graph'

/**
 * The mind-map caps exist in TWO places: the client constants in `graph.ts`
 * (which refuse the operation quietly and keep the map usable) and the CHECK
 * constraints in the migration (the backstop against a hostile or buggy client).
 *
 * They must agree. If the client were the LOOSER of the two, a user would draw a
 * 201st node, watch it appear, and then have the whole autosave rejected with an
 * opaque Postgres 23514 — losing the rest of the session's work along with it.
 * That is the exact failure this pins shut, and it is the same reasoning as
 * `personalCaps.test.ts`.
 *
 * It also pins the parts of the migration that are security rather than size:
 * the owner-only policy set, and the node-link guard that stops this
 * user-scoped table from being used to park a workspace id its owner cannot read.
 */

const sql = readFileSync(
  fileURLToPath(new URL('../../../supabase/migrations/20260731120000_mind_maps.sql', import.meta.url)),
  'utf8',
)

/** First capture group of `pattern` in the migration, as a number. */
function sqlNumber(pattern: RegExp): number {
  const match = pattern.exec(sql)
  expect(match, `migration is missing: ${pattern}`).not.toBeNull()
  return Number(match![1])
}

describe('client caps match the database CHECK constraints', () => {
  it('node-count cap agrees', () => {
    expect(sqlNumber(/jsonb_array_length\(nodes\)\s*<=\s*(\d+)/)).toBe(MAX_MAP_NODES)
  })

  it('edge-count cap agrees', () => {
    expect(sqlNumber(/jsonb_array_length\(edges\)\s*<=\s*(\d+)/)).toBe(MAX_MAP_EDGES)
  })

  it('title-length cap agrees', () => {
    expect(sqlNumber(/char_length\(btrim\(title\)\)\s*between\s*1\s*and\s*(\d+)/)).toBe(
      MAX_MAP_TITLE,
    )
  })

  it('keeps a byte cap on BOTH jsonb columns', () => {
    // No client twin (the client counts entries, not bytes). This only pins that
    // the backstop exists, so 200 nodes can never be megabytes.
    expect(sqlNumber(/pg_column_size\(nodes\)\s*<=\s*(\d+)/)).toBeGreaterThan(0)
    expect(sqlNumber(/pg_column_size\(edges\)\s*<=\s*(\d+)/)).toBeGreaterThan(0)
  })

  it('keeps both columns constrained to arrays', () => {
    // normaliseMap tolerates a non-array, but jsonb_array_elements inside the
    // link guard would raise on one, so the DB must refuse it outright.
    expect(sql).toMatch(/jsonb_typeof\(nodes\)\s*=\s*'array'/)
    expect(sql).toMatch(/jsonb_typeof\(edges\)\s*=\s*'array'/)
  })
})

describe('the migration keeps the security properties it was written for', () => {
  it('keeps the owner-only policy set intact', () => {
    for (const action of ['select', 'insert', 'update', 'delete']) {
      expect(sql, `missing ${action} policy`).toContain(`mind_maps_${action}_own`)
    }
    expect(sql).toContain('user_id = auth.uid()')
    // No anon access of any kind.
    expect(sql).not.toMatch(/to\s+anon/i)
  })

  it('guards node project/task links on BOTH write paths', () => {
    // A user-scoped table storing workspace-scoped ids would otherwise be an
    // oracle: park an id you cannot read, and a rejected write tells you it
    // exists. Only insert and update can introduce a link, so only those two.
    const insert = /create policy mind_maps_insert_own[\s\S]*?;/.exec(sql)?.[0] ?? ''
    const update = /create policy mind_maps_update_own[\s\S]*?;/.exec(sql)?.[0] ?? ''
    expect(insert).toContain('mind_map_links_ok(nodes)')
    expect(update).toContain('mind_map_links_ok(nodes)')
  })

  it('checks BOTH link kinds through the shared SECURITY DEFINER helpers', () => {
    expect(sql).toContain('public.can_access_project(')
    expect(sql).toContain('public.can_access_task(')
  })

  it('rejects a malformed id instead of casting it', () => {
    // `'abc'::uuid` raises 22P02, which aborts the statement with a parse error
    // rather than a clean policy denial. The regex guard is what makes a junk id
    // fail the check like every other violation.
    expect(sql).toMatch(/\[0-9a-f\]\{8\}-\[0-9a-f\]\{4\}/)
  })

  it('does not grant the guard to anon', () => {
    expect(sql).toContain('revoke all on function public.mind_map_links_ok(jsonb) from public')
    expect(sql).toContain('grant execute on function public.mind_map_links_ok(jsonb) to authenticated')
  })
})
