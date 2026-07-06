import { differenceInCalendarDays, format, parseISO } from 'date-fns'
import type { FocusSession, Task } from '@/types/database'
import { DEFAULT_DAILY_CAPACITY_MINUTES } from '@/lib/config'
import { isoDateOffset } from '@/lib/date'
import { computeCapacity, type CapacityStatus } from '@/features/today/capacity'

/**
 * Pure, unit-tested insight calculations. Everything here is derived ONLY from
 * data that actually exists (tasks: effort_minutes / scheduled_for / status /
 * completed_at; focus_sessions: started_at / actual_seconds / interruptions /
 * status). No fabricated metrics. All functions take an injected `todayStr`
 * (yyyy-MM-dd) so they are deterministic and testable.
 *
 * Date keying:
 *  - `scheduled_for` / `due_date` are `yyyy-MM-dd` date strings (timezone-free,
 *    compared as strings).
 *  - `started_at` / `completed_at` are timestamptz; bucket them to the LOCAL day
 *    with `dayKey` (same approach as focus/selectors `sessionsOn`).
 *
 * Known, honest limitation: there is no scheduling-history table, so a task's
 * `scheduled_for` reflects its CURRENT planned day. Past-day "planned" therefore
 * reflects what is still anchored to that day, and the roll-over "slipped" metric
 * (done after the planned day) is a conservative lower bound. We never overstate.
 */

export const INSIGHTS_WINDOW_DAYS = 14
export const INSIGHTS_SUMMARY_DAYS = 7
/** Minimum estimate-vs-actual samples before we show an estimation-bias figure. */
export const ESTIMATION_MIN_SAMPLES = 5
/** Inside ±this %, estimates are reported as "on the mark" rather than under/over. */
export const ESTIMATION_ACCURATE_PCT = 5

export interface DailyPoint {
  /** yyyy-MM-dd */
  date: string
  /** Sum of effort for tasks scheduled for this day (the plan). */
  plannedMinutes: number
  /** Of the planned tasks, the effort that is done (actual completed). */
  completedMinutes: number
  /** plannedMinutes / capacity, as a 0..n percentage. */
  capacityPct: number
  status: CapacityStatus
}

export interface FocusStats {
  /** Finished (completed + abandoned) sessions in the window. */
  sessionCount: number
  focusSeconds: number
  interruptions: number
  completedSessions: number
  abandonedSessions: number
  /** completed / (completed + abandoned), or null when nothing has finished. */
  completionRate: number | null
  /** Per-day focus minutes across the window (chronological). */
  daily: { date: string; minutes: number }[]
}

export interface RolloverStats {
  /** Open tasks scheduled before today (the live overflow backlog). */
  overdueCount: number
  /** Age in days of the oldest overdue task (0 when none). */
  oldestOverdueDays: number
  /** Done tasks that had both a planned day and a completion timestamp. */
  completedWithPlan: number
  /** Of those, how many finished after their planned day (slipped). */
  slippedCount: number
  /** slippedCount / completedWithPlan, or null when no basis. */
  slippedRatio: number | null
  /** (completedWithPlan - slippedCount) / completedWithPlan, or null. */
  onTimeRatio: number | null
}

export interface InsightsSummary {
  days: number
  plannedMinutes: number
  completedMinutes: number
  completedCount: number
  focusSeconds: number
}

/** One completed task's estimate vs the focus time actually spent on it. */
export interface EstimationSample {
  taskId: string
  title: string
  estimateMin: number
  actualMin: number
  /** actualMin / estimateMin. >1 = took longer than estimated (under-estimated). */
  ratio: number
}

export interface EstimationBias {
  /** Completed tasks that have BOTH an estimate and real focused time. */
  sampleCount: number
  minSamples: number
  /** True once there are enough samples to report a figure. */
  hasEnough: boolean
  /** Median(actual/estimate) across samples, or null below threshold. */
  medianRatio: number | null
  /** round((medianRatio - 1) * 100). Positive = under-estimate, negative = over. */
  biasPct: number | null
  direction: 'under' | 'over' | 'accurate' | null
  /** Largest-miss samples first, capped for display. */
  samples: EstimationSample[]
}

export interface InsightsData {
  today: string
  windowDays: number
  capacityMinutes: number
  daily: DailyPoint[]
  /** Days in the window that had any planned effort. */
  planningDays: number
  /** Average capacity % across planning days (0 when none). */
  capacityAvgPct: number
  /** Planning days that exceeded capacity. */
  daysOverCapacity: number
  focus: FocusStats
  rollover: RolloverStats
  summary: InsightsSummary
  /** Estimation accuracy: how the user's estimates compare to real focus time. */
  estimation: EstimationBias
  /** Whether there is enough real data to show charts (else: empty state). */
  hasData: boolean
}

/** Median of a non-empty list (sorted copy; averages the middle pair if even). */
function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

