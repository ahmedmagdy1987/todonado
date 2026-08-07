import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * THE ISSUE #8 CLEANUP SCRIPT MUST BE SAFE TO RUN BY ACCIDENT.
 *
 * docs/ISSUE_8_cleanup_sandbox_billing.sql deletes rows from public.billing and
 * public.checkout_attempts on the PRODUCTION project. There is no client write
 * path to either table, so a billing row deleted by mistake cannot be put back
 * by the app: every affected user silently becomes Free.
 *
 * The mitigation is that the committed file ends in `rollback;`. It executes
 * every assertion and both DELETEs so the dry run is real, and then throws the
 * whole transaction away. Turning it into a live cleanup is a deliberate
 * one-word edit that must never be committed.
 *
 * ── WHY A TEXT TEST, WHEN db-tests/issue8Cleanup.db.test.ts RUNS THE THING ──
 *
 * They answer different questions and neither substitutes for the other. The
 * database suite proves the script BEHAVES correctly: the assertions fire, the
 * right rows go, nothing else moves. It cannot prove the committed artifact is
 * the harmless variant, because it deliberately runs a `commit;` version in
 * memory to observe the deletes at all. This file is the one that pins the
 * default, and it runs in the unit suite with no database, so it is impossible
 * to skip.
 *
 * The second half is about REACH rather than content. A .sql file in docs/ is
 * inert only for as long as nothing executes it. Vitest globs, the migration
 * applier, an npm lifecycle hook and a CI step are all things that would run it
 * without anybody deciding to, so the filename is asserted absent from every
 * one of them.
 */

const ROOT = fileURLToPath(new URL('../..', import.meta.url))
const CLEANUP_REL = 'docs/ISSUE_8_cleanup_sandbox_billing.sql'
const CLEANUP_BASENAME = 'ISSUE_8_cleanup_sandbox_billing.sql'
const SQL = readFileSync(join(ROOT, CLEANUP_REL), 'utf8')

/** The inventory this script was written against, verified read-only 2026-08-07. */
const EXPECTED_BILLING_USERS = ['c208748a-cc5b-434b-993f-cf6e3f5093a9']
const EXPECTED_ATTEMPT_IDS = [
  '39ce9677-ca5b-4a95-a928-91023bdf8ea8',
  '87224037-fa27-4309-be1f-1e5255d64dc3',
  'c685bff6-6584-4a84-aae4-4a03d3eccc55',
]

/** Block and line comments removed. Prose cannot be mistaken for a statement. */
function withoutComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .split('\n')
    .map((line) => line.replace(/--.*$/, ''))
    .join('\n')
}

/**
 * Comments AND single-quoted literals removed.
 *
 * THE DISTINCTION IS LOAD-BEARING. The script legitimately says the word
 * "grant" inside an error message ("it may have become a manual grant"), and a
 * naive scan for /\bgrant\b/ would read that as a privilege change and fail on
 * a file that performs none. A verb only counts when it is executable text.
 */
function executableOnly(source: string): string {
  return withoutComments(source).replace(/'(?:[^']|'')*'/g, "''")
}

const CODE = withoutComments(SQL)
const EXEC = executableOnly(SQL)

const lastStatement = (source: string) =>
  source
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .at(-1) ?? ''

describe('the committed cleanup script is a dry run', () => {
  it('ends in rollback, so running it as committed persists nothing', () => {
    expect(lastStatement(EXEC).toLowerCase()).toBe('rollback;')
  })

  it('contains no commit statement anywhere', () => {
    expect(EXEC).not.toMatch(/\bcommit\b/i)
  })

  it('opens exactly one explicit transaction and closes it exactly once', () => {
    expect(EXEC.match(/^\s*begin\s*;/gim) ?? []).toHaveLength(1)
    expect(EXEC.match(/^\s*rollback\s*;/gim) ?? []).toHaveLength(1)
  })
})

