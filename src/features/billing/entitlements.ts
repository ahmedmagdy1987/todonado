/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  THE ENTITLEMENT CONTRACT. ONE SOURCE OF TRUTH FOR WHAT EACH TIER GETS.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ── WHY THIS EXISTS ────────────────────────────────────────────────────────
 *
 * A product audit on 2026-08-17 read all 146 shipped capabilities and found the
 * commercial rules spread across at least five unrelated places:
 *
 *   · `usePlan()` at 16 call sites, each writing its own `isPro` branch
 *   · nine `FREE_*` integer constants in `src/lib/config.ts`
 *   · `capDecision` in `gate.ts`, used by five of the capped surfaces
 *   · one server-side check, in `api/calendar-fetch.ts`
 *   · two hand-maintained prose lists in `src/features/marketing/plans.ts`
 *
 * Nothing connected them, so they drifted, and the drift was not cosmetic. The
 * public pricing page claimed features that no gate produced; two Pro bullets
 * mapped to nothing in code at all; and the Free history window silently capped
 * the planning streak, which no copy anywhere disclosed.
 *
 * So the rules live here, once, as DATA. Every consumer asks this module.
 *
 * ── THIS IS A LEAF MODULE, AND THAT IS LOAD-BEARING ────────────────────────
 *
 * No imports. No `@/`, no `import.meta`, no browser globals. That is what lets
 * `api/**` import it by relative path (see tsconfig.api.json's include list,
 * the same pattern `planCore.ts` and `webhookMapping.ts` use) so the CLIENT
 * gate and the SERVER gate are the same table rather than two copies of it.
 * `src/lib/config.ts` re-exports the numbers under their historic names, so the
 * existing import sites keep working and there is still only one definition.
 *
 * ── THE THREE-STATE RULE ───────────────────────────────────────────────────
 *
 * Entitlement has THREE states, not two: `resolving`, `allowed`, `locked`.
 * Collapsing `resolving` into either of the others is the specific mistake this
 * module exists to make impossible:
 *
 *   collapse it into `allowed`  → a Free user is served the paid layer on every
 *                                 cold load (four surfaces did exactly this)
 *   collapse it into `locked`   → a paying subscriber is told they must upgrade,
 *                                 and on the capped surfaces that WROTE an
 *                                 `upgrade_intents` row with no delete policy
 *
 * `featureAccess` and `limitDecision` below are the only sanctioned way to ask,
 * and neither can return a verdict until the plan is actually known.
 */

/** The tiers that exist in code. "Team" is marketing copy only, not a plan. */
export type PlanTier = 'free' | 'pro'

/**
 * A capability whose availability DIFFERS BY TIER.
 *
 * The bar for being listed here: a real gate exists, or is added in the same
 * change. Anything available to everyone is deliberately absent rather than
 * present-and-true, so this list doubles as the answer to "what does Pro buy?"
 * and cannot quietly fill up with things that are free.
 */
export type Feature =
  /** The 7-day board: per-day capacity, drag between days, per-column capture. */
  | 'week.board'
  /** "Plan my week": distribute work across seven days without overloading one. */
  | 'week.autoPlan'
  /** The Insights dashboard: planned vs actual, capacity and focus trends. */
  | 'insights.dashboard'
  /** Estimate accuracy (estimation bias), wherever it is surfaced. */
  | 'insights.estimateAccuracy'
  /** The weekly review ("your week" against last week). */
  | 'insights.weeklyReview'
  /**
   * The points breakdown panel: where the score on Today came from.
   *
   * Kept Pro rather than freed, though it was a candidate. The SCORE and its
   * level band are free on Today; this is the audit trail behind them, it lives
   * on the Insights page, and it is part of that retrospective. It is
   * deliberately NOT sold on /pricing, so it is a quiet extra for subscribers
   * rather than a bullet that has to carry weight.
   */
  | 'insights.pointsBreakdown'
  /** Completed history beyond the Free rolling window. */
  | 'history.unlimited'
  /** A calendar URL that refreshes itself, server-side. */
  | 'calendar.liveSync'
  /** Recording a NEW voice note on today's journal entry. */
  | 'journal.voiceNotes'
  /** The daily briefing arriving with the day already planned, ready to accept. */
  | 'digest.preplannedDay'

