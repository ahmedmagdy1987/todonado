/**
 * THE ONE PLACE THAT DECIDES WHICH SUPABASE THE TESTS TALK TO.
 *
 * ── WHY THIS FILE EXISTS ───────────────────────────────────────────────────
 *
 * The E2E suite used to drive the REAL cloud project. It signed a throwaway
 * account up on production GoTrue, wrote rows into production tables, and
 * deleted itself afterwards. That was defensible when it was the only way to
 * run the journey, and it is not defensible now that CI runs a full local
 * Supabase stack: an automated job on every push was creating and deleting real
 * users in the production auth table, one failed cleanup away from leaving them
 * there, and the suite's "no secrets required" property came from the fact that
 * the production anon key is COMMITTED.
 *
 * ── WHY IT REFUSES INSTEAD OF FALLING BACK ─────────────────────────────────
 *
 * There is deliberately NO default here. src/lib/env.ts ships the production
 * URL as a built-in so a fresh clone runs with no .env, which is right for the
 * app and exactly wrong for a test harness: an unset variable would silently
 * point the whole suite back at production, and the failure would look like
 * success. So an unset variable is an error, and a URL containing `supabase.co`
 * is an error, and both are raised BEFORE any socket is opened.
 *
 * Used by playwright.config.ts, vitest's global setup, e2e/supabaseTarget.ts and
 * scripts/assert-local-supabase.mjs, so there is one rule rather than five.
 */

/** The substring that must never appear in a test target. */
export const HOSTED_SUPABASE_MARKER = 'supabase.co'

const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '::1', '[::1]', '0.0.0.0'])

export class HostedSupabaseError extends Error {
  constructor(message) {
    super(message)
    this.name = 'HostedSupabaseError'
  }
}

/**
 * Throw unless `url` is a usable LOCAL Supabase endpoint.
 *
 * @param {string | undefined | null} url
 * @param {string} context  where the value came from, for the error message
 */
export function assertLocalSupabaseUrl(url, context = 'SUPABASE URL') {
  if (!url) {
    throw new HostedSupabaseError(
      `${context} is not set.\n\n` +
        'The test suites run against a DISPOSABLE local Supabase stack and there is\n' +
        'no fallback, on purpose: an unset variable used to mean "use production".\n\n' +
        '  supabase start\n' +
        '  eval "$(supabase status -o env | sed \'s/^/export /\')"\n' +
        '  export VITE_SUPABASE_URL="$API_URL"\n' +
        '  export VITE_SUPABASE_ANON_KEY="$ANON_KEY"\n',
    )
  }

  if (url.includes(HOSTED_SUPABASE_MARKER)) {
    throw new HostedSupabaseError(
      `${context} points at a HOSTED Supabase project (${redactHost(url)}).\n\n` +
        'REFUSING before any network access. Automated runs must never sign users up,\n' +
        'write rows, or delete accounts on a real project. Start a local stack instead.',
    )
  }

  let parsed
  try {
    parsed = new URL(url)
  } catch {
    throw new HostedSupabaseError(`${context} is not a valid URL: ${redactHost(url)}`)
  }

  /*
   * In CI the target must additionally be loopback. Locally a self-hosted
   * Supabase on another machine is a legitimate thing to point at, so the
   * substring rule above is the whole check there.
   */
  if (process.env.CI && !LOOPBACK_HOSTS.has(parsed.hostname)) {
    throw new HostedSupabaseError(
      `${context} is ${parsed.hostname}, which is not loopback.\n` +
        'CI runs only against the stack it started itself.',
    )
  }

  return url
}

/** Never echo a full URL with credentials or a project ref into a log. */
function redactHost(value) {
  try {
    return new URL(value).host
  } catch {
    return String(value).slice(0, 40)
  }
}

/**
 * Resolve the local Supabase target for a test run, or throw.
 * @returns {{ url: string, anonKey: string }}
 */
export function resolveSupabaseTarget() {
  const url = process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL
  assertLocalSupabaseUrl(url, 'VITE_SUPABASE_URL')

  const anonKey = process.env.VITE_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY
  if (!anonKey) {
    throw new HostedSupabaseError(
      'VITE_SUPABASE_ANON_KEY is not set. Take it from `supabase status -o env` (ANON_KEY).',
    )
  }
  return { url, anonKey }
}

/**
 * Scan already-loaded environment variables for a hosted endpoint.
 *
 * Broader than the target check: a stray `SUPABASE_URL` left in the environment
 * by a shell script or an env file is exactly how a "local only" run quietly
 * reaches production, and the variable that does it is not always the one the
 * harness reads.
 *
 * @returns {{ name: string, host: string }[]} offending variables
 */
export function findHostedSupabaseEnv(env = process.env) {
  const offenders = []
  for (const [name, value] of Object.entries(env)) {
    if (typeof value !== 'string' || !value.includes(HOSTED_SUPABASE_MARKER)) continue
    // Only variables that could plausibly steer a client, not arbitrary text.
    if (!/SUPABASE|POSTGRES|DATABASE|API_URL|BASE_URL/i.test(name)) continue
    offenders.push({ name, host: redactHost(value) })
  }
  return offenders
}
