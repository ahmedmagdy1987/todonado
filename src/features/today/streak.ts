import { format, parseISO } from 'date-fns'
import { isoDateOffset, todayISO } from '@/lib/date'
import { windowDayKeys } from '@/features/history/historyWindow'
import type { Task } from '@/types/database'

/**
 * Planning streak — consecutive LOCAL days the user "showed up and planned".
 * Pure, no React, no I/O — fully unit-tested. Derived from the tasks already in
 * cache (no new table, no extra fetch).
 *
 * WHAT COUNTS AS A PLANNED DAY: a local day with at least one task SCHEDULED for
 * it (scheduled_for) OR at least one task COMPLETED on it (completed_at). Either
 * signal means the user engaged with their day. completed_at is durable; a
 * scheduled day reflects the CURRENT plan (a task rolled to another day no longer
 * marks the old day) — an accepted, honest approximation (same caveat insights.ts
 * documents). Same-day idempotent (it's a Set of day keys; recomputing can't
 * double-count or reset).
 */
export interface StreakInfo {
  /** Consecutive planning days ending today — or yesterday if today isn't planned yet. */
  count: number
  /** Whether today already counts (vs. today being the open "grace" day). */
  includesToday: boolean
}

const GUARD = 3660 // ~10 years — bounds the backward walk

/** Local day key (yyyy-MM-dd) for a timestamptz, or null. */
function localDayKey(ts: string | null): string | null {
  if (!ts) return null
  try {
    return format(parseISO(ts), 'yyyy-MM-dd')
  } catch {
    return null
  }
}

/** The set of local days that count as "planned" (scheduled-for OR completed-on). */
export function planningDaysFromTasks(tasks: Task[]): Set<string> {
  const days = new Set<string>()
  for (const t of tasks) {
    if (t.scheduled_for) days.add(t.scheduled_for)
    if (t.status === 'done') {
      const d = localDayKey(t.completed_at)
      if (d) days.add(d)
    }
  }
  return days
}

const prevDay = (dayStr: string): string => isoDateOffset(-1, parseISO(dayStr))

/**
 * Consecutive-day streak ending at today. A "grace" day is allowed: if today
 * isn't a planning day yet but yesterday was, the streak still stands (it only
 * breaks after a FULL missed day) — so a not-yet-planned today is never punished.
 */
export function computePlanningStreak(planningDays: Set<string>, todayStr: string): StreakInfo {
  let anchor: string
  let includesToday: boolean
  if (planningDays.has(todayStr)) {
    anchor = todayStr
    includesToday = true
  } else if (planningDays.has(prevDay(todayStr))) {
    anchor = prevDay(todayStr)
    includesToday = false
  } else {
    return { count: 0, includesToday: false }
  }

  let count = 0
  let day = anchor
  for (let i = 0; i < GUARD && planningDays.has(day); i++) {
    count += 1
    day = prevDay(day)
  }
  return { count, includesToday }
}

/**
 * Convenience: derive the streak straight from the tasks cache.
 *
 * `cutoffDay` applies the plan's history window (null = unlimited). The streak
 * badge is a FREE-visible surface, so on a limited plan it must be computed from
 * exactly the days that plan can see — never silently from history the user has
 * been told is out of view. A Free streak therefore tops out at the window
 * length, which is honest: it reflects the data they actually have.
 */
export function planningStreak(
  tasks: Task[],
  todayStr: string = todayISO(),
  cutoffDay: string | null = null,
): StreakInfo {
  return computePlanningStreak(
    windowDayKeys(planningDaysFromTasks(tasks), cutoffDay),
    todayStr,
  )
}