describe('it performs no schema change and no privilege change', () => {
  const forbidden: [string, RegExp][] = [
    ['truncate', /\btruncate\b/i],
    ['drop', /\bdrop\b/i],
    ['alter', /\balter\b/i],
    ['grant', /\bgrant\b/i],
    ['revoke', /\brevoke\b/i],
    ['create', /\bcreate\b/i],
    ['insert', /\binsert\b/i],
    ['copy', /\bcopy\b/i],
    ['a data-modifying update', /\bupdate\s+(?:public|auth|storage)\./i],
  ]

  for (const [label, pattern] of forbidden) {
    it(`never uses ${label}`, () => {
      expect(EXEC).not.toMatch(pattern)
    })
  }

  it('never writes to auth, to storage, or to the migration ledger', () => {
    expect(EXEC).not.toMatch(/delete\s+from\s+auth\./i)
    expect(EXEC).not.toMatch(/delete\s+from\s+storage\./i)
    expect(EXEC).not.toMatch(/delete\s+from\s+supabase_migrations\./i)
  })
})

describe('it deletes from exactly two tables, in the safe order', () => {
  it('deletes only from public.checkout_attempts and public.billing', () => {
    const targets = [...EXEC.matchAll(/delete\s+from\s+([a-z_]+\.[a-z_]+)/gi)].map((m) =>
      m[1].toLowerCase(),
    )
    expect(targets.sort()).toEqual(['public.billing', 'public.checkout_attempts'])
  })

  it('locks checkout_attempts before billing, matching the webhook path', () => {
    /*
     * bind_verified_checkout() row-locks the attempt and then calls
     * apply_stripe_billing_event(), which locks billing. Acquiring them the
     * other way round here would deadlock against a webhook landing mid-run.
     */
    const attempts = EXEC.indexOf('lock table public.checkout_attempts')
    const billing = EXEC.indexOf('lock table public.billing')
    expect(attempts).toBeGreaterThan(-1)
    expect(billing).toBeGreaterThan(attempts)
  })

  it('deletes checkout_attempts before billing', () => {
    const attempts = EXEC.search(/delete\s+from\s+public\.checkout_attempts/i)
    const billing = EXEC.search(/delete\s+from\s+public\.billing/i)
    expect(attempts).toBeGreaterThan(-1)
    expect(billing).toBeGreaterThan(attempts)
  })
})

describe('the guards that make it fail closed', () => {
  it('gates the billing delete on a Stripe identifier as well as the user id', () => {
    /*
     * THIS IS THE FOUNDING-ROW GUARANTEE. A manual grant carries no Stripe id
     * (docs/BILLING_SETUP.md section 6 writes exactly such a row), so if one of
     * the named users has since become a manual grant the predicate stops
     * matching, the count assertion fails, and everything rolls back.
     */
    const billingDelete = EXEC.slice(EXEC.search(/delete\s+from\s+public\.billing/i))
    expect(billingDelete).toMatch(/stripe_customer_id\s+is not null/i)
    expect(billingDelete).toMatch(/stripe_subscription_id\s+is not null/i)
    expect(billingDelete).toMatch(/last_stripe_event_id\s+is not null/i)
    expect(billingDelete).toMatch(/user_id\s*=\s*any\(k_billing_users\)/i)
  })

  it('refuses to run if a non-terminal checkout attempt exists', () => {
    expect(CODE).toContain("status in ('reserved', 'session_created', 'completed')")
    expect(CODE).toMatch(/non-terminal checkout attempt/i)
  })

  it('refuses any session id that is not test mode', () => {
    expect(CODE).toContain("stripe_session_id not like 'cs_test_%'")
  })

  it('refuses to delete a row belonging to a founding account', () => {
    expect(CODE).toContain('journeypixofficial@gmail.com')
    expect(CODE).toContain('ahmedkassim17777@gmail.com')
    expect(CODE).toMatch(/belong to a founding account/i)
  })

  it('verifies auth.users and the application tables are unchanged afterwards', () => {
    expect(EXEC).toMatch(/v_users_after <> v_users_before/)
    expect(EXEC).toMatch(/v_app_after is distinct from v_app_before/)
    for (const table of ['profiles', 'projects', 'tasks', 'journal_entries', 'vision_cards']) {
      expect(EXEC).toContain(`from public.${table}`)
    }
  })
})

