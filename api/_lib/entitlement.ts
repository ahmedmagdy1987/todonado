import type { SupabaseClient } from '@supabase/supabase-js'
import { isFoundingEmail, resolveEffectivePlan, type Plan } from '../../src/features/billing/planCore.js'
import { canUseFeature, type Feature } from '../../src/features/billing/entitlements.js'

/**
 * SERVER-SIDE entitlement. The client has its own `usePlan()`, but a client gate
 * is a UX affordance, not a security control, so an endpoint that guards a paid
 * capability resolves the plan again here, from the database.
 *
 * ── BE PRECISE ABOUT HOW MUCH THAT COVERS ──────────────────────────────────
 *
 * This file used to say "every Pro-only endpoint" does so. A product audit on
 * 2026-08-17 established that only ONE endpoint ever called it, because only one
 * paid capability has a server path at all: the calendar proxy. Everything else
 * Pro is either a direct browser-to-PostgREST write (the count caps, the voice
 * note upload) or a pure computation over rows the user's own session already
 * holds (Insights, the week board, the history window).
 *
 * That is a real limit of the architecture, not an oversight in this module, and
 * it is written down in docs/ENTITLEMENTS.md with the two ways to close it and
 * what each would cost. Do not read the sentence above as a guarantee that any
 * given paid action is enforced; check the table in that document.
 *
 * ── WHY THIS RETURNS A RESULT AND NOT A PLAN ───────────────────────────────
 *
 * It used to be `Promise<Plan>` with the lookup wrapped in `try { … } catch {}`
 * and the comment "Billing unreadable → fall back … Never fail open to Pro."
 * The second half was true. The first half was the bug: `Free` is not a
 * fallback, it is an ANSWER, and returning it for "we could not find out"
 * removes paid functionality from a paying subscriber and reports nothing.
 *
 * That is not hypothetical. `20260801160000_billing_service_role_access.sql`
 * exists because service_role had NO grant on `public.billing`, so this exact
 * read answered `42501 permission denied` on a real Supabase stack. The
 * swallowed error meant every Pro-only endpoint would have 403'd every paying
 * customer, with a green health check and an empty log. The two sibling
 * handlers that check `error` returned a loud 500 and were fixed first,
 * precisely because they were loud.
 *
 * So the three outcomes are now distinct, and callers must handle all three:
 *
 *   resolved / 'pro'    the user is entitled, on evidence
 *   resolved / 'free'   the user is NOT entitled, on evidence
 *   unavailable         we do not know — the caller must say so (503), never
 *                       guess. Guessing Free downgrades a payer; guessing Pro
 *                       gives away the product.
 *
 * ── WHAT DOES NOT DEPEND ON THE DATABASE ───────────────────────────────────
 *
 * Founding access is decided from the VERIFIED JWT alone (`planCore`
 * precedence: a Pro billing row wins, then a verified founding address). It
 * needs no query, so a founder is still resolved while billing is unreachable
 * rather than being handed a 503 for an answer we already have. The failure is
 * still logged — a founder must not mask an outage.
 *
 * Deliberately does NOT pass `override`: that value comes from the browser's
 * localStorage (`todonado.plan`), so honouring it server-side would let anyone
 * grant themselves Pro from devtools.
 */

/** Why entitlement could not be determined. Codes only — never values. */
export type EntitlementUnavailableReason =
  /** The server is missing Supabase configuration, so no lookup is possible. */
  | 'not_configured'
  /** 42501. The service role has no SELECT on billing — see 20260801160000. */
  | 'permission_denied'
  /** 42P01 / PGRST205 / PGRST202. The billing schema is not applied. */
  | 'schema_outdated'
  /** DNS, TLS, timeout, socket — the database was not reached. */
  | 'unreachable'
  /** A row came back but `plan` was not a value this build understands. */
  | 'malformed'
  /** Anything else. Deliberately last, so a new failure is not miscategorised. */
  | 'unknown'

export type EntitlementResult =
  | { status: 'resolved'; plan: Plan; source: 'billing' | 'founding' | 'no_billing_row' }
  | { status: 'unavailable'; reason: EntitlementUnavailableReason }

/** PostgREST error shape, narrowed without pulling the whole client type in. */
interface PostgrestErrorish {
  code?: string | null
  message?: string | null
}

/**
 * Map a failed lookup onto a reason.
 *
 * The codes are the ones that actually occur, and each is separated because the
 * operator response differs: `permission_denied` is a missing migration,
 * `schema_outdated` is an unapplied one, `unreachable` is an outage.
 */
export function classifyEntitlementFailure(error: unknown): EntitlementUnavailableReason {
  if (error && typeof error === 'object') {
    const { code, message } = error as PostgrestErrorish
    const text = `${code ?? ''} ${message ?? ''}`

    if (code === '42501' || /permission denied/i.test(text)) return 'permission_denied'
    if (
      code === '42P01' ||
      code === 'PGRST205' ||
      code === 'PGRST202' ||
      /does not exist|schema cache/i.test(text)
    ) {
      return 'schema_outdated'
    }
    /*
     * supabase-js surfaces a transport failure as a thrown TypeError whose
     * message is the runtime's ("fetch failed", "Failed to fetch"), with the
     * real cause underneath. Undici also reports timeouts and DNS this way.
     */
    if (
      /fetch failed|failed to fetch|network|timeout|timed out|ENOTFOUND|ECONNREFUSED|ECONNRESET|EAI_AGAIN|abort/i.test(
        text,
      )
    ) {
      return 'unreachable'
    }
    const cause = (error as { cause?: unknown }).cause
    if (cause && cause !== error) return classifyEntitlementFailure(cause)
  }
  return 'unknown'
}