/** A numeric ceiling. `UNLIMITED` is a legitimate value. */
export type LimitKey =
  | 'historyDays'
  | 'personalTemplates'
  | 'visionCards'
  | 'mindMaps'
  | 'quitHabits'
  | 'activeChallenges'
  | 'calendarSources'

export const UNLIMITED = Number.POSITIVE_INFINITY

export interface TierEntitlements {
  /** Only the features this tier HAS. Absent means locked. */
  readonly features: readonly Feature[]
  readonly limits: Readonly<Record<LimitKey, number>>
}

/**
 * ── THE CONTRACT ───────────────────────────────────────────────────────────
 *
 * FREE = EXPERIENCE THE SYSTEM. Plan a realistic day, focus on it, recover it,
 * forever, for nothing. Every capability that makes a single day work is here,
 * uncapped, including the capacity meter and the overbooking guard, which are
 * the product's actual differentiator. Capture is never capped: no limit exists
 * on tasks, projects, sections or subtasks, because capping capture punishes
 * exactly the behaviour the product is trying to encourage.
 *
 * PRO = RUN YOUR LIFE THROUGH THE SYSTEM. A second time horizon (the week), a
 * memory (unlimited history), an intelligence layer (Insights and estimate
 * accuracy), an integration (live calendar), and depth on the supporting tools.
 *
 * ── WHY THE FREE NUMBERS ARE WHAT THEY ARE ─────────────────────────────────
 *
 * They were all RAISED in this change, none lowered, so no existing account can
 * become newly over-limit and nobody loses access to anything they made:
 *
 *   history         14 → 30 days   14 was stingier than the product needed, and
 *                                  a month is where looking back starts to be
 *                                  worth paying for. Still a VIEW window:
 *                                  nothing is ever deleted on any tier.
 *   mind maps        1 → 3         A cap of 1 means the feature can only be
 *   quit habits      1 → 3         SAMPLED, never used. That is a demo, not a
 *                                  ladder, and one quit habit is not a product.
 *   templates        3 → 5         3 was hit before the value had landed.
 *   vision cards     3 → 5         Same.
 *   challenges       1 (kept)      One at a time is the point of a challenge.
 *
 * `calendarSources` is deliberately IDENTICAL on both tiers. It is an abuse
 * ceiling enforced by a database trigger, not a price lever, and the two must
 * not be confused: security caps protect the system, commercial caps shape the
 * offer. Nothing in this module may ever be used to relax the former.
 */
export const ENTITLEMENTS: Readonly<Record<PlanTier, TierEntitlements>> = {
  free: {
    features: [],
    limits: {
      historyDays: 30,
      personalTemplates: 5,
      visionCards: 5,
      mindMaps: 3,
      quitHabits: 3,
      activeChallenges: 1,
      calendarSources: 10,
    },
  },
  pro: {
    features: [
      'week.board',
      'week.autoPlan',
      'insights.dashboard',
      'insights.estimateAccuracy',
      'insights.weeklyReview',
      'insights.pointsBreakdown',
      'history.unlimited',
      'calendar.liveSync',
      'journal.voiceNotes',
      'digest.preplannedDay',
    ],
    limits: {
      historyDays: UNLIMITED,
      personalTemplates: UNLIMITED,
      visionCards: UNLIMITED,
      mindMaps: UNLIMITED,
      quitHabits: UNLIMITED,
      activeChallenges: UNLIMITED,
      calendarSources: 10,
    },
  },
}

/** Every feature key, for exhaustive tests and for the contract snapshot. */
export const ALL_FEATURES: readonly Feature[] = [
  'week.board',
  'week.autoPlan',
  'insights.dashboard',
  'insights.estimateAccuracy',
  'insights.weeklyReview',
  'insights.pointsBreakdown',
  'history.unlimited',
  'calendar.liveSync',
  'journal.voiceNotes',
  'digest.preplannedDay',
]

/** Every limit key, for the same reason. */
export const ALL_LIMITS: readonly LimitKey[] = [
  'historyDays',
  'personalTemplates',
  'visionCards',
  'mindMaps',
  'quitHabits',
  'activeChallenges',
  'calendarSources',
]

export const hasPro = (plan: PlanTier): boolean => plan === 'pro'

export function canUseFeature(plan: PlanTier, feature: Feature): boolean {
  return ENTITLEMENTS[plan].features.includes(feature)
}

