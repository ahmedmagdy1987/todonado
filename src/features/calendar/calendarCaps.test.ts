import { readFileSync } from 'node:fs'
import { fileURLToPath, URL } from 'node:url'
import { describe, expect, it } from 'vitest'
import { MAX_CALENDAR_SOURCES_PER_USER } from '@/lib/config'
import { LIMITS } from '@/lib/limits'

/**
 * THE NUMBER TEN LIVES IN THREE PLACES. This is what stops them drifting.
 *
 *   src/lib/config.ts                 MAX_CALENDAR_SOURCES_PER_USER  (the UI)
 *   api/_lib/calendarLimits.ts        MAX_SOURCES_PER_REQUEST        (issue #9)
 *   supabase/migrations/2026080812…   the trigger's `cap`            (enforcement)
 *
 * Same idea as personalCaps / quitCaps / mindMapCaps, with one addition: those
 * pin a client constant to a database CHECK, and this also pins BOTH to the
 * fetch-time request limit. The alignment is the whole argument for the value —
 * a database cap above the request limit would let a user keep calendars that
 * never refresh, and one below it would make the request limit unreachable.
 *
 * The two server files are read as TEXT rather than imported. `api/` compiles
 * under a different tsconfig for the Vercel runtime, and `preflightLive.test.ts`
 * already established reading it as the way to pin it from here.
 */

const repoFile = (relative: string) => fileURLToPath(new URL(relative, import.meta.url))

const MIGRATION = readFileSync(
  repoFile('../../../supabase/migrations/20260808120000_calendar_sources_write_guard.sql'),
  'utf8',
)
const CALENDAR_LIMITS = readFileSync(repoFile('../../../api/_lib/calendarLimits.ts'), 'utf8')
const SSRF = readFileSync(repoFile('../../../api/_lib/ssrf.ts'), 'utf8')

/**
 * The migration with its prose removed.
 *
 * NEEDED, not tidiness. This file's header argues at length about why the
 * trigger does NOT use `for update` and is NOT `SECURITY DEFINER` — so a scan
 * of the raw text for those phrases fails on the very explanation of their
 * absence. A verb only counts where it is executable.
 */
