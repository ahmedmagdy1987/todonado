import { resolveSupabaseTarget } from '../scripts/supabaseTarget.js'

/**
 * The Supabase the E2E suite talks to — a LOCAL, DISPOSABLE stack, always.
 *
 * This used to be two exported string literals in e2e/fixtures.ts holding the
 * production project URL and its committed anon key, and every spec imported
 * them. The suite therefore signed real accounts up on the production auth
 * server on every push, wrote rows into production tables, and relied on a
 * self-delete (plus an afterAll safety net) to tidy up. One failed cleanup left
 * a real user behind.
 *
 * There is no fallback: `resolveSupabaseTarget` throws when the variable is
 * unset or names a hosted project, and it throws at MODULE LOAD, before
 * Playwright starts a browser or opens a socket. See scripts/supabaseTarget.js
 * for why an unset variable must be an error rather than a default.
 */
const target = resolveSupabaseTarget() as { url: string; anonKey: string }

export const SUPABASE_URL: string = target.url
export const SUPABASE_ANON_KEY: string = target.anonKey

/**
 * Does a request URL address the Supabase Data API?
 *
 * Two specs assert "the marketing pages make no database calls" by watching
 * request URLs. They matched on a hardcoded hosted hostname, which is never
 * true locally, so the assertion would have passed vacuously against a page
 * that hammered the database. Matching on the configured origin keeps the
 * check honest wherever it runs.
 */
export function isSupabaseRestCall(url: string): boolean {
  return url.startsWith(`${SUPABASE_URL}/rest/v1/`)
}
