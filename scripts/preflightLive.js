/**
 * GO-LIVE PREFLIGHT — the pure half.
 *
 * ── WHAT THIS ANSWERS, AND WHAT IT DELIBERATELY CANNOT ─────────────────────
 *
 * It answers ONE question: "is everything that can be checked from the repo in
 * place, so that flipping Stripe to live is a configuration change rather than
 * a discovery exercise?" It is READ-ONLY by construction — this module performs
 * no I/O at all (the CLI in preflight-live.mjs reads the files and hands them
 * in), opens no socket, and touches neither Stripe nor Supabase.
 *
 * It therefore CANNOT see the two things that matter most: what is in the
 * production `billing` table, and what exists in the Stripe live account. Those
 * are MANUAL_GATES below — acknowledged by an explicit flag once the operator
 * has done them, never inferred. A preflight that guessed at those would be
 * worse than no preflight, because it would print READY on a hunch.
 *
 * ── WHY `skip` DOES NOT BLOCK AND `fail` DOES ──────────────────────────────
 *
 * The server env lives in Vercel, so `STRIPE_MODE` and friends are usually
 * absent in the shell running this. That is the normal case, not a problem, so
 * the env check reports `skip` and the verdict ignores it — `stripeModeProblems()`
 * re-runs the identical rules on every request in the deployment that has them,
 * and §7 of docs/BILLING_SETUP.md verifies the result with a real card. A `fail`
 * means something checkable is actually wrong, and blocks.
 *
 * ── WHY IT NEVER PRINTS A VALUE ────────────────────────────────────────────
 *
 * Every env-related result is a NAME or a machine-readable CODE. A preflight is
 * exactly the sort of thing whose output gets pasted into an issue, and secrets
 * that reach a terminal reach a scrollback buffer.
 */

/**
 * The four migrations that must be applied BEFORE a live key is set.
 *
 * They are listed here rather than derived, because "the unapplied ones" is not
 * something the repo can know — the applied set lives in the database. The
 * ordering and the rationale for each are docs/BILLING_SETUP.md §1.
 */
export const REQUIRED_MIGRATIONS_BEFORE_LIVE = Object.freeze([
  '20260801140000_billing_event_ordering.sql',
  '20260801150000_checkout_attempts.sql',
  '20260801160000_billing_service_role_access.sql',
  '20260801170000_application_data_api_grants.sql',
])

/**
 * Migrations that sort AFTER the billing set and have been deliberately
 * accounted for in `docs/BILLING_SETUP.md` §1.
 *
 * ── WHY THIS LIST EXISTS RATHER THAN A LONGER REQUIRED LIST ────────────────
 *
 * The "nothing newer" rule catches a migration that landed after the runbook
 * was written, because applying §1's ordered list verbatim would skip it. That
 * is a real hazard and the rule stays. But the answer is not to declare every
 * later migration REQUIRED before live: the FLAG-5 calendar guard is security
 * hardening, not part of the money path, and whether it ships before or after
 * the Stripe switch is the owner's call, not this script's.
 *
 * So a file here means "the runbook knows about it", not "it must be applied".
 * `checkMigrationChain` still NAMES every entry in its detail line, because a
 * pending security migration that a green preflight quietly hid would be worse
 * than the stale-runbook problem this whole check exists to prevent.
 */
export const ACKNOWLEDGED_LATER_MIGRATIONS = Object.freeze([
  '20260808120000_calendar_sources_write_guard.sql',
])

/** Hobby-plan ceiling, mirrored from api/_lib/functionBudget.test.ts. */
export const VERCEL_FUNCTION_LIMIT = 12

/** The endpoints that must still exist — the budget must never be met by deleting one. */
export const REQUIRED_ENDPOINTS = Object.freeze([
  'calendar-fetch.ts',
  'create-checkout-session.ts',
  'create-portal-session.ts',
  'stripe-webhook.ts',
])

/** The published prices. The live Stripe prices must be created at these amounts. */
export const EXPECTED_MONTHLY_USD = 5
export const EXPECTED_YEARLY_USD = 48

/** Stripe Checkout is an iframe; without these the upgrade button opens a blank box. */
export const REQUIRED_FRAME_SRC = Object.freeze([
  'https://js.stripe.com',
  'https://checkout.stripe.com',
])

