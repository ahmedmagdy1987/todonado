import type { EntitlementStatus, PlanTier } from './entitlements'

/**
 * Lets non-React code read the CURRENTLY RESOLVED plan.
 *
 * ── WHY A BRIDGE, AND WHY IT IS NOT A SECOND SOURCE OF TRUTH ───────────────
 *
 * The global mutation-error handler lives on the `queryClient`, which is
 * constructed outside the component tree and therefore cannot call a hook. It
 * needs the plan to decide whether a Free-limit rejection is a limit to explain
 * (§Free) or entitlement drift to report (§Pro).
 *
 * This is the same shape as `components/common/toastBridge.ts`, which exists for
 * the same reason and is used by the same handler.
 *
 * What is stored is NOT server state. The billing row stays in TanStack Query,
 * where `usePlan` owns it; what is mirrored here is the DERIVED verdict that
 * `useEntitlements` already computed from it — two enum values. So there is no
 * second copy of the row to go stale, and no cache to invalidate: the value is
 * republished whenever the query it derives from changes.
 *
 * It is read at exactly one moment — while handling an error that has already
 * happened — so a render's worth of staleness cannot matter. The conservative
 * default carries the important half of the safety property: before any provider
 * has published, this reads `resolving`, and `resolving` never produces an
 * upgrade prompt.
 */
export interface EntitlementSnapshot {
  status: EntitlementStatus
  plan: PlanTier
}

const UNKNOWN: EntitlementSnapshot = { status: 'resolving', plan: 'free' }

let snapshot: EntitlementSnapshot = UNKNOWN

/**
 * Publish the resolved entitlement. Returns a cleanup that restores the unknown
 * state, so a signed-out or unmounted app cannot leave a stale Pro reading
 * behind for the next user of the same tab.
 */
export function publishEntitlements(next: EntitlementSnapshot): () => void {
  snapshot = next
  return () => {
    if (snapshot === next) snapshot = UNKNOWN
  }
}

export function readEntitlements(): EntitlementSnapshot {
  return snapshot
}

/** Test seam: forget anything published. */
export function resetEntitlementBridge(): void {
  snapshot = UNKNOWN
}
