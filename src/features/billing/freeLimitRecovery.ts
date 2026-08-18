import { getLimit, type EntitlementStatus, type LimitKey, type PlanTier } from './entitlements'
import { parseEntitlementError } from './entitlementError'
import { LIMIT_LABELS, UPGRADE_COPY } from './upgradeCopy'

/**
 * WHAT TO DO WHEN THE SERVER REFUSES A CREATE ON COMMERCIAL GROUNDS.
 *
 * Pure, so the whole decision can be tested without a component, a router or a
 * database. The wiring in `src/lib/queryClient.ts` does nothing but render what
 * this returns.
 *
 * ── THE SERVER IS AUTHORITATIVE, THE CLIENT IS THE ONE WHO EXPLAINS ────────
 *
 * The UI gate normally stops a user before they get here, so every arrival is
 * one of the cases the gate cannot cover: two tabs creating at once, a stale
 * count, a late realtime update, another device taking the last slot, or a
 * direct call that skipped the gate entirely. In all of them the database is
 * right and the local count was wrong, so the answer is never to retry — it is
 * to explain. Retry is separately suppressed at the mutation (`meta.noRetry` on
 * all four inserts), so nothing re-attempts a refused write on its own.
 */
export type FreeLimitOutcome =
  /** A Free account at its ceiling. Explain the limit and offer the upgrade. */
  | { kind: 'upgrade'; feature: LimitKey; cap: number; message: string }
  /**
   * The client believes this user is Pro and the server applied a Free limit.
   *
   * That is entitlement drift, not a sale. It happens if `billing` disagrees
   * with what the client resolved — most plausibly a Pro grant that exists only
   * client-side (the founding allowlist resolves Pro with no billing row, while
   * `public.effective_plan` reads nothing but that table). Telling this person
   * to upgrade would be asking a customer to pay twice for a bug on our side.
   */
  | { kind: 'inconsistent'; feature: LimitKey; serverCap: number; plan: PlanTier }
  /**
   * A limit error arrived before the plan resolved.
   *
   * Deliberately NOT treated as an upgrade prompt. `ProUpgradeNotice` already
   * documents why this app refuses to show a paid prompt on an unresolved plan
   * — the click records an `upgrade_intents` row and that table has no delete
   * policy — and the same reasoning applies harder here, where the prompt would
   * be raised automatically rather than by the user opening a page. The
   * ordinary error runs instead; the next attempt, with the plan resolved, gets
   * the real message.
   */
  | { kind: 'unresolved'; feature: LimitKey }

/**
 * `null` means "this was not a commercial limit" — a real database error, a
 * permission failure or a dropped connection — and the caller must fall through
 * to its normal error handling. Nothing here ever swallows a genuine error.
 */
export function resolveFreeLimitOutcome(
  error: unknown,
  entitlement: { status: EntitlementStatus; plan: PlanTier },
): FreeLimitOutcome | null {
  const parsed = parseEntitlementError(error)
  if (!parsed) return null

  const { feature, cap: serverCap } = parsed

  if (entitlement.status === 'resolving') return { kind: 'unresolved', feature }
  if (entitlement.plan === 'pro') {
    return { kind: 'inconsistent', feature, serverCap, plan: entitlement.plan }
  }

  /*
   * THE NUMBER SHOWN COMES FROM THE ENTITLEMENT TABLE, NOT FROM THE ERROR.
   *
   * `sqlLimitContract.test.ts` reads the caps out of the migration and asserts
   * each one equals `ENTITLEMENTS.free.limits`, so the two agree by test rather
   * than by hope. Rendering the client's copy keeps one source of truth for
   * every number the user sees — the page's own limit card already uses it — so
   * a limit can never be described one way in a card and another in a toast.
   * The server's figure is still carried on the parsed error, which is what
   * makes a divergence show up in the drift diagnostic instead of on screen.
   */
  const cap = getLimit('free', feature)

  return { kind: 'upgrade', feature, cap, message: freeLimitMessage(feature, cap) }
}

/**
 * The sentence a user reads when a create is refused.
 *
 * Three facts, in the order someone needs them: which ceiling they hit, that
 * nothing they already made is affected, and that Pro lifts it. The middle one
 * is not written here — it is `UPGRADE_COPY[feature].reassurance`, the same
 * sentence the limit card on the page uses, so the reassuring half cannot drift
 * apart from the selling half or go missing on one surface out of five.
 *
 * No urgency, no scarcity, no deletion, and no instruction to remove anything:
 * the cap gates creation only and every existing row is untouched, which is
 * exactly what the database does and therefore exactly what this may say.
 */
export function freeLimitMessage(feature: LimitKey, cap: number): string {
  const { items } = LIMIT_LABELS[feature]
  const reassurance = UPGRADE_COPY[feature].reassurance
  const head = `You've reached the ${cap} ${items} included with Free.`
  return [head, reassurance, 'Pro removes this limit.'].filter(Boolean).join(' ')
}

/**
 * What gets logged when a Pro user is refused on Free grounds.
 *
 * Console rather than the analytics table on purpose: `AnalyticsEvent` is a
 * closed union backing a real `events` table, and this is a fault report, not a
 * product measurement. It should be loud where a developer will see it and cost
 * a customer nothing.
 */
export function driftDiagnostics(outcome: Extract<FreeLimitOutcome, { kind: 'inconsistent' }>): {
  message: string
  detail: Record<string, unknown>
} {
  return {
    message: '[entitlement] server applied a Free limit to a client-resolved Pro account',
    detail: {
      feature: outcome.feature,
      serverCap: outcome.serverCap,
      clientPlan: outcome.plan,
      clientCap: getLimit(outcome.plan, outcome.feature),
      hint: 'public.effective_plan reads public.billing only, so a client-only Pro grant will not be seen by the trigger',
    },
  }
}
