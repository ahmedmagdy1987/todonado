import type { FocusSession, Task } from '@/types/database'
import { POINT_WEIGHTS, POINTS_WINDOW_DAYS } from '@/lib/config'
import { lastNDays } from '@/features/insights/insights'

/**
 * Points — a derived score, never a stored one.
 *
 * NO TABLE, NO COLUMN, NO COUNTER. Every point is recomputed from rows the app
 * already has in cache, the same way the planning streak is. That means points
 * can never drift out of step with the work they describe, a correction to a
 * task instantly corrects the score, and there is nothing to migrate or repair.
 *
 * ── THE THREE RULES THIS FOLLOWS ─────────────────────────────────────────────
 *
 * 1. IT IS A ROLLING WINDOW, NOT A LIFETIME TOTAL. The score covers the last
 *    `POINTS_WINDOW_DAYS` days — the SAME window Insights' summary uses, so the
 *    two surfaces cannot disagree. A lifetime total would have been worse in two
 *    specific ways: it would grow forever regardless of what you did this week,
 *    and (because Free sees a 14-day history window) it would have had to be
 *    windowed for Free anyway, which would make a Free user's score visibly FALL
 *    as days rolled off. A rolling score is honest about what it measures: how
 *    the last week actually went.
 *
 * 2. IT COUNTS ONLY WHAT EVERY SURFACE ALREADY HAS. Tasks and focus sessions,
 *    and nothing else. Wellness and quit check-ins would have been reasonable
 *    inputs, but those rows are not in Today's cache, so including them would
 *    mean either a new fetch on Today or a score that differs between Today and
 *    Insights. One number, one definition, zero extra requests.
 *
 * 3. IT NEVER PUNISHES. There is no decay, no penalty, no streak-loss, no
 *    leaderboard and no comparison to anyone else. A quiet week is a smaller
 *    number and nothing more — the chip simply doesn't render at zero, exactly
 *    like the streak badge.
 */

export type PointSourceId = 'tasks' | 'effort' | 'focus'

export interface PointSource {
  id: PointSourceId
  label: string
  /** What produced the points, e.g. 7 tasks or 95 focused minutes. */
  detail: string
  points: number
}

export interface PointsSummary {
  total: number
  /** Highest-scoring first; sources that contributed nothing are omitted. */
  sources: PointSource[]
  /** The band `total` falls into. Never a number — see `POINT_LEVELS`. */
  level: PointLevel
  /** Points needed to reach the next band, or null at the top. */
  toNextLevel: number | null
  /** Days the score covers. */
  windowDays: number
}

/**
 * Bands, not "Level 7".
 *
 * A numbered level implies permanent progression, which a rolling window cannot
 * honestly offer — it would have to go DOWN after a quiet week, and "you dropped
 * to level 4" is exactly the shaming this app refuses to do. A band is a
 * description of the week you are having, so a smaller one reads as a quieter
 * week rather than a demotion. Every label is neutral or warm; none is a verdict.
 */
export interface PointLevel {
  id: string
  label: string
  /** Inclusive lower bound. */
  min: number
}

export const POINT_LEVELS: PointLevel[] = [
  { id: 'starting', label: 'Getting going', min: 0 },
  { id: 'steady', label: 'Steady', min: 150 },
  { id: 'rolling', label: 'Rolling', min: 400 },
  { id: 'flying', label: 'Flying', min: 800 },
]

export function levelFor(total: number): PointLevel {
  let hit = POINT_LEVELS[0]
  for (const l of POINT_LEVELS) {
    if (total >= l.min) hit = l
  }
  return hit
}

/** Points to the next band, or null once the top one is reached. */
export function pointsToNextLevel(total: number): number | null {
  const next = POINT_LEVELS.find((l) => total < l.min)
  return next ? next.min - total : null
}

/** Local calendar day (yyyy-MM-dd) of a timestamp, or null if unparseable. */
function dayOf(ts: string | null): string | null {
  if (!ts) return null
  const d = new Date(ts)
  if (Number.isNaN(d.getTime())) return null
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export interface PointsInput {
  tasks: Task[]
  sessions: FocusSession[]
  todayStr: string
  windowDays?: number
}

/**
 * The score for the window ending today.
 *
 * Effort points are capped per task by `POINT_WEIGHTS.maxEffortPointsPerTask`
 * so one enormous estimate cannot dwarf a week of real work — and so nobody can
 * farm the number by writing "480 minutes" on a task. That cap is the only place
 * the scoring is opinionated, and it is opinionated in the direction of making
 * the number harder to game rather than easier.
 */
export function computePoints(input: PointsInput): PointsSummary {
  const windowDays = input.windowDays ?? POINTS_WINDOW_DAYS
  const window = new Set(lastNDays(windowDays, input.todayStr))

  let completedCount = 0
  let effortPoints = 0
  for (const t of input.tasks) {
    if (t.status !== 'done') continue
    const day = dayOf(t.completed_at)
    if (!day || !window.has(day)) continue
    completedCount += 1
    const minutes = t.effort_minutes ?? 0
    if (minutes > 0) {
      effortPoints += Math.min(
        POINT_WEIGHTS.maxEffortPointsPerTask,
        Math.round((minutes / 30) * POINT_WEIGHTS.perHalfHourOfEffort),
      )
    }
  }

  let focusSessions = 0
  let focusMinutes = 0
  for (const s of input.sessions) {
    if (s.status !== 'completed') continue
    const day = dayOf(s.started_at)
    if (!day || !window.has(day)) continue
    focusSessions += 1
    focusMinutes += Math.round(s.actual_seconds / 60)
  }

  const taskPoints = completedCount * POINT_WEIGHTS.perCompletedTask
  const focusPoints =
    focusSessions * POINT_WEIGHTS.perFocusSession +
    Math.round((focusMinutes / 10) * POINT_WEIGHTS.perTenFocusMinutes)

  const allSources: PointSource[] = [
    {
      id: 'tasks',
      label: 'Tasks finished',
      detail: `${completedCount} ${completedCount === 1 ? 'task' : 'tasks'}`,
      points: taskPoints,
    },
    {
      id: 'effort',
      label: 'Effort behind them',
      detail: completedCount === 0 ? 'nothing yet' : 'weighted by estimate',
      points: effortPoints,
    },
    {
      id: 'focus',
      label: 'Focus sessions',
      detail: `${focusSessions} ${focusSessions === 1 ? 'session' : 'sessions'} · ${focusMinutes} min`,
      points: focusPoints,
    },
  ]
  const sources = allSources
    .filter((s) => s.points > 0)
    .sort((a, b) => b.points - a.points)

  const total = taskPoints + effortPoints + focusPoints

  return {
    total,
    sources,
    level: levelFor(total),
    toNextLevel: pointsToNextLevel(total),
    windowDays,
  }
}
