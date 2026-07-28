import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { fileURLToPath, URL } from 'node:url'
import { join } from 'node:path'

/**
 * Guardrail for the invariant the entire security model rests on: **the only
 * credential allowed to reach the browser is the PUBLIC Supabase anon key**
 * (see CLAUDE.md §3 "No secrets in code"). RLS assumes a hostile client, so an
 * anon key in the bundle is fine — a service-role key or a Stripe secret would
 * be a total compromise.
 *
 * Added after the 2026-07-28 pre-launch audit, which crawled 113 built files and
 * 108 production chunks and found zero leaks. This test keeps it that way at
 * commit time instead of only at audit time, and needs no build step: it scans
 * the SOURCE that becomes the bundle.
 *
 * Note it deliberately checks values, not names — `api/_lib/config.ts` legitimately
 * references `STRIPE_SECRET_KEY` and `SUPABASE_SERVICE_ROLE_KEY` as `process.env`
 * lookups, which is exactly where server-only secrets are supposed to be read.
 */

const ROOT = fileURLToPath(new URL('../..', import.meta.url))
const SCAN_DIRS = ['src', 'api', 'e2e', 'scripts']
const EXTENSIONS = /\.(ts|tsx|js|jsx|mjs|cjs|json|html|css)$/

/** Literal credential VALUES that must never appear in the repo. */
const FORBIDDEN: { pattern: RegExp; label: string }[] = [
  { pattern: /\bsk_(?:live|test)_[A-Za-z0-9]{8,}/g, label: 'Stripe secret key' },
  { pattern: /\brk_(?:live|test)_[A-Za-z0-9]{8,}/g, label: 'Stripe restricted key' },
  { pattern: /\bwhsec_[A-Za-z0-9]{8,}/g, label: 'Stripe webhook signing secret' },
  { pattern: /-----BEGIN (?:[A-Z ]+ )?PRIVATE KEY-----/g, label: 'PEM private key' },
  { pattern: /\bAKIA[0-9A-Z]{16}\b/g, label: 'AWS access key id' },
  { pattern: /\bghp_[A-Za-z0-9]{20,}/g, label: 'GitHub personal access token' },
]

function sourceFiles(): string[] {
  const out: string[] = []
  const walk = (dir: string) => {
    let entries: string[]
    try {
      entries = readdirSync(dir)
    } catch {
      return // directory absent in this checkout — nothing to scan
    }
    for (const name of entries) {
      if (name === 'node_modules' || name === 'dist' || name.startsWith('.')) continue
      const full = join(dir, name)
      if (statSync(full).isDirectory()) walk(full)
      else if (EXTENSIONS.test(name)) out.push(full)
    }
  }
  for (const d of SCAN_DIRS) walk(join(ROOT, d))
  return out
}

/** Decode a JWT payload without verifying it (we only read the `role` claim). */
function jwtRole(token: string): string | null {
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString()) as {
      role?: unknown
    }
    return typeof payload.role === 'string' ? payload.role : null
  } catch {
    return null
  }
}

describe('no client-reachable secrets in the source tree', () => {
  const files = sourceFiles()

  it('finds source files to scan (guards against a silently empty sweep)', () => {
    expect(files.length).toBeGreaterThan(50)
  })

  it('contains no hardcoded provider secrets', () => {
    const offenders: string[] = []
    for (const file of files) {
      // Test files are exempt from the LITERAL scan only: api/_lib/http.test.ts
      // must contain obviously-fake keys ("sk_live_ABCdef123456789") to prove
      // redactSecrets() actually strips them. They are NOT exempt from the JWT
      // check below — a real service-role key pasted into a test is still a leak.
      if (/\.test\.tsx?$/.test(file)) continue
      const text = readFileSync(file, 'utf8')
      for (const { pattern, label } of FORBIDDEN) {
        // Fresh lastIndex per file — these are /g regexes.
        pattern.lastIndex = 0
        if (pattern.test(text)) offenders.push(`${label} in ${file.replace(ROOT, '')}`)
      }
    }
    expect(offenders, offenders.join('\n')).toEqual([])
  })

  it('embeds no JWT other than the public anon key', () => {
    const offenders: string[] = []
    for (const file of files) {
      const text = readFileSync(file, 'utf8')
      const tokens = text.match(/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g)
      for (const token of tokens ?? []) {
        const role = jwtRole(token)
        // A non-JWT lookalike decodes to null — ignore. `anon` is public by design.
        if (role != null && role !== 'anon') {
          offenders.push(`JWT with role="${role}" in ${file.replace(ROOT, '')}`)
        }
      }
    }
    expect(offenders, offenders.join('\n')).toEqual([])
  })
})