describe('the constants match the verified production inventory', () => {
  it('names exactly the one billing user found on 2026-08-07', () => {
    for (const id of EXPECTED_BILLING_USERS) expect(CODE).toContain(id)
    expect(CODE).toMatch(/k_billing_total\s+bigint\s*:=\s*1\b/)
  })

  it('names exactly the three checkout attempts found on 2026-08-07', () => {
    for (const id of EXPECTED_ATTEMPT_IDS) expect(CODE).toContain(id)
    expect(CODE).toMatch(/k_attempts_total\s+bigint\s*:=\s*3\b/)
  })

  it('carries no credential of any kind', () => {
    expect(SQL).not.toMatch(/\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{8,}/)
    expect(SQL).not.toMatch(/\bwhsec_[A-Za-z0-9]{8,}/)
    expect(SQL).not.toMatch(/-----BEGIN/)
    // A JWT would be a Supabase key. Stripe object ids are not credentials.
    expect(SQL).not.toMatch(/\beyJ[A-Za-z0-9_-]{10,}\./)
  })
})

/* ────────────────────────────────────────────────────────────────────────────
 * NOTHING RUNS IT.
 *
 * The file is only inert while no automated path executes it. Each check below
 * closes one such path, and each is a real possibility rather than a
 * formality: a .sql file placed in supabase/migrations would be applied by
 * `db push`, one named in an npm lifecycle script would run on `npm install`,
 * and one matched by a vitest or playwright glob would run in CI.
 * ──────────────────────────────────────────────────────────────────────────── */
describe('no automated path executes the cleanup script', () => {
  it('is not a migration', () => {
    const migrations = readdirSync(join(ROOT, 'supabase/migrations'))
    expect(migrations).not.toContain(CLEANUP_BASENAME)
    expect(migrations.some((f) => /issue_8/i.test(f))).toBe(false)
  })

  it('lives in docs/, which the migration applier never reads', () => {
    const applier = readFileSync(join(ROOT, 'supabase/test/apply.mjs'), 'utf8')
    expect(applier).not.toContain(CLEANUP_BASENAME)
    expect(applier).toContain('MIGRATIONS_DIR')
  })

  it('is not referenced by any npm script', () => {
    const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as {
      scripts?: Record<string, string>
    }
    for (const [name, script] of Object.entries(pkg.scripts ?? {})) {
      expect(`${name}: ${script}`).not.toContain(CLEANUP_BASENAME)
    }
  })

  it('is not referenced by CI or by the deployment config', () => {
    const workflows = readdirSync(join(ROOT, '.github/workflows'))
      .map((f) => readFileSync(join(ROOT, '.github/workflows', f), 'utf8'))
      .join('\n')
    expect(workflows).not.toContain(CLEANUP_BASENAME)
    expect(readFileSync(join(ROOT, 'vercel.json'), 'utf8')).not.toContain(CLEANUP_BASENAME)
  })

  it('is not imported or read by anything that ships or runs', () => {
    const scanned = ['src', 'api', 'scripts', 'e2e', 'supabase']
    const offenders: string[] = []
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        const full = join(dir, entry)
        if (statSync(full).isDirectory()) {
          walk(full)
          continue
        }
        if (!/\.(ts|tsx|js|mjs|cjs|json|sql|ya?ml)$/.test(entry)) continue
        // This suite and its database sibling are the only permitted readers.
        if (/issue8Cleanup(Safety)?\.(db\.)?test\.ts$/.test(entry)) continue
        if (readFileSync(full, 'utf8').includes(CLEANUP_BASENAME)) {
          offenders.push(full.slice(ROOT.length).replace(/\\/g, '/'))
        }
      }
    }
    for (const dir of scanned) walk(join(ROOT, dir))
    expect(
      offenders,
      'Only the two test files may name the cleanup script. Anything else is a path\n' +
        'that could execute it without a human deciding to:\n' +
        offenders.join('\n'),
    ).toEqual([])
  })
})