/**
 * The gates no repo-local check can see. Each is acknowledged with `--<flag>`.
 *
 * These are ordered the way they must actually happen.
 */
export const MANUAL_GATES = Object.freeze([
  {
    flag: 'inventory-reviewed',
    title: 'Test/Sandbox billing inventory run and reviewed',
    detail:
      'docs/ISSUE_8_test_billing_inventory.sql run in the Supabase SQL editor, and every row it ' +
      'returned accounted for as Sandbox-era or as a deliberate manual grant.',
  },
  {
    flag: 'cleanup-verified',
    title: 'Test/Sandbox billing rows removed, and the removal verified',
    detail:
      'The cleanup transaction committed and the post-delete check returned ZERO billing rows ' +
      'carrying a Stripe id, with manual/founding rows still present.',
  },
  {
    flag: 'migrations-applied',
    title: 'The four pre-live migrations are applied',
    detail:
      'Confirmed from the RECONCILIATION QUERY (docs/BILLING_SETUP.md §02.1), never from a ' +
      'document — that box has gone stale twice. schema_migrations must list all four. ' +
      'An agent must never apply them.',
  },
  {
    flag: 'live-prices-verified',
    title: 'Live prices exist in Stripe at the published amounts',
    detail:
      `A live recurring monthly price at $${EXPECTED_MONTHLY_USD} and a live recurring yearly ` +
      `price at $${EXPECTED_YEARLY_USD}, on the live product, ids copied into all four price vars.`,
  },
  {
    flag: 'webhook-verified',
    title: 'Live webhook endpoint created and its signing secret set',
    detail:
      'A `whsec_` value does not encode test vs live, so nothing in the code can detect a stale ' +
      'one — it is confirmed by hand or not at all.',
  },
])

const pass = (id, title, detail) => ({ id, title, status: 'pass', detail })
const fail = (id, title, detail) => ({ id, title, status: 'fail', detail })
const skip = (id, title, detail) => ({ id, title, status: 'skip', detail })

/**
 * Are the four pre-live migration FILES present, and is the runbook still current?
 *
 * The second half matters as much as the first: if a migration has landed that
 * sorts AFTER 20260801170000, then §1's ordered list is stale and applying it
 * verbatim would skip the new file.
 *
 * @param {string[]} filenames basenames of supabase/migrations
 */
export function checkMigrationChain(filenames) {
  const title = 'Pre-live migration files present and runbook current'
  const sql = filenames.filter((f) => f.endsWith('.sql')).slice().sort()

  const missing = REQUIRED_MIGRATIONS_BEFORE_LIVE.filter((m) => !sql.includes(m))
  if (missing.length > 0) {
    return fail('migrations', title, `missing from supabase/migrations: ${missing.join(', ')}`)
  }

  const last = REQUIRED_MIGRATIONS_BEFORE_LIVE[REQUIRED_MIGRATIONS_BEFORE_LIVE.length - 1]
  const later = sql.filter((f) => f > last)
  const unaccounted = later.filter((f) => !ACKNOWLEDGED_LATER_MIGRATIONS.includes(f))
  if (unaccounted.length > 0) {
    return fail(
      'migrations',
      title,
      `${unaccounted.length} migration(s) sort after ${last}: ${unaccounted.join(', ')}. ` +
        'docs/BILLING_SETUP.md §1 lists an ordered set that no longer covers everything — ' +
        're-read it before applying anything.',
    )
  }

  /*
   * Named, never merely tolerated: a green line that hid a pending migration
   * would defeat the point of checking at all.
   *
   * The wording is deliberate. This said "also present and accounted for",
   * which reads — next to a [PASS] — as "that one is handled too", when the
   * whole reason for printing it is that it is NOT. This check only ever looks
   * at FILES IN THE REPO; whether anything is applied is the separate
   * `--migrations-applied` gate, and it says so out loud.
   */
  const acknowledged =
    later.length > 0
      ? `; also in the repo, NOT a pre-live requirement, apply status NOT checked here: ${later.join(', ')}`
      : ''
  return pass('migrations', title, `all four files present; nothing unaccounted-for sorts after ${last}${acknowledged}`)
}

