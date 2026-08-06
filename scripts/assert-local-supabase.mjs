#!/usr/bin/env node
/**
 * CI GATE: fail the job before anything opens a socket if any test would reach
 * a hosted Supabase project.
 *
 * Run as its own workflow step so the refusal is a named, visible failure rather
 * than a stack trace inside a test runner. Three checks, because the value can
 * arrive three ways:
 *
 *   1. the target the harness will actually use (VITE_SUPABASE_URL);
 *   2. ANY other loaded environment variable that carries a hosted host — a
 *      leftover SUPABASE_URL from a shell script or an env file steers the
 *      Supabase client just as effectively;
 *   3. the repository's own test sources, so a hardcoded production URL in a
 *      spec cannot bypass the environment entirely. e2e/fixtures.ts used to
 *      contain exactly that.
 *
 * Usage: node scripts/assert-local-supabase.mjs
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { fileURLToPath, URL as NodeURL } from 'node:url'
import {
  HOSTED_SUPABASE_MARKER,
  findHostedSupabaseEnv,
  resolveSupabaseTarget,
} from './supabaseTarget.js'

const ROOT = fileURLToPath(new NodeURL('..', import.meta.url))
const failures = []

// ── 1. the target itself ────────────────────────────────────────────────────
try {
  const { url } = resolveSupabaseTarget()
  console.log(`local Supabase target: ${new NodeURL(url).origin}`)
} catch (err) {
  failures.push(`target: ${err.message}`)
}

// ── 2. anything else in the environment ─────────────────────────────────────
for (const { name, host } of findHostedSupabaseEnv()) {
  failures.push(`environment: ${name} carries a hosted host (${host})`)
}

// ── 3. the test sources ─────────────────────────────────────────────────────
/*
 * `src/lib/env.ts` is EXEMPT and that is deliberate, not an oversight: the
 * production URL is the app's built-in default so a fresh clone runs with no
 * .env, and removing it would change shipped behaviour. What matters is that no
 * TEST reads it — the harness supplies its own target, and the guard above
 * refuses if it does not.
 *
 * `vercel.json` is exempt for the same reason: its CSP names the production
 * Supabase origin because that is the origin production connects to.
 */
const SCANNED_DIRS = ['e2e', 'e2e-csp', 'db-tests', 'scripts']
/*
 * The GUARDS themselves are exempt, because a guard has to name the thing it
 * refuses. `scripts/databaseTarget.js` is the third: it is the allow-list that
 * decides which Postgres the destructive db-tests suite may touch, and it
 * declares HOSTED_SUPABASE_MARKER for the refusal message the workflow's
 * negative control greps for.
 *
 * Kept in step with the same list in src/test/noProductionSupabaseInTests.test.ts.
 */
const EXEMPT = new Set([
  'scripts/assert-local-supabase.mjs',
  'scripts/supabaseTarget.js',
  'scripts/databaseTarget.js',
])

function walk(dir, out = []) {
  let entries
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

for (const dir of SCANNED_DIRS) {
  for (const file of walk(`${ROOT}${dir}`)) {
    const rel = file.slice(ROOT.length).replace(/\\/g, '/')
    if (EXEMPT.has(rel)) continue
    const text = readFileSync(file, 'utf8')
    text.split('\n').forEach((line, i) => {
      if (!line.includes(HOSTED_SUPABASE_MARKER)) return
      /*
       * A REFUSAL is allowed to name the thing it refuses. Both test suites
       * assert that they decline a hosted host, and the guard in
       * supabase/test/apply.mjs is the same idea, so a line that is clearly a
       * check rather than a target is not a finding.
       */
      if (/REFUS|refuse|must never|not\s+.*hosted|guard|reject/i.test(line)) return
      failures.push(`source: ${rel}:${i + 1} hardcodes a hosted Supabase host`)
    })
  }
}

if (failures.length) {
  console.error('::error::REFUSING to run: a test path can reach a hosted Supabase project')
  for (const f of failures) console.error(`  - ${f}`)
  process.exit(1)
}
console.log('no test path can reach a hosted Supabase project')
