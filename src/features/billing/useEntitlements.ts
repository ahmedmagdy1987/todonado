import { usePlan } from './usePlan'
import {
  featureAccess,
  getLimit,
  limitDecision,
  type Access,
  type EntitlementStatus,
  type Feature,
  type LimitKey,
  type LimitVerdict,
  type PlanTier,
} from './entitlements'

/**
 * THE ONE HOOK EVERY GATED SURFACE USES.
 *
 * ── WHY THIS SITS ON TOP OF `usePlan` RATHER THAN REPLACING IT ─────────────
 *
 * `usePlan` answers "which plan is this?", which is a billing question, and it
 * answers it well: one query, the founding allowlist, the dev override, the
 * precedence rules. What it cannot do is stop a caller from turning that answer
 * into a boolean too early, and that is where every entitlement bug in the
 * audit came from. Sixteen call sites each wrote their own `isPro` branch, and
 * four of them wrote `isPro || billingLoading` — which hands the paid layer to
 * a Free user for the length of every cold load, on purpose, to avoid a flicker
 * for subscribers.
 *
 * So the plan stays where it is and the DECISION moves here, where the loading
 * state cannot be dropped by accident: `access()` returns one of three values
 * and a component has to handle all three. Collapsing to a boolean is still
 * possible via `can()`, which is honest about collapsing toward LOCKED.
 *
 * ── WHAT THIS DOES NOT DO ──────────────────────────────────────────────────
 *
 * It is not enforcement. It is the UX half. Every capability with a real server
 * path is independently re-resolved server-side from the SAME contract table
 * (`api/_lib/entitlement.ts`), because anything decided in a downloadable
 * bundle is a suggestion. Where a capability has no server path at all, that is
 * stated plainly in docs/ENTITLEMENTS.md rather than implied to be enforced.
 */
export interface Entitlements {
  /** `resolving` until the plan is actually known. */
  status: EntitlementStatus
  plan: PlanTier
  /** True only once resolved AND Pro. Never true while resolving. */
  isPro: boolean
  /** Still waiting on the billing query. Render a loader, never a paywall. */
  resolving: boolean
  /** Pro by the founding allowlist rather than by a paid subscription. */
  isFounding: boolean

  /** Three-state verdict. Prefer this wherever something is rendered. */
  access: (feature: Feature) => Access
  /**
   * Boolean shorthand, collapsing `resolving` to FALSE.
   *
   * Safe for "should I fetch/compute this expensive Pro thing" and for anything
   * additive. NOT safe as the only gate on a paywall, because it makes a
   * subscriber look Free for one round trip; use `access()` and show a loader.
   */
  can: (feature: Feature) => boolean

  /** The ceiling for this plan. May be `Infinity`. */
  limit: (key: LimitKey) => number
  /** Three-state creation verdict, with grandfathering built in. */
  limitState: (key: LimitKey, count: number, countKnown: boolean) => LimitVerdict
}

export function useEntitlements(): Entitlements {
  const { plan, isPro, isFounding, billingLoading } = usePlan()

  /*
   * A FOUNDING ACCOUNT RESOLVES WITHOUT THE QUERY, AND THAT IS WHY THIS IS NOT
   * SIMPLY `billingLoading`.
   *
   * `resolveEffectivePlan` prefers a paid billing row, then the founding
   * allowlist, then the dev override. The last two need no database row at all,
   * so a founding user is genuinely Pro on the very first render while the
   * billing query is still pending. Treating them as `resolving` would make the
   * owner's own account wait behind a loader on every page for no reason, and
   * would have been a self-inflicted version of the bug this fixes.
   *
   * The reverse is the important half: a user who is NOT already known to be Pro
   * stays `resolving` until the query settles, so nothing paid can leak while
   * the answer is outstanding.
   */
  const status: EntitlementStatus = !billingLoading || isPro ? 'resolved' : 'resolving'

  return {
    status,
    plan,
    isPro: status === 'resolved' && isPro,
    resolving: status === 'resolving',
    isFounding,
    access: (feature) => featureAccess(status, plan, feature),
    can: (feature) => featureAccess(status, plan, feature) === 'allowed',
    limit: (key) => getLimit(plan, key),
    limitState: (key, count, countKnown) =>
      limitDecision({ status, plan, key, count, countKnown }),
  }
}
