import { format, parseISO } from 'date-fns'
import { isoDateOffset, todayISO } from '@/lib/date'
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
 * Derive the streak straight from the tasks cache. NEVER WINDOWED BY PLAN.
 *
 * ── THIS FUNCTION USED TO TAKE A `cutoffDay`, AND THAT WAS A BUG ────────────
 *
 * It applied the Free history window to the streak, with the reasoning that a
 * limited plan "must be computed from exactly the days that plan can see". That
 * conflates two unrelated things. The history window is a DISPLAY limit on
 * completed-work surfaces; the streak is a MOTIVATION COUNTER derived from the
 * user's own tasks, every one of which is already in the cache on both plans.
 *
 * The effect was that a Free user who had planned every single day for three
 * months read "14-day streak" forever, and nothing anywhere said why. A
 * motivational counter that silently stops counting is worse than not having
 * one: it looks like the product forgot, and the one thing a streak must do is
 * be believed. It was also internally inconsistent, because the weekly review
 * has always called this without a cutoff, so Insights and Today disagreed
 * about the same number.
 *
 * The parameter is REMOVED rather than defaulted to null, so the coupling cannot
 * be reintroduced by a caller passing a cutoff it happens to have in scope,
 * which is exactly how it arrived. The streak is uncapped on every tier, and
 * `streak.test.ts` pins that.
 */
export function planningStreak(tasks: Task[], todayStr: string = todayISO()): StreakInfo {
  return computePlanningStreak(planningDaysFromTasks(tasks), todayStr)
}
