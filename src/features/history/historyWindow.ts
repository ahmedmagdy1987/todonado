import { format, parseISO } from 'date-fns'
import { isoDateOffset, todayISO } from '@/lib/date'
import type { Task } from '@/types/database'

/**
 * Pure history-window math for the Free plan's rolling history limit. No React,
 * no I/O — fully unit-tested.
 *
 * THIS IS A VIEW LIMIT, NOT A DATA LIMIT. Nothing is ever deleted or mutated;
 * these helpers only decide what a Free plan renders. Pass `cutoffDay = null`
 * (what Pro/Founding get) and every function below is an identity — which is
 * why upgrading reveals everything on the very next render.
 *
 * TIMEZONE + DST: every comparison is done on LOCAL CALENDAR DAY strings
 * (`yyyy-MM-dd`), and the cutoff is derived by calendar-day arithmetic
 * (`setDate`), never by subtracting `days * 24h`. A DST transition shortens or
 * lengthens a day by an hour but never changes which calendar day something
 * falls on, so the window is exactly N days across a DST boundary too.
 */

/**
 * The earliest local day still INSIDE the window, inclusive.
 *
 * The window spans `days` calendar days **counting today**, so with the default
 * 14 a task completed 13 days ago is visible and one completed 14 days ago is
 * not — i.e. "14 days of history" is literally 14 distinct days.
 */
export function historyCutoffDay(days: number, today: string = todayISO()): string {
  const span = Math.max(1, Math.floor(days))
  try {
    return isoDateOffset(-(span - 1), parseISO(today))
  } catch {
    return today
  }
}

/** Local calendar day (`yyyy-MM-dd`) for a timestamptz, or null when absent/unparseable. */
export function localDay(ts: string | null | undefined): string | null {
  if (!ts) return null
  try {
    const day = format(parseISO(ts), 'yyyy-MM-dd')
    return day === 'Invalid Date' ? null : day
  } catch {
    return null
  }
}

/**
 * Is this completion timestamp inside the window?
 *
 * `cutoffDay = null` means unlimited (Pro). An UNDATED completion is treated as
 * visible on purpose: we hide history only when we can actually prove it is old,
 * so a missing `completed_at` can never make a task silently vanish.
 */
export function isWithinHistoryWindow(
  completedAt: string | null | undefined,
  cutoffDay: string | null,
): boolean {
  if (cutoffDay == null) return true
  const day = localDay(completedAt)
  if (day == null) return true
  return day >= cutoffDay
}

export interface WindowedTasks {
  /** What the current plan may render. */
  visible: Task[]
  /** How many COMPLETED tasks were withheld (0 ⇒ never show a cutoff card). */
  hiddenCount: number
}

/**
 * Apply the window to a task list.
 *
 * ONLY completed tasks are ever withheld. An open task is always visible no
 * matter how old it is — a to-do from three months ago still shows, still
 * plans, still rolls over. That invariant is the whole point of the limit being
 * "history" rather than "your data", and it is pinned in the tests.
 */
export function windowTaskHistory(tasks: Task[], cutoffDay: string | null): WindowedTasks {
  if (cutoffDay == null) return { visible: tasks, hiddenCount: 0 }

  const visible: Task[] = []
  let hiddenCount = 0
  for (const task of tasks) {
    if (task.status !== 'done' || isWithinHistoryWindow(task.completed_at, cutoffDay)) {
      visible.push(task)
    } else {
      hiddenCount += 1
    }
  }
  return { visible, hiddenCount }
}

/**
 * Restrict a set of local day keys to the window — used so trend/streak maths on
 * a FREE-visible surface is computed from exactly the data that plan can see,
 * never silently from hidden history.
 */
export function windowDayKeys(days: Set<string>, cutoffDay: string | null): Set<string> {
  if (cutoffDay == null) return days
  const kept = new Set<string>()
  for (const day of days) if (day >= cutoffDay) kept.add(day)
  return kept
}
