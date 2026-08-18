import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { ENTITLEMENTS, type LimitKey } from './entitlements'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  THE TYPESCRIPT CONTRACT AND THE SQL ENFORCEMENT MUST AGREE.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ── WHY THIS TEST EXISTS ───────────────────────────────────────────────────
 *
 * A cap cannot be shared across a language boundary. The TypeScript table is
 * the product's source of truth and the SQL triggers are the enforcement, and
 * the number has to be written down twice. That is the exact shape of the
 * problem the whole entitlement rework was undertaken to fix: before it, the
 * commercial rules lived in five places nothing connected, and they had drifted
 * far enough that the public pricing page claimed features no gate produced.
 *
 * So the duplication is allowed and the DRIFT is not. This test reads the SQL
 * and asserts every cap in it equals `ENTITLEMENTS.free.limits`. Raise a limit
 * in one place and the build goes red until the other follows.
 *
 * The repo already does this for the size/shape CHECKs (`personalCaps.test.ts`,
 * `quitCaps.test.ts`, `mindMapCaps.test.ts` each read their migration and pin
 * the client constants to the SQL). This is the same technique applied to the
 * commercial caps, which are the ones with a price attached.
 *
 * ── WHAT IT DOES NOT DO ────────────────────────────────────────────────────
 *
 * It does not prove the SQL WORKS. It is a text comparison, and the trigger has
 * never been executed: there is no Docker and no local Postgres on the machine
 * this was written on, so the advisory lock, the concurrency behaviour and the
 * error contract are all unverified. Proving those needs
 * `db-tests/` against a real connection, and that work is BLOCKED, not done.
 *
 * ── AND WHY IT READS A FILE UNDER docs/ ────────────────────────────────────
 *
 * Because the SQL is a PROPOSAL and is deliberately not in supabase/migrations/
 * yet: `public.billing` is empty in production, so applying it would cap the
 * owner's own founding account. When the two prerequisites are met the file
 * moves into the migrations folder, and the only change needed here is the path
 * on the next line.
 */

const SQL_PATH = '../../../docs/proposals/20260818120000_free_count_limits.sql'
const sql = readFileSync(fileURLToPath(new URL(SQL_PATH, import.meta.url)), 'utf8')

/**
 * The caps the SQL actually installs, read out of the CREATE TRIGGER calls.
 *
 * Parsed from the trigger arguments rather than from a comment, so the test can
 * only ever be satisfied by the numbers that would really be enforced.
 */
function capsInSql(): Record<string, number> {
  const found: Record<string, number> = {}
  const pattern =
    /execute function public\.enforce_free_count_limit\(\s*'([A-Za-z]+)'\s*,\s*'(\d+)'\s*\)/g
  for (const m of sql.matchAll(pattern)) found[m[1]] = Number(m[2])
  return found
}

/** The tables the SQL attaches a trigger to, in the order it does so. */
function tablesInSql(): string[] {
  return [...sql.matchAll(/before insert on public\.(\w+)/g)].map((m) => m[1])
}

describe('the SQL enforcement caps match the TypeScript contract', () => {
  const caps = capsInSql()

  it('installs a trigger for every capped table it claims to', () => {
    expect(tablesInSql()).toEqual([
      'user_templates',
      'vision_cards',
      'mind_maps',
      'quit_habits',
    ])
  })

  it.each(Object.entries(capsInSql()))(
    '%s is enforced at the same number the contract declares',
    (feature, cap) => {
      const declared = ENTITLEMENTS.free.limits[feature as LimitKey]
      expect(
        declared,
        `the SQL enforces a cap for "${feature}", which is not a key in the entitlement table`,
      ).toBeDefined()
      expect(cap).toBe(declared)
    },
  )

  it('enforces exactly four of the counted limits, and names the two it cannot', () => {
    /*
     * FOUR, NOT SIX, AND THE SHORTFALL IS THE POINT OF THIS ASSERTION.
     *
     * `activeChallenges` is absent because its Free limit counts challenges whose
     * DERIVED phase is active, and that derivation needs the per-challenge
     * `durationDays` from the TypeScript catalog, a progress computation over four
     * other tables, and the user's local calendar day. A trigger counting
     * `status = 'active'` instead would be STRICTER than the UI and would refuse
     * joins the app had just offered.
     *
     * `calendarSources` is absent because it is not a commercial cap at all: it is
     * an abuse ceiling, identical on both tiers, already enforced by its own
     * trigger. If it ever appears in this list, something has confused a security
     * cap for a price lever.
     */
    expect(Object.keys(caps).sort()).toEqual([
      'mindMaps',
      'personalTemplates',
      'quitHabits',
      'visionCards',
    ])
    expect(caps).not.toHaveProperty('activeChallenges')
    expect(caps).not.toHaveProperty('calendarSources')
  })
})

