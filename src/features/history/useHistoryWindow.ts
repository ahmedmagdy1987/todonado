import { usePlan } from '@/features/billing/usePlan'
import { FREE_HISTORY_DAYS } from '@/lib/config'
import { todayISO } from '@/lib/date'
import { historyCutoffDay } from './historyWindow'

export interface HistoryWindow {
  /** True when the current plan only sees a rolling window. */
  limited: boolean
  /** Earliest visible local day, or null for unlimited (Pro/Founding). */
  cutoffDay: string | null
  /** Window length in days — for copy ("14-day history"). */
  days: number
}

/**
 * The current plan's history window. Resolves the plan through the existing
 * `usePlan()` — no new gate.
 *
 * Because the plan comes from a live query, upgrading reveals everything on the
 * very next render: `cutoffDay` flips to null and every windowing helper becomes
 * an identity. Nothing is refetched or rebuilt, because nothing was ever removed
 * from the cache — the limit lives purely in the view layer.
 *
 * WHILE THE PLAN IS STILL LOADING WE DO NOT LIMIT. A paying user must never
 * watch their history blink out and come back; a Free user seeing the cutoff
 * card arrive a beat late is much the better failure mode.
 */
export function useHistoryWindow(today: string = todayISO()): HistoryWindow {
  const { isPro, billingLoading } = usePlan()
  const limited = !isPro && !billingLoading

  return {
    limited,
    cutoffDay: limited ? historyCutoffDay(FREE_HISTORY_DAYS, today) : null,
    days: FREE_HISTORY_DAYS,
  }
}