export function getLimit(plan: PlanTier, key: LimitKey): number {
  return ENTITLEMENTS[plan].limits[key]
}

export const isUnlimited = (limit: number): boolean => !Number.isFinite(limit)

/* ═══════════════════════════════════════════════════════════════════════════
 *  RESOLUTION STATE — where "we do not know yet" is a first-class answer.
 * ═══════════════════════════════════════════════════════════════════════════ */

/**
 * `resolving` means the plan has not been established.
 *
 * On the client that is the `billing` query in flight. On the server it is the
 * one case `resolveServerEntitlement` reports as unavailable (a missing service
 * client, or a read that failed) — which must refuse the paid action rather
 * than guess, because guessing wrong in that direction is giving it away.
 */
export type EntitlementStatus = 'resolving' | 'resolved'

/** The verdict for one capability. Never boolean, so `resolving` cannot vanish. */
export type Access = 'resolving' | 'allowed' | 'locked'

/**
 * May this capability be used?
 *
 * FAILS CLOSED WHILE RESOLVING, in the strict sense: the answer is neither
 * "yes" nor "no" but "not yet", and the caller has to decide what to render for
 * it. That is the whole point. A component that wants a boolean has to say out
 * loud which way it is collapsing the third state, and every place that matters
 * now shows a loader instead.
 */
export function featureAccess(
  status: EntitlementStatus,
  plan: PlanTier,
  feature: Feature,
): Access {
  if (status !== 'resolved') return 'resolving'
  return canUseFeature(plan, feature) ? 'allowed' : 'locked'
}

/* ═══════════════════════════════════════════════════════════════════════════
 *  COUNT LIMITS — creation gates, and the grandfathering rule.
 * ═══════════════════════════════════════════════════════════════════════════ */

/** The three answers to "may they create another one?". */
export type LimitVerdict = 'resolving' | 'allowed' | 'atLimit'

export interface LimitInput {
  status: EntitlementStatus
  plan: PlanTier
  key: LimitKey
  /** How many they already have, including any create in flight. */
  count: number
  /** False while the feature's own list query is still loading. */
  countKnown: boolean
}

/**
 * Decide whether one more may be created.
 *
 * ── THE ORDER OF THE CHECKS IS THE INVARIANT ───────────────────────────────
 * Knowledge first, entitlement second, arithmetic last. `atLimit` is
 * unreachable unless BOTH the plan and the count are known, which is what stops
 * a paying subscriber from being shown a limit they paid to remove during the
 * one round trip before their billing row arrives.
 *
 * ── GRANDFATHERING IS THIS FUNCTION'S DEFAULT, NOT A SPECIAL CASE ──────────
 * The comparison is `count < limit`, so an account already ABOVE the limit is
 * simply refused a new one. Nothing is deleted, hidden, archived or degraded;
 * everything already made stays fully usable forever. That matters because a
 * limit that could reach backwards would make user data a monetisation lever,
 * which it must never be. (No account can become newly over-limit from this
 * change in any case: every Free number was raised, none lowered.)
 */
export function limitDecision({
  status,
  plan,
  key,
  count,
  countKnown,
}: LimitInput): LimitVerdict {
  if (status !== 'resolved' || !countKnown) return 'resolving'
  const limit = getLimit(plan, key)
  if (isUnlimited(limit)) return 'allowed'
  return count < limit ? 'allowed' : 'atLimit'
}

/** May the create affordance act? False while the answer is still unknown. */
export const canCreate = (input: LimitInput): boolean =>
  limitDecision(input) === 'allowed'

/**
 * May an at-limit upsell be shown?
 *
 * Only for a verdict that is actually `atLimit`. These upsells write an
 * `upgrade_intents` row, and that table has no delete policy by design, so
 * showing one on information that has not arrived is an unrecoverable write.
 */
export const shouldShowUpsell = (input: LimitInput): boolean =>
  limitDecision(input) === 'atLimit'

/**
 * Is this account over a limit it is now under the ceiling for?
 *
 * Purely for honest COPY ("you have 6 of 5; nothing has been removed"). It is
 * never an input to whether anything is allowed, and it must never become one.
 */
export function isGrandfathered({
  plan,
  key,
  count,
}: {
  plan: PlanTier
  key: LimitKey
  count: number
}): boolean {
  const limit = getLimit(plan, key)
  return Number.isFinite(limit) && count > limit
}
