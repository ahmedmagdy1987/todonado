import { parseISO } from 'date-fns'
import type { FocusSession, Task } from '@/types/database'
import { DEFAULT_DAILY_CAPACITY_MINUTES } from '@/lib/config'
import { isoDateOffset } from '@/lib/date'
import { planningStreak, type StreakInfo } from '@/features/today/streak'
import {
  dailyEffortSeries,
  estimationBias,
  focusStats,
  lastNDays,
  type DailyPoint,
  type EstimationBias,
} from './insights'

/**
 * "Your week" review — a this-week-vs-last-week rollup derived ONLY from data the
 * app already has (tasks + focus_sessions). Pure, no React, no I/O — unit-tested.
 * Reuses the shared insight calculations (dailyEffortSeries / focusStats /
 * estimationBias) and the streak logic so there is one source of truth.
 *
 * Weeks are rolling 7-day windows: "this week" = the last 7 days ending today,
 * "last week" = the 7 days before that. Non-shaming by design — a down week is
 * reported neutrally, and below a minimal amount of data we show an encouraging
 * empty state instead of a chart.
 */

/** Days with any activity this week before we show the full review (else empty state). */
export const WEEKLY_MIN_DAYS = 2

export interface WeekMetrics {
  plannedMinutes: number
  completedMinutes: number
  completedCount: number
  focusMinutes: number
  /** completedMinutes / plannedMinutes, or null when nothing was planned. */
  completionRate: number | null
}

export interface WeeklyReview {
  /** Days this week that had any planned, completed, or focused work. */
  daysLogged: number
  hasEnoughData: boolean
  thisWeek: WeekMetrics
  lastWeek: WeekMetrics
  /** Per-day planned/completed effort for THIS week (7 points). */
  daily: DailyPoint[]
  /** The day this week with the most completed effort (null if none). */
  bestDay: { date: string; completedMinutes: number } | null
  streak: StreakInfo
  /** All-time estimation accuracy (robust sample); reused from insights. */
  bias: EstimationBias
  /** thisWeek.focusMinutes − lastWeek.focusMinutes. */
  focusDeltaMinutes: number
  /** thisWeek.completionRate − lastWeek.completionRate, or null if either is null. */
  completionRateDelta: number | null
}

function weekMetrics(tasks: Task[], sessions: FocusSession[], days: string[]): WeekMetrics {
  const set = new Set(days)
  let plannedMinutes = 0
  let completedMinutes = 0
  let completedCount = 0
  for (const t of tasks) {
    if (t.status === 'cancelled' || !t.scheduled_for || !set.has(t.scheduled_for)) continue
    const eff = t.effort_minutes ?? 0
    plannedMinutes += eff
    if (t.status === 'done') {
      completedMinutes += eff
      completedCount += 1
    }
  }
  const focus = focusStats(sessions, days)
  return {
    plannedMinutes,
    completedMinutes,
    completedCount,
    focusMinutes: Math.round(focus.focusSeconds / 60),
    completionRate: plannedMinutes > 0 ? completedMinutes / plannedMinutes : null,
  }
}

export function computeWeeklyReview(
  tasks: Task[],
  sessions: FocusSession[],
  capacityMinutes: number,
  todayStr: string,
): WeeklyReview {
  const capacity =
    Number.isFinite(capacityMinutes) && capacityMinutes > 0
      ? capacityMinutes
      : DEFAULT_DAILY_CAPACITY_MINUTES

  const thisWeekDays = lastNDays(7, todayStr)
  const lastWeekDays = lastNDays(7, isoDateOffset(-7, parseISO(todayStr)))

  const thisWeek = weekMetrics(tasks, sessions, thisWeekDays)
  const lastWeek = weekMetrics(tasks, sessions, lastWeekDays)
  const daily = dailyEffortSeries(tasks, thisWeekDays, capacity)

  const focusByDay = new Map(focusStats(sessions, thisWeekDays).daily.map((d) => [d.date, d.minutes]))
  const daysLogged = daily.filter(
    (d) => d.plannedMinutes > 0 || d.completedMinutes > 0 || (focusByDay.get(d.date) ?? 0) > 0,
  ).length

  let bestDay: { date: string; completedMinutes: number } | null = null
  for (const d of daily) {
    if (d.completedMinutes > 0 && (bestDay == null || d.completedMinutes > bestDay.completedMinutes)) {
      bestDay = { date: d.date, completedMinutes: d.completedMinutes }
    }
  }

  const focusDeltaMinutes = thisWeek.focusMinutes - lastWeek.focusMinutes
  const completionRateDelta =
    thisWeek.completionRate != null && lastWeek.completionRate != null
      ? thisWeek.completionRate - lastWeek.completionRate
      : null

  return {
    daysLogged,
    hasEnoughData: daysLogged >= WEEKLY_MIN_DAYS,
    thisWeek,
    lastWeek,
    daily,
    bestDay,
    streak: planningStreak(tasks, todayStr),
    bias: estimationBias(tasks, sessions),
    focusDeltaMinutes,
    completionRateDelta,
  }
}