/**
 * The user's estimation bias: median(actual focus / estimated effort) over
 * COMPLETED tasks that carry both an `effort_minutes` estimate and real focused
 * time (`focus_sessions.actual_seconds`). Restricting to done tasks keeps the
 * comparison fair — partial progress would understate "actual". The median (not
 * mean) is robust to the occasional wildly-off task. No window: more history =
 * a better estimate, and this is the compounding reason to keep estimating.
 */
export function estimationBias(
  tasks: Task[],
  sessions: FocusSession[],
  opts: { minSamples?: number } = {},
): EstimationBias {
  const minSamples = opts.minSamples ?? ESTIMATION_MIN_SAMPLES
  const actualByTask = new Map<string, number>()
  for (const s of sessions) {
    if (!s.task_id || s.status === 'running') continue // unfinished = no actual yet
    actualByTask.set(s.task_id, (actualByTask.get(s.task_id) ?? 0) + s.actual_seconds)
  }

  const samples: EstimationSample[] = []
  for (const t of tasks) {
    if (t.status !== 'done') continue
    const est = t.effort_minutes
    if (est == null || est <= 0) continue
    const actualSec = actualByTask.get(t.id) ?? 0
    if (actualSec <= 0) continue
    const actualMin = actualSec / 60
    samples.push({
      taskId: t.id,
      title: t.title,
      estimateMin: est,
      actualMin: Math.round(actualMin),
      ratio: actualMin / est,
    })
  }

  const sampleCount = samples.length
  const hasEnough = sampleCount >= minSamples
  const medianRatio = sampleCount > 0 ? median(samples.map((s) => s.ratio)) : null
  const biasPct = medianRatio != null ? Math.round((medianRatio - 1) * 100) : null
  const direction =
    biasPct == null
      ? null
      : biasPct > ESTIMATION_ACCURATE_PCT
        ? 'under'
        : biasPct < -ESTIMATION_ACCURATE_PCT
          ? 'over'
          : 'accurate'
  const display = [...samples]
    .sort((a, b) => Math.abs(b.ratio - 1) - Math.abs(a.ratio - 1))
    .slice(0, 5)

  return { sampleCount, minSamples, hasEnough, medianRatio, biasPct, direction, samples: display }
}

/** Chronological list of the last `n` local days ending today (yyyy-MM-dd). */
export function lastNDays(n: number, todayStr: string): string[] {
  const base = parseISO(todayStr)
  const days: string[] = []
  for (let i = n - 1; i >= 0; i--) days.push(isoDateOffset(-i, base))
  return days
}

/** Bucket a timestamptz to a local `yyyy-MM-dd`, or null if unparseable. */
function dayKey(ts: string | null): string | null {
  if (!ts) return null
  try {
    return format(parseISO(ts), 'yyyy-MM-dd')
  } catch {
    return null
  }
}

/** Planned vs completed effort + capacity % for each day in `dayList`. */
export function dailyEffortSeries(
  tasks: Task[],
  dayList: string[],
  capacityMinutes: number,
): DailyPoint[] {
  const planned = new Map<string, number>()
  const completed = new Map<string, number>()
  for (const t of tasks) {
    if (t.status === 'cancelled' || !t.scheduled_for) continue
    const eff = t.effort_minutes ?? 0
    planned.set(t.scheduled_for, (planned.get(t.scheduled_for) ?? 0) + eff)
    if (t.status === 'done') {
      completed.set(t.scheduled_for, (completed.get(t.scheduled_for) ?? 0) + eff)
    }
  }
  return dayList.map((date) => {
    const p = planned.get(date) ?? 0
    const c = completed.get(date) ?? 0
    const cap = computeCapacity(p, capacityMinutes)
    return { date, plannedMinutes: p, completedMinutes: c, capacityPct: cap.pct, status: cap.status }
  })
}

/** Focus aggregates + per-day focus minutes over the window. */
export function focusStats(sessions: FocusSession[], dayList: string[]): FocusStats {
  const windowSet = new Set(dayList)
  const secondsByDay = new Map<string, number>()
  let focusSeconds = 0
  let interruptions = 0
  let completedSessions = 0
  let abandonedSessions = 0
  for (const s of sessions) {
    if (s.status === 'running') continue // not a finished session
    const day = dayKey(s.started_at)
    if (!day || !windowSet.has(day)) continue
    focusSeconds += s.actual_seconds
    interruptions += s.interruptions
    if (s.status === 'completed') completedSessions += 1
    else if (s.status === 'abandoned') abandonedSessions += 1
    // Accumulate raw seconds and round ONCE per day (below), not per session — else
    // many sub-minute sessions each round to 0 and the daily chart diverges from the
    // exact focusSeconds total (matches this file's single-round convention elsewhere).
    secondsByDay.set(day, (secondsByDay.get(day) ?? 0) + s.actual_seconds)
  }
  const sessionCount = completedSessions + abandonedSessions
  return {
    sessionCount,
    focusSeconds,
    interruptions,
    completedSessions,
    abandonedSessions,
    completionRate: sessionCount > 0 ? completedSessions / sessionCount : null,
    daily: dayList.map((date) => ({ date, minutes: Math.round((secondsByDay.get(date) ?? 0) / 60) })),
  }
}

