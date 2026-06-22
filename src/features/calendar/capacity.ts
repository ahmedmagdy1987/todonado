import { computeCapacity, type CapacitySummary } from '@/features/today/capacity'

/**
 * Calendar-aware capacity — an EXTENSION of the core meter math, not a rewrite.
 * Today's calendar busy-minutes consume capacity the SAME way scheduled task
 * effort does, so the honest free time = capacity − (task effort + meetings).
 *
 * We model that by feeding (taskMinutes + busyMinutes) as the "planned" total
 * into the UNCHANGED `computeCapacity`, against the user's raw daily capacity —
 * so status / over / free / pct all stay correct and the capacity editor still
 * edits the raw number. `effectiveCapacity` is the room left for TASKS after
 * meetings, which auto-plan-my-day (3B) plans within.
 */
export interface CalendarCapacity {
  /** computeCapacity(taskMinutes + busyMinutes, rawCapacity) — drives the meter. */
  summary: CapacitySummary
  /** Scheduled task effort (clamped >= 0). */
  taskMinutes: number
  /** Today's calendar busy minutes (clamped >= 0). */
  busyMinutes: number
  /** Capacity left for TASKS after meetings: max(0, rawCapacity − busy). */
  effectiveCapacity: number
}

export function withCalendar(
  taskMinutes: number,
  capacityMinutes: number,
  busyMinutes: number,
): CalendarCapacity {
  const tasks = Math.max(0, Math.round(Number.isFinite(taskMinutes) ? taskMinutes : 0))
  const busy = Math.max(0, Math.round(Number.isFinite(busyMinutes) ? busyMinutes : 0))
  const summary = computeCapacity(tasks + busy, capacityMinutes)
  const effectiveCapacity = Math.max(0, summary.capacityMinutes - busy)
  return { summary, taskMinutes: tasks, busyMinutes: busy, effectiveCapacity }
}
