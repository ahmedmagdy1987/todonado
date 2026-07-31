/**
 * One answer to "may this user create another one?" — and the rule that a
 * not-yet-known answer is NOT a no.
 *
 * ── WHY THIS MODULE EXISTS ───────────────────────────────────────────────────
 * `usePlan` FAILS CLOSED: while the `billing` query is pending it returns
 * `isPro: false`, so for the length of one round trip a paying subscriber is
 * indistinguishable from a Free user. `billingLoading` is the only thing that
 * tells them apart, and six cap surfaces never read it.
 *
 * The result was not a flicker. `MindMapsPage` had already learned half of this
 * lesson — its comment reads "a cap computed from data that has not arrived is
 * not a cap" — but `countKnown` folded only the feature's OWN list query and
 * never the plan. So a Pro user sitting at the Free limit was told, on every
 * cold load, that they had hit a limit they had paid to remove; and the Upgrade
 * link under that message writes an `upgrade_intents` row that has NO DELETE
 * POLICY. A UI glitch that cannot be undone is not a UI glitch.
 *
 * ── THE RULE ─────────────────────────────────────────────────────────────────
 * A cap has THREE answers, not two. `unknown` is a real state and must never be
 * collapsed into `capped`: nothing may be refused, no upsell may render, and
 * above all nothing may be WRITTEN, until both the plan and the count are in.
 */

/** The three answers. `unknown` is not a soft `capped`. */
export type CapDecision = 'unknown' | 'allowed' | 'capped'

export interface CapInput {
  /** False while the billing query is still in flight (`billingLoading`). */
  planKnown: boolean
  /** False while the feature's own list query is still in flight. */
  countKnown: boolean
  isPro: boolean
  /** How many the user already has, including any create in flight. */
  count: number
  /** The Free limit for this surface (`FREE_*` in src/lib/config.ts). */
  limit: number
}

/**
 * Decide whether one more may be created.
 *
 * The order of the checks IS the invariant: knowledge first, entitlement
 * second, arithmetic last. `capped` is unreachable unless both inputs are
 * known, which is the property `gate.test.ts` proves exhaustively.
 */
export function capDecision({
  planKnown,
  countKnown,
  isPro,
  count,
  limit,
}: CapInput): CapDecision {
  if (!planKnown || !countKnown) return 'unknown'
  if (isPro) return 'allowed'
  return count < limit ? 'allowed' : 'capped'
}

/** May the create affordance be used? False while the answer is still unknown. */
export function canCreate(input: CapInput): boolean {
  return capDecision(input) === 'allowed'
}

/**
 * May a Free-limit upsell be shown — and, with it, the intent row that cannot
 * be deleted? Only for a decision that is actually `capped`.
 */
export function shouldShowUpsell(input: CapInput): boolean {
  return capDecision(input) === 'capped'
}