/** Live overflow backlog + conservative "slipped past plan" rate. */
export function rolloverStats(tasks: Task[], todayStr: string): RolloverStats {
  let overdueCount = 0
  let oldest: string | null = null
  let completedWithPlan = 0
  let slippedCount = 0
  for (const t of tasks) {
    if (
      (t.status === 'todo' || t.status === 'in_progress') &&
      t.scheduled_for &&
      t.scheduled_for < todayStr
    ) {
      overdueCount += 1
      if (oldest == null || t.scheduled_for < oldest) oldest = t.scheduled_for
    }
    if (t.status === 'done' && t.scheduled_for) {
      const done = dayKey(t.completed_at)
      if (done) {
        completedWithPlan += 1
        if (done > t.scheduled_for) slippedCount += 1
      }
    }
  }
  const oldestOverdueDays = oldest
    ? Math.max(0, differenceInCalendarDays(parseISO(todayStr), parseISO(oldest)))
    : 0
  return {
    overdueCount,
    oldestOverdueDays,
    completedWithPlan,
    slippedCount,
    slippedRatio: completedWithPlan > 0 ? slippedCount / completedWithPlan : null,
    onTimeRatio: completedWithPlan > 0 ? (completedWithPlan - slippedCount) / completedWithPlan : null,
  }
}

/** Totals for the last `days` days (the summary header). */
export function summaryFor(
  tasks: Task[],
  sessions: FocusSession[],
  days: number,
  todayStr: string,
): InsightsSummary {
  const windowSet = new Set(lastNDays(days, todayStr))
  let plannedMinutes = 0
  let completedMinutes = 0
  let completedCount = 0
  for (const t of tasks) {
    if (t.status === 'cancelled' || !t.scheduled_for || !windowSet.has(t.scheduled_for)) continue
    const eff = t.effort_minutes ?? 0
    plannedMinutes += eff
    if (t.status === 'done') {
      completedMinutes += eff
      completedCount += 1
    }
  }
  const focus = focusStats(sessions, lastNDays(days, todayStr))
  return { days, plannedMinutes, completedMinutes, completedCount, focusSeconds: focus.focusSeconds }
}

/** Orchestrate every insight from the workspace's tasks + focus sessions. */
export function computeInsights(
  tasks: Task[],
  sessions: FocusSession[],
  capacityMinutes: number,
  todayStr: string,
  opts: { windowDays?: number; summaryDays?: number; minSamples?: number } = {},
): InsightsData {
  const windowDays = opts.windowDays ?? INSIGHTS_WINDOW_DAYS
  const summaryDays = opts.summaryDays ?? INSIGHTS_SUMMARY_DAYS
  // Mirror computeCapacity/planDay: reject non-finite (Infinity/NaN) as well as
  // <= 0, so every derived figure (per-day pct, avg, over-count) is computed
  // against the same capacity rather than a mix of Infinity and the DEFAULT.
  const capacity =
    Number.isFinite(capacityMinutes) && capacityMinutes > 0
      ? capacityMinutes
      : DEFAULT_DAILY_CAPACITY_MINUTES
  const dayList = lastNDays(windowDays, todayStr)
  const daily = dailyEffortSeries(tasks, dayList, capacity)
  const planning = daily.filter((d) => d.plannedMinutes > 0)
  // Average the raw planned/capacity ratio across planning days (single round),
  // not the already-rounded per-day percentages, to avoid double-rounding drift.
  const capacityAvgPct = planning.length
    ? Math.round(
        (planning.reduce((s, d) => s + d.plannedMinutes, 0) / (planning.length * capacity)) * 100,
      )
    : 0
  const daysOverCapacity = planning.filter((d) => d.plannedMinutes > capacity).length
  const focus = focusStats(sessions, dayList)
  const rollover = rolloverStats(tasks, todayStr)
  const summary = summaryFor(tasks, sessions, summaryDays, todayStr)
  // Estimation bias spans ALL history (not the window) for the largest sample.
  const estimation = estimationBias(tasks, sessions, { minSamples: opts.minSamples })

  const hasData =
    focus.sessionCount > 0 ||
    rollover.completedWithPlan > 0 ||
    rollover.overdueCount > 0 ||
    daily.some((d) => d.plannedMinutes > 0)

  return {
    today: todayStr,
    windowDays,
    capacityMinutes: capacity,
    daily,
    planningDays: planning.length,
    capacityAvgPct,
    daysOverCapacity,
    focus,
    rollover,
    summary,
    estimation,
    hasData,
  }
}
