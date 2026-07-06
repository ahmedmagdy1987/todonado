/**
 * Simple, pre-billing entitlement check.
 *
 * Billing is still a fake door (see features/marketing + upgrade_intents), so
 * there is no real subscription state yet. Until Stripe ships, "Pro" access is
 * granted to founding/owner accounts by email allowlist, with a local override
 * for previewing either tier. Replace `resolvePlan` with a real subscription
 * lookup when billing exists; the rest of the app only depends on `usePlan`.
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
 * Resolve the effective plan. Pure and testable: an explicit `override` (from a
 * local preview toggle) always wins; otherwise founding emails are Pro and
 * everyone else is Free.
 *
 * NOTE: this is the pre-billing resolver (override-first). Real billing uses
 * `resolveEffectivePlan` below, whose precedence puts a paid subscription first.
 */
export function resolvePlan(
  email: string | null | undefined,
  override?: Plan | null,
  list: readonly string[] = FOUNDING_EMAILS,
): Plan {
  if (override === 'pro' || override === 'free') return override
  return isFoundingEmail(email, list) ? 'pro' : 'free'
}

/**
 * The effective plan once real billing exists. Precedence (highest first):
 *   1. `billingPlan === 'pro'`  — a real, paid Stripe subscription (source of truth).
 *   2. FOUNDING_EMAILS          — owner/dogfooding access (kept).
 *   3. `override`               — the dev-only localStorage preview (kept, documented).
 *   4. Free.
 * Pure + unit-tested. Everything else in the app depends only on `usePlan`.
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

/**
 * A local, non-persistent way to preview either tier without a billing backend:
 *   - localStorage `todonado.plan` = "pro" | "free"
 *   - build flag  VITE_PRO_PREVIEW = "true"
 * Returns null when no override is set (the normal path).
 */
export function readPlanOverride(): Plan | null {
  try {
    if (typeof localStorage !== 'undefined') {
      const v = localStorage.getItem('todonado.plan')
      if (v === 'pro' || v === 'free') return v
    }
  } catch {
    /* localStorage may be unavailable; fall through */
  }
  // DEV/PREVIEW ONLY: this is a GLOBAL switch — it grants Pro to every visitor.
  // Never set VITE_PRO_PREVIEW in a production build, or the Insights gate is
  // open for everyone. Remove this branch entirely once real billing exists.
  if (import.meta.env.VITE_PRO_PREVIEW === 'true') return 'pro'
  return null
}
