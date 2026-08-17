import { useEntitlements } from '@/features/billing/useEntitlements'
import { todayISO } from '@/lib/date'
import { historyCutoffDay } from './historyWindow'

export interface HistoryWindow {
  /** True when the current plan only sees a rolling window. */
  limited: boolean
  /** Earliest visible local day, or null for unlimited (Pro/Founding). */
  cutoffDay: string | null
  /** Window length in days — for copy ("30-day history"). */
  days: number
  /**
   * The plan is not known yet, so `limited` is a PLACEHOLDER and not an answer.
   *
   * Consumers that render a cutoff notice, a locked state or an upgrade prompt
   * must wait for this to be false. Consumers that only filter an array may use
   * `cutoffDay` immediately: see the note below for why that is safe here and
   * would not be safe for most paid capabilities.
   */
  resolving: boolean
}

/**
 * The current plan's history window.
 *
 * ── WHY THIS ONE FAILS OPEN WHILE RESOLVING, AND SAYS SO ───────────────────
 *
 * Every other paid surface in this app now fails CLOSED while the plan is
 * unknown: it renders a loader rather than either the paid layer or a paywall.
 * This one deliberately does not, and the reason is specific enough to be worth
 * writing down rather than treating as an exception to be tidied away later.
 *
 * The window is a FILTER OVER DATA THE SESSION ALREADY HOLDS. `useTasks` fetches
 * every row the user owns, on both plans, because Today, the capacity meter,
 * roll-over and auto-plan all need open tasks of any age. So there is no
 * request to withhold, nothing is fetched because of the plan, and the only
 * question is which of the user's OWN completed rows are painted. Failing
 * closed here would mean a paying subscriber watches their history blink out
 * and come back on every cold load, to protect a Free user from briefly seeing
 * their own old tasks. That trade is not worth making, and it protects nothing.
 *
 * What DOES fail closed is every consequence that is not just a filter:
 * `resolving` is exported so the cutoff card, the locked-history state and the
 * upgrade copy all wait for a real answer. Showing a Free user "history
 * continues on Pro" before the plan is known would be the actual defect, and on
 * the capped surfaces it is worse than cosmetic because the upsell writes an
 * `upgrade_intents` row that has no delete policy.
 *
 * ── NOTHING IS EVER DELETED ────────────────────────────────────────────────
 *
 * Upgrading reveals everything on the very next render: `cutoffDay` flips to
 * null and every windowing helper becomes an identity. Nothing is refetched or
 * rebuilt, because nothing was ever removed from the cache. The limit lives
 * purely in the view layer, on every tier, forever.
 */
export function useHistoryWindow(today: string = todayISO()): HistoryWindow {
  const { plan, resolving, limit } = useEntitlements()

  const days = limit('historyDays')
  // Pro's limit is Infinity, which is the same statement as "no cutoff".
  const limited = Number.isFinite(days) && plan !== 'pro'

  return {
    limited,
    cutoffDay: limited ? historyCutoffDay(days, today) : null,
    days,
    resolving,
  }
}