/**
 * The Vercel function budget, from the repo rather than from a deployment.
 *
 * Vercel counts EVERY top-level api/*.ts as a function, `*.test.ts` included —
 * see api/_lib/functionBudget.test.ts for the incident that pinned this.
 *
 * @param {string[]} apiTopLevelFiles basenames directly under api/
 */
export function checkFunctionBudget(apiTopLevelFiles) {
  const title = 'Vercel serverless-function budget'
  const ts = apiTopLevelFiles.filter((f) => f.endsWith('.ts'))

  const missing = REQUIRED_ENDPOINTS.filter((e) => !ts.includes(e))
  if (missing.length > 0) {
    return fail('function-budget', title, `endpoint(s) missing from api/: ${missing.join(', ')}`)
  }
  if (ts.length > VERCEL_FUNCTION_LIMIT) {
    return fail(
      'function-budget',
      title,
      `${ts.length} top-level api/*.ts files exceeds the ${VERCEL_FUNCTION_LIMIT}-function limit. ` +
        'Move helpers and their tests into api/_lib/, which Vercel excludes.',
    )
  }
  return pass('function-budget', title, `${ts.length}/${VERCEL_FUNCTION_LIMIT} functions, all four endpoints present`)
}

/**
 * Does the enforcing CSP still allow Stripe Checkout to render?
 *
 * @param {string} csp the policy exactly as deployed
 */
export function checkStripeCsp(csp) {
  const title = 'Deployed CSP allows Stripe Checkout'
  if (typeof csp !== 'string' || csp.trim() === '') {
    return fail('csp', title, 'no Content-Security-Policy found in vercel.json')
  }
  const directive = csp
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith('frame-src'))
  if (!directive) {
    // default-src 'self' then applies, which blocks Stripe.
    return fail('csp', title, "no frame-src directive; default-src would block checkout.stripe.com")
  }
  const sources = directive.split(/\s+/).slice(1)
  const missing = REQUIRED_FRAME_SRC.filter((s) => !sources.includes(s))
  if (missing.length > 0) {
    return fail('csp', title, `frame-src is missing: ${missing.join(', ')}`)
  }
  return pass('csp', title, `frame-src allows ${REQUIRED_FRAME_SRC.join(' and ')}`)
}

/**
 * Do the published prices still match what the live Stripe prices must be?
 *
 * The live prices are created BY HAND in the Stripe dashboard, so the number a
 * human types there comes from here. If this drifts, the site advertises one
 * price and charges another.
 *
 * @param {{ monthlyUsd: number, yearlyUsd: number }} pricing
 */
export function checkPricing(pricing) {
  const title = 'Published prices match the live prices to be created'
  const { monthlyUsd, yearlyUsd } = pricing ?? {}

  if (!Number.isFinite(monthlyUsd) || !Number.isFinite(yearlyUsd) || monthlyUsd <= 0) {
    return fail('pricing', title, 'could not read PRO_MONTHLY_USD / PRO_YEARLY_USD from src/features/marketing/pricing.ts')
  }

  const problems = []
  if (monthlyUsd !== EXPECTED_MONTHLY_USD) {
    problems.push(`monthly is $${monthlyUsd}, expected $${EXPECTED_MONTHLY_USD}`)
  }
  if (yearlyUsd !== EXPECTED_YEARLY_USD) {
    problems.push(`yearly is $${yearlyUsd}, expected $${EXPECTED_YEARLY_USD}`)
  }

  const perMonth = yearlyUsd / 12
  const savingPercent = Math.round(((monthlyUsd * 12 - yearlyUsd) / (monthlyUsd * 12)) * 100)
  if (perMonth !== 4) problems.push(`yearly-per-month is $${perMonth}, expected $4`)
  if (savingPercent !== 20) problems.push(`saving is ${savingPercent}%, expected 20%`)

  if (problems.length > 0) return fail('pricing', title, problems.join('; '))
  return pass(
    'pricing',
    title,
    `$${monthlyUsd}/month · $${yearlyUsd}/year · $${perMonth}/month billed annually · save ${savingPercent}%`,
  )
}