/**
 * Structured, greppable, and deliberately free of personal data.
 *
 * The user id is a pseudonymous key that already appears in this repo's server
 * logs and is what an operator correlates on. The EMAIL is never logged — it is
 * the one field here that identifies a person — and neither is any Stripe
 * identifier or key material.
 */
function logUnavailable(reason: EntitlementUnavailableReason, userId: string, detail: string): void {
  console.error(
    '[api/entitlement] entitlement_unavailable',
    JSON.stringify({ reason, user_id: userId, detail }),
  )
}

/**
 * Resolve entitlement, or say that it could not be resolved.
 *
 * @param admin service-role client, or null when the server is unconfigured.
 */
export async function resolveServerEntitlement(
  admin: SupabaseClient | null,
  userId: string,
  email: string | null,
  /**
   * From the verified JWT (see getUserFromAuthHeader). Defaults to FALSE here,
   * the opposite of the client default, because on the server an unknown
   * verification state must never buy founding access (audit FLAG-8).
   */
  emailVerified: boolean = false,
): Promise<EntitlementResult> {
  /** Decided from the JWT alone; true here means no query is needed. */
  const founding = emailVerified && isFoundingEmail(email)

  if (!admin) {
    if (founding) return { status: 'resolved', plan: 'pro', source: 'founding' }
    logUnavailable('not_configured', userId, 'no service-role client')
    return { status: 'unavailable', reason: 'not_configured' }
  }

  let data: unknown
  try {
    const result = await admin.from('billing').select('plan').eq('user_id', userId).maybeSingle()
    if (result.error) {
      const reason = classifyEntitlementFailure(result.error)
      if (founding) return { status: 'resolved', plan: 'pro', source: 'founding' }
      logUnavailable(reason, userId, result.error.code ?? 'no_code')
      return { status: 'unavailable', reason }
    }
    data = result.data
  } catch (thrown) {
    const reason = classifyEntitlementFailure(thrown)
    if (founding) return { status: 'resolved', plan: 'pro', source: 'founding' }
    logUnavailable(reason, userId, thrown instanceof Error ? thrown.name : 'non_error')
    return { status: 'unavailable', reason }
  }

  // No row at all is an ANSWER: this user has never been billed, so Free.
  if (data == null) {
    const plan = resolveEffectivePlan({ billingPlan: null, email, emailVerified })
    return { status: 'resolved', plan, source: founding ? 'founding' : 'no_billing_row' }
  }

  if (typeof data !== 'object') {
    if (founding) return { status: 'resolved', plan: 'pro', source: 'founding' }
    logUnavailable('malformed', userId, `row was ${typeof data}`)
    return { status: 'unavailable', reason: 'malformed' }
  }

  const value = (data as { plan?: unknown }).plan
  /*
   * A row exists but its plan is not one this build understands. Do NOT read
   * that as Free: the column has a CHECK, so an unrecognised value means the
   * response is not what we think it is, and the honest answer is "unknown".
   */
  if (value !== 'pro' && value !== 'free') {
    if (founding) return { status: 'resolved', plan: 'pro', source: 'founding' }
    logUnavailable('malformed', userId, `plan was ${typeof value}`)
    return { status: 'unavailable', reason: 'malformed' }
  }

  const plan = resolveEffectivePlan({ billingPlan: value, email, emailVerified })
  return {
    status: 'resolved',
    plan,
    source: value === 'pro' ? 'billing' : founding ? 'founding' : 'billing',
  }
}

/**
 * The standard refusal for an endpoint that needs entitlement and could not get
 * it. Exported so every caller answers identically and none invents a status.
 *
 * 503 with Retry-After, NOT 403: the caller is not being denied, we are unable
 * to decide. A 403 would tell a paying customer they are not entitled, which is
 * the silent downgrade this whole module exists to stop.
 */
export const ENTITLEMENT_UNAVAILABLE_STATUS = 503
export const ENTITLEMENT_UNAVAILABLE_CODE = 'entitlement_unavailable'
export const ENTITLEMENT_RETRY_AFTER_SECONDS = 30

/**
 * Does this resolved entitlement include a named capability?
 *
 * ── WHY A FEATURE KEY AND NOT `plan !== 'pro'` ─────────────────────────────
 *
 * The one server-side gate that existed read `entitlement.plan !== 'pro'`
 * directly. That works while there is exactly one paid tier and exactly one
 * gated endpoint, and it is precisely how the client drifted: sixteen call sites
 * each deciding what "pro" entitles you to, none of them agreeing with the
 * pricing page.
 *
 * Asking for a CAPABILITY instead means the client gate and the server gate
 * consult the same table (`src/features/billing/entitlements.ts`, imported here
 * by relative path because it is a dependency-free leaf). A tier change is then
 * one edit in one file that both halves observe, and `entitlementContract.test.ts`
 * asserts the two cannot diverge.
 *
 * Returns a THREE-STATE verdict for the same reason the client does. An endpoint
 * must answer 503 for `unavailable` and 403 only for a decided `no`, because
 * telling a paying customer they are not entitled is the silent downgrade this
 * module exists to prevent.
 */
export type FeatureCheck = 'allowed' | 'denied' | 'unavailable'

export function checkFeature(result: EntitlementResult, feature: Feature): FeatureCheck {
  if (result.status !== 'resolved') return 'unavailable'
  return canUseFeature(result.plan, feature) ? 'allowed' : 'denied'
}
