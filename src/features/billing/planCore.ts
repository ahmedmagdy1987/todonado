/**
 * Entitlement resolution shared by the CLIENT and the SERVERLESS FUNCTIONS.
 *
 * This is a LEAF module: no `@/` imports, no `import.meta`, no browser globals —
 * so `api/` can import it directly (see tsconfig.api.json's include list, the
 * same pattern webhookMapping.ts uses). Keeping it here rather than duplicating
 * the founding allowlist in `api/` means the client gate and the server gate can
 * never disagree about who is Pro.
 *
 * `plan.ts` re-exports everything below, so existing client imports are unchanged.
 */

export type Plan = 'free' | 'pro'

/**
 * Founding / owner accounts that get full Pro access for dogfooding and demos.
 * Add the email you sign into Todonado with here (matched case-insensitively).
 */
export const FOUNDING_EMAILS: readonly string[] = [
  'journeypixofficial@gmail.com',
  'ahmedkassim17777@gmail.com',
]

export function isFoundingEmail(
  email: string | null | undefined,
  list: readonly string[] = FOUNDING_EMAILS,
): boolean {
  if (!email) return false
  const normalized = email.trim().toLowerCase()
  return list.some((e) => e.toLowerCase() === normalized)
}

/**
 * The effective plan once real billing exists. Precedence (highest first):
 *   1. `billingPlan === 'pro'`  — a real, paid Stripe subscription (source of truth).
 *   2. FOUNDING_EMAILS          — owner/dogfooding access (kept).
 *   3. `override`               — the dev-only localStorage preview (kept, documented).
 *   4. Free.
 * Pure + unit-tested. Everything else in the app depends only on `usePlan`.
 *
 * SERVER NOTE: callers on the server MUST NOT pass `override` — it originates
 * from client-controlled localStorage. `resolveServerPlan` in
 * api/_lib/entitlement.ts deliberately omits it.
 */
export function resolveEffectivePlan(args: {
  billingPlan?: Plan | null
  email?: string | null
  override?: Plan | null
  foundingList?: readonly string[]
}): Plan {
  const { billingPlan, email, override, foundingList = FOUNDING_EMAILS } = args
  if (billingPlan === 'pro') return 'pro'
  if (isFoundingEmail(email, foundingList)) return 'pro'
  if (override === 'pro' || override === 'free') return override
  return 'free'
}