/**
 * Stripe env consistency — NAMES AND CODES ONLY, never a value.
 *
 * Mirrors api/_lib/config.ts `stripeModeProblems` / `missingWebhookVars` so the
 * preflight and the running deployment cannot disagree about what "consistent"
 * means. It is a copy rather than an import because this module is plain ESM
 * with no build step and config.ts is TypeScript compiled for the Vercel
 * runtime; src/test/preflightLive.test.ts pins the two together.
 *
 * @param {Record<string, string | undefined>} env
 */
export function checkStripeEnv(env) {
  const title = 'Stripe environment variables are internally consistent'
  const read = (name) => (env?.[name] ?? '').trim()
  const mode = read('STRIPE_MODE').toLowerCase()

  if (!mode) {
    return skip(
      'stripe-env',
      title,
      'STRIPE_MODE is not set in this shell — normal, the server env lives in Vercel. ' +
        'stripeModeProblems() enforces these same rules on every request there.',
    )
  }
  if (mode !== 'test' && mode !== 'live') {
    return fail('stripe-env', title, 'STRIPE_MODE_INVALID (must be exactly "test" or "live")')
  }

  const infix = mode === 'live' ? '_live_' : '_test_'
  const problems = []

  const secret = read('STRIPE_SECRET_KEY')
  const publishable = read('VITE_STRIPE_PUBLISHABLE_KEY')
  if (secret && !secret.includes(infix)) problems.push('STRIPE_SECRET_KEY_MODE_MISMATCH')
  if (publishable && !publishable.includes(infix)) problems.push('VITE_STRIPE_PUBLISHABLE_KEY_MODE_MISMATCH')

  const serverMonthly = read('STRIPE_PRICE_MONTHLY')
  const serverYearly = read('STRIPE_PRICE_YEARLY')
  const clientMonthly = read('VITE_STRIPE_PRICE_MONTHLY')
  const clientYearly = read('VITE_STRIPE_PRICE_YEARLY')
  if (clientMonthly && serverMonthly !== clientMonthly) problems.push('PRICE_MONTHLY_CLIENT_SERVER_MISMATCH')
  if (clientYearly && serverYearly !== clientYearly) problems.push('PRICE_YEARLY_CLIENT_SERVER_MISMATCH')

  const missing = [
    ['STRIPE_SECRET_KEY', secret],
    ['STRIPE_WEBHOOK_SECRET', read('STRIPE_WEBHOOK_SECRET')],
    ['STRIPE_PRICE_MONTHLY', serverMonthly],
    ['STRIPE_PRICE_YEARLY', serverYearly],
    ['SUPABASE_URL', read('SUPABASE_URL')],
    ['SUPABASE_SERVICE_ROLE_KEY', read('SUPABASE_SERVICE_ROLE_KEY')],
  ]
    .filter(([, value]) => value === '')
    .map(([name]) => name)

  if (missing.length > 0) problems.push(`UNSET: ${missing.join(', ')}`)

  if (problems.length > 0) return fail('stripe-env', title, `mode=${mode}; ${problems.join('; ')}`)
  return pass('stripe-env', title, `mode=${mode}; every declared value agrees with it`)
}

/**
 * The verdict.
 *
 * READY FOR LIVE means: nothing checkable here failed, AND every manual gate has
 * been explicitly acknowledged. Skipped checks do not block — see the header.
 *
 * @param {{ id: string, title: string, status: string, detail: string }[]} checks
 * @param {string[]} acknowledgedFlags
 */
export function summarise(checks, acknowledgedFlags = []) {
  const acknowledged = new Set(acknowledgedFlags)
  const failed = checks.filter((c) => c.status === 'fail')
  const skipped = checks.filter((c) => c.status === 'skip')
  const outstandingGates = MANUAL_GATES.filter((g) => !acknowledged.has(g.flag))

  const ready = failed.length === 0 && outstandingGates.length === 0

  const reasons = [
    ...failed.map((c) => `FAILED CHECK · ${c.title} — ${c.detail}`),
    ...outstandingGates.map((g) => `UNACKNOWLEDGED GATE · ${g.title} — pass --${g.flag} once it is true`),
  ]

  return {
    verdict: ready ? 'READY FOR LIVE' : 'NOT READY FOR LIVE',
    ready,
    reasons,
    failed,
    skipped,
    outstandingGates,
  }
}
