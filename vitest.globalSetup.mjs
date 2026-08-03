import { findHostedSupabaseEnv } from './scripts/supabaseTarget.js'

/**
 * UNIT-SUITE GUARD: refuse to start if the environment could steer a test at a
 * hosted Supabase project.
 *
 * The unit suite has no database and opens no socket, so this is belt to the
 * E2E guard's braces rather than a fix for a known leak. It is here because the
 * requirement is that EVERY test entry point refuses, and because the cheapest
 * way for production to creep back in is an environment variable someone
 * exported two steps earlier in a workflow and nobody re-read.
 *
 * CI ONLY. A developer with a real .env pointing at the live project is doing
 * something legitimate — running the app — and the unit suite must not refuse to
 * run on their machine because of it.
 */
export default function setup() {
  if (!process.env.CI) return
  const offenders = findHostedSupabaseEnv()
  if (offenders.length === 0) return
  throw new Error(
    'REFUSING to run the unit suite: the environment carries a hosted Supabase host.\n' +
      offenders.map((o) => `  - ${o.name} => ${o.host}`).join('\n'),
  )
}