describe('the SQL keeps the security and commercial layers apart', () => {
  it('creates, alters or drops NO row-level security policy', () => {
    // RLS answers ownership. Commercial entitlement is a separate, additive
    // trigger. Encoding a price into an ownership policy is the one thing this
    // whole approach exists to avoid.
    expect(sql).not.toMatch(/create\s+policy/i)
    expect(sql).not.toMatch(/alter\s+policy/i)
    expect(sql).not.toMatch(/drop\s+policy/i)
    expect(sql).not.toMatch(/row level security/i)
  })

  it('touches no storage object and no Supabase-managed internal', () => {
    // `storage.objects` is owned by supabase_storage_admin. Voice notes are
    // handled separately and are reported as an open blocker, not solved here.
    expect(sql).not.toMatch(/storage\./i)
  })

  it('performs no destructive or data-moving statement anywhere', () => {
    /*
     * The safety property that makes this reviewable at a glance. A packaging
     * change must never be able to remove a user's content, so the migration is
     * asserted to contain no verb that could.
     */
    for (const forbidden of [
      /\bdelete\s+from\b/i,
      /\btruncate\b/i,
      /\bupdate\s+public\./i,
      /\binsert\s+into\b/i,
      /\balter\s+table\b/i,
      /\bdrop\s+table\b/i,
      /\bdrop\s+column\b/i,
    ]) {
      expect(sql, `the proposal contains a destructive statement: ${forbidden}`).not.toMatch(
        forbidden,
      )
    }
  })

  it('never trusts a plan supplied by the caller', () => {
    /*
     * The trigger must resolve entitlement from server state. `effective_plan`
     * reads `public.billing`, which has no client write path at all, and the
     * function must never consult the row being inserted for a plan or an
     * entitlement flag.
     */
    expect(sql).toMatch(/from public\.billing/)
    expect(sql).not.toMatch(/new\.plan/)
    expect(sql).not.toMatch(/new\.is_pro/)
    expect(sql).not.toMatch(/new\.tier/)
  })

  it('is race-safe by the mechanism this repo already proved', () => {
    // The same advisory-lock shape as `calendar_sources_enforce_cap`, whose two
    // concurrency cases are covered in db-tests/calendarSourcesGuard.db.test.ts
    // and were confirmed to FAIL when the lock is removed.
    expect(sql).toMatch(/pg_advisory_xact_lock\(/)
    expect(sql).toMatch(/hashtext\('todonado\.free_count_limit\.'/)
  })

  it('refuses only a NEW row: BEFORE INSERT, never UPDATE or DELETE', () => {
    // Grandfathering is the `>=` comparison plus this. An account over the cap
    // keeps everything and is refused only the next one.
    expect(sql).toMatch(/before insert on/)
    expect(sql).not.toMatch(/before update on/i)
    expect(sql).not.toMatch(/before delete on/i)
    expect(sql).not.toMatch(/after delete on/i)
  })

  it('carries a stable machine-readable failure the client can map', () => {
    // The UI must not parse PostgreSQL prose. The prefix is the contract; the
    // 23514 code alone is not, because the existing size/shape CHECKs share it.
    expect(sql).toMatch(/free_limit_reached/)
    expect(sql).toMatch(/errcode = 'check_violation'/)
  })

  it('documents a rollback that touches no data', () => {
    expect(sql).toMatch(/drop trigger if exists enforce_free_limit on public\.user_templates/)
    expect(sql).toMatch(/drop function if exists public\.enforce_free_count_limit/)
    expect(sql).toMatch(/drop function if exists public\.effective_plan/)
  })
})

describe('the founding-Pro prerequisite is recorded in the SQL itself', () => {
  it('warns, in the file, that the database cannot see the founding allowlist', () => {
    /*
     * NOT DECORATION. The single most dangerous way this proposal could be
     * applied is by somebody finding the file, seeing that it is small and
     * additive, and running it. `public.billing` is empty in production, so the
     * founding account resolves as Free and gets capped.
     *
     * The warning lives in the SQL rather than only in the accompanying
     * document, because the SQL is what gets opened.
     */
    expect(sql).toMatch(/founding/i)
    expect(sql).toMatch(/billing.{0,40}EMPTY/is)
    expect(sql).toMatch(/PROPOSAL ONLY/)
  })
})
