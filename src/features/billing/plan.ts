/**
 * Client-side entitlement helpers.
 *
 * `resolveEffectivePlan` is the real resolver (paid subscription → founding →
 * local preview override → free); `readPlanOverride` is the dev-only preview
 * switch. The rest of the app depends only on `usePlan`.
 */
/**
 * The plan type, founding allowlist and `resolveEffectivePlan` now live in
 * `planCore.ts` — a leaf module the serverless functions can import too, so the
 * client gate and the server gate share one definition of "who is Pro". They are
 * re-exported here unchanged, so every existing `from './plan'` import still works.
 */
export {
  FOUNDING_EMAILS,
  isFoundingEmail,
  resolveEffectivePlan,
  type Plan,
} from './planCore'

import { isFoundingEmail, FOUNDING_EMAILS, type Plan } from './planCore'

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
