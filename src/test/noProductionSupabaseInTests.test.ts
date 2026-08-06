import { execFileSync } from 'node:child_process'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { fileURLToPath, URL } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  HOSTED_SUPABASE_MARKER,
  assertLocalSupabaseUrl,
  findHostedSupabaseEnv,
} from '../../scripts/supabaseTarget.js'

/**
 * NO AUTOMATED TEST MAY REACH A HOSTED SUPABASE PROJECT.
 *
 * The E2E suite used to sign throwaway users up on the production auth server
 * on every push, write rows into production tables, and delete them afterwards.
 * It was not a secret leak — the anon key is public and committed — but it was a
 * CI job mutating a live customer database, one failed cleanup away from
 * leaving a real user behind.
 *
 * The guards that stop it live in scripts/supabaseTarget.js and are enforced at
 * three entry points (playwright.config.ts, vitest's globalSetup, and the
 * scripts/assert-local-supabase.mjs CI step). This file is the fourth: it runs
 * in the ordinary unit suite, so the rule is checked on a developer machine and
 * in every job, not only in the one that starts a stack.
 */

const ROOT = fileURLToPath(new URL('../..', import.meta.url))

describe('the guard itself refuses the right things', () => {
  it('refuses a hosted project URL', () => {
    expect(() => assertLocalSupabaseUrl('https://abcdefgh.supabase.co', 'X')).toThrow(
      /HOSTED Supabase project/i,
    )
  })

  it('refuses an unset URL rather than falling back to production', () => {
    // The whole class of bug: src/lib/env.ts DOES default to production, on
    // purpose, so a harness that inherited that default would silently be
    // testing the live project and would look exactly like a pass.
    expect(() => assertLocalSupabaseUrl(undefined, 'X')).toThrow(/is not set/i)
    expect(() => assertLocalSupabaseUrl('', 'X')).toThrow(/is not set/i)
  })

  it('accepts a local stack', () => {
    expect(assertLocalSupabaseUrl('http://127.0.0.1:54321', 'X')).toBe('http://127.0.0.1:54321')
  })

  it('refuses a malformed URL', () => {
    expect(() => assertLocalSupabaseUrl('not a url', 'X')).toThrow(/not a valid URL/i)
  })

  it('finds a hosted host hiding in an unrelated variable name', () => {
    const found = findHostedSupabaseEnv({
      SOMETHING_ELSE: 'https://x.supabase.co',
      NEXT_PUBLIC_SUPABASE_URL: 'https://y.supabase.co',
      HOME: '/home/runner',
    })
    // Only variables that could plausibly steer a client are reported, so the
    // check stays actionable instead of flagging arbitrary text.
    expect(found.map((f) => f.name)).toEqual(['NEXT_PUBLIC_SUPABASE_URL'])
  })

  it('never echoes a full URL, only the host', () => {
    const [found] = findHostedSupabaseEnv({
      SUPABASE_URL: 'https://user:secret@abc.supabase.co/path?token=xyz',
    })
    expect(found.host).toBe('abc.supabase.co')
    expect(JSON.stringify(found)).not.toContain('secret')
    expect(JSON.stringify(found)).not.toContain('xyz')
  })
})

describe('no test source hardcodes a hosted Supabase host', () => {
  /**
   * `src/lib/env.ts` and `vercel.json` are EXEMPT by design and are not scanned:
   * the app's built-in default and the deployed CSP both legitimately name the
   * production project. What matters is that no TEST does.
   */
  const SCANNED = ['e2e', 'e2e-csp', 'db-tests', 'scripts']
  /*
   * The GUARDS themselves must name the thing they refuse — that is what makes
   * them guards. Everything else in these directories is a test, and a test
   * naming a production host is the bug this scanner exists to catch.
   */
  const EXEMPT = new Set([
    'scripts/assert-local-supabase.mjs',
    'scripts/supabaseTarget.js',
    'scripts/databaseTarget.js',
  ])

  function walk(dir: string, out: string[] = []): string[] {
    let entries: string[]
    try {
      entries = readdirSync(dir)
    } catch {
      return out
    }
    for (const entry of entries) {
      const full = `${dir}/${entry}`
      if (statSync(full).isDirectory()) walk(full, out)
      else if (/\.(ts|tsx|mjs|js|json)$/.test(entry)) out.push(full)
    }
    return out
  }

  it.each(SCANNED)('%s/ is clean', (dir) => {
    const offenders: string[] = []
    for (const file of walk(`${ROOT}${dir}`)) {
      const rel = file.slice(ROOT.length).replace(/\\/g, '/')
      if (EXEMPT.has(rel)) continue
      readFileSync(file, 'utf8')
        .split('\n')
        .forEach((line, i) => {
          if (!line.includes(HOSTED_SUPABASE_MARKER)) return
          // A refusal is allowed to name what it refuses.
          if (/REFUS|refuse|must never|not\s+.*hosted|guard|reject/i.test(line)) return
          offenders.push(`${rel}:${i + 1}`)
        })
    }
    expect(
      offenders,
      `these test sources name a hosted Supabase host:\n${offenders.join('\n')}`,
    ).toEqual([])
  })

  it('the CI guard script agrees, and exits non-zero when it should', () => {
    // Run the real script the workflow runs, with a deliberately hosted target.
    // Proving the script REFUSES is the point; a guard nobody has watched fail
    // is a guard nobody knows works.
    let failed = false
    try {
      execFileSync(process.execPath, [`${ROOT}scripts/assert-local-supabase.mjs`], {
        env: {
          ...process.env,
          CI: '1',
          VITE_SUPABASE_URL: 'https://abcdefgh.supabase.co',
          VITE_SUPABASE_ANON_KEY: 'x'.repeat(40),
        },
        stdio: 'pipe',
      })
    } catch {
      failed = true
    }
    expect(failed, 'assert-local-supabase.mjs must refuse a supabase.co target').toBe(true)
  })
})