const STATEMENTS = MIGRATION.replace(/\/\*[\s\S]*?\*\//g, ' ')
  .split('\n')
  .map((line) => line.replace(/--.*$/, ''))
  .join('\n')

/** The single number the trigger enforces. */
function migrationCap(): number {
  const match = /cap\s+integer\s*:=\s*(\d+)\s*;/.exec(MIGRATION)
  expect(match, 'the trigger must declare `cap integer := <n>;`').toBeTruthy()
  return Number(match![1])
}

function requestLimit(): number {
  const match = /export const MAX_SOURCES_PER_REQUEST\s*=\s*(\d+)/.exec(CALENDAR_LIMITS)
  expect(match, 'api/_lib/calendarLimits.ts must export MAX_SOURCES_PER_REQUEST').toBeTruthy()
  return Number(match![1])
}

describe('the per-user calendar source cap', () => {
  it('is the same number in the client, the database and the request limit', () => {
    expect(MAX_CALENDAR_SOURCES_PER_USER).toBe(migrationCap())
    expect(MAX_CALENDAR_SOURCES_PER_USER).toBe(requestLimit())
  })

  it('is a real ceiling rather than a formality', () => {
    expect(MAX_CALENDAR_SOURCES_PER_USER).toBeGreaterThan(0)
    expect(MAX_CALENDAR_SOURCES_PER_USER).toBeLessThanOrEqual(25)
  })
})

describe('the migration enforces the cap in a way that survives concurrency', () => {
  it('takes a transaction-scoped advisory lock keyed on the user', () => {
    /*
     * The specific failure this pins out: `select count(*)` then `insert` lets
     * two concurrent transactions both read 9 and both insert. Locking the
     * user's EXISTING rows `for update` looks like a fix and is not, because a
     * user with zero rows has nothing to lock.
     */
    expect(STATEMENTS).toMatch(/pg_advisory_xact_lock\(/)
    expect(STATEMENTS).toMatch(/hashtext\(new\.user_id::text\)/)
    // Transaction-scoped, so it is released by the engine and cannot leak.
    expect(STATEMENTS).not.toMatch(/pg_advisory_lock\(/)
    expect(STATEMENTS).not.toMatch(/for update/i)
  })

  it('runs BEFORE the row lands, on insert and on a change of owner', () => {
    expect(STATEMENTS).toMatch(/before insert or update of user_id on public\.calendar_sources/)
  })

  it('is not SECURITY DEFINER, and pins search_path anyway', () => {
    // Under RLS the inserting role sees exactly its own rows, which is the set
    // the cap counts. SECURITY DEFINER would add an escalation surface to a
    // function every signed-in user can trigger, and buy nothing.
    expect(STATEMENTS).not.toMatch(/security definer/i)
    expect(STATEMENTS).toMatch(/set search_path = ''/)
  })
})

describe('the write-time URL policy is structural only', () => {
  it('never resolves DNS from inside the database', () => {
    /*
     * A lookup in a CHECK would put a network round trip on the write path,
     * make the constraint non-deterministic, and hand every authenticated user
     * a way to make the DATABASE emit outbound requests — a new SSRF primitive
     * introduced by the anti-SSRF fix.
     */
    for (const forbidden of ['dblink', 'pg_net', 'http_get', 'inet_client', 'copy from program']) {
      expect(MIGRATION.toLowerCase()).not.toContain(forbidden)
    }
  })

  it('is IMMUTABLE, so it is legal in a CHECK and cannot change under a row', () => {
    expect(STATEMENTS).toMatch(/create or replace function public\.calendar_url_is_safe/)
    expect(STATEMENTS).toMatch(/\bimmutable\b/)
  })

  it('replaces PUBLIC execute with an explicit grant rather than just revoking it', () => {
    /*
     * A CHECK is evaluated as the WRITING role. Revoking PUBLIC without granting
     * would make every insert fail 42501 — the same confusion between RLS and
     * table privileges that left `billing` unreadable by service_role.
     */
    expect(STATEMENTS).toMatch(/revoke all on function public\.calendar_url_is_safe\(text\) from public/)
    expect(STATEMENTS).toMatch(
      /grant execute on function public\.calendar_url_is_safe\(text\) to authenticated, service_role/,
    )
  })

  it('accepts exactly the schemes and ports the fetch-time guard accepts', () => {
    expect(STATEMENTS).toMatch(/'http', 'https', 'webcal'/)
    expect(STATEMENTS).toMatch(/port not in \('80', '443'\)/)
    // ALLOWED_PORTS in ssrf.ts is the source of that pair.
    expect(SSRF).toMatch(/ALLOWED_PORTS = new Set\(\['', '80', '443'\]\)/)
  })
})

describe('the shape constraint closes a hole that predates it', () => {
  it('requires a url for a subscription and ics_text for a file, never both', () => {
    expect(STATEMENTS).toMatch(/kind = 'url'\s+and url is not null and ics_text is null/)
    expect(STATEMENTS).toMatch(/kind = 'file' and ics_text is not null and url is null/)
  })

  it('refuses an exact duplicate subscription per user', () => {
    expect(STATEMENTS).toMatch(/create unique index if not exists calendar_sources_user_url_uniq/)
    expect(STATEMENTS).toMatch(/where kind = 'url' and url is not null/)
  })
})

describe('the url length bound is the one already pinned to its migration', () => {
  it('reuses LIMITS.calendarUrl rather than restating 2048', () => {
    expect(LIMITS.calendarUrl).toBe(2_048)
    expect(CALENDAR_LIMITS).toMatch(/MAX_URL_LENGTH = 2_048/)
  })
})

describe('the migration performs no destructive or privilege-widening act', () => {
  const statements = STATEMENTS

  it('drops nothing but its own trigger, and truncates nothing', () => {
    expect(statements).not.toMatch(/\btruncate\b/i)
    expect(statements).not.toMatch(/\bdelete\s+from\b/i)
    expect(statements).not.toMatch(/\bdrop\s+table\b/i)
    const drops = [...statements.matchAll(/drop\s+(\w+)\s+if\s+exists\s+([^\s;]+)/gi)]
    expect(drops.map((d) => `${d[1]} ${d[2]}`.toLowerCase())).toEqual([
      'trigger calendar_sources_cap',
    ])
  })

  it('grants nothing beyond execute on its own helper', () => {
    const grants = [...statements.matchAll(/^\s*grant\s+([\s\S]*?);/gim)].map((g) =>
      g[1].replace(/\s+/g, ' ').trim().toLowerCase(),
    )
    expect(grants).toEqual([
      'execute on function public.calendar_url_is_safe(text) to authenticated, service_role',
    ])
  })
})
