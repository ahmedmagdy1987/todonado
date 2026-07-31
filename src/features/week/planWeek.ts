import { DEFAULT_DAILY_CAPACITY_MINUTES } from '@/lib/config'
import type { Task } from '@/types/database'
import {
  DEFAULT_PLAN_SCOPE,
  censusFor,
  comparePlanOrder,
  isPlannable,
  type PlanScope,
} from '@/features/today/planScope'
import { WEEK_LENGTH, weekDates } from './week'

/**
 * Deterministic "Plan my week". Pure, no React, no I/O — fully unit-tested.
 *
 * The day planner (`planDay`) fills ONE day within its remaining capacity. This
 * is the same idea across seven: same explainable ordering (priority → due date
 * → effort), same "never overcommit" promise applied PER DAY, same rule that an
 * assumed estimate is used for the calculation only and never written back.
 */

export interface WeekPlanPick {
  task: Task
  /** The day it would be scheduled for (yyyy-MM-dd). */
  date: string
  /** Minutes used for packing: real effort, or an estimate when absent. */
  cost: number
  /** True when `cost` came from the estimator rather than the task. */
  estimated: boolean
}

export interface WeekPlanDay {
  date: string
  picks: WeekPlanPick[]
  /** Minutes this plan would add to the day. */
  addedMinutes: number
  /** Room the day had before planning (capacity − meetings − existing work). */
  remainingBefore: number
}

export interface WeekPlan {
  days: WeekPlanDay[]
  /** Every pick, in the order they were placed. */
  picks: WeekPlanPick[]
  totalMinutes: number
  taskCount: number
  /** How many eligible candidates were considered. */
  candidateCount: number
  /** Eligible candidates that fit nowhere and stay in the backlog. */
  skipped: number
  /** True when no day had a single free minute to begin with. */
  weekFull: boolean
  /** Which pool this plan drew from. */
  scope: PlanScope
  /** Open tasks only the WIDER scope would have considered. */
  excludedByScope: number
  /** Open tasks already sitting on today or a future day. */
  alreadyPlanned: number
}

const isOpen = (t: Task) => t.status === 'todo' || t.status === 'in_progress'

export interface PlanWeekArgs {
  tasks: Task[]
  /** The user's raw daily capacity. */
  capacityMinutes: number
  todayStr: string
  /** Assumed cost for a task with no effort_minutes (calc only — never written). */
  estimate: (task: Task) => number
  /** Calendar busy per date; those minutes are unavailable for tasks. */
  busyByDate?: Map<string, number> | Record<string, number>
  count?: number
  scope?: PlanScope
}

function busyFor(source: PlanWeekArgs['busyByDate'], date: string): number {
  if (!source) return 0
  const value = source instanceof Map ? source.get(date) : source[date]
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, value) : 0
}

/**
 * Eligible to be planned into the week.
 *
 * The rule is `planScope.ts`, shared with `planDay`, with the seventh day as
 * the horizon. It used to say "project-less, overdue, or due inside the window"
 * and justify the omission as protection against dumping a backlog on someone —
 * but PER-DAY CAPACITY is what prevents that, and it prevents it whatever the
 * planner is allowed to look at. What the narrow rule actually did was make a
 * deadline-free project permanently unplannable.
 */
export function isWeekCandidate(
  task: Task,
  todayStr: string,
  lastDay: string,
  scope: PlanScope = DEFAULT_PLAN_SCOPE,
): boolean {
  return isPlannable(task, todayStr, scope, lastDay)
}

/**
 * Build the week plan.
 *
 * Packing: candidates are sorted once (priority desc, due asc with undated last,
 * effort asc, then id for stability) and each is placed on the EARLIEST day with
 * room. A task is never placed after its own due date — if nothing before the
 * deadline has space, it is skipped rather than quietly scheduled late.
 */
export function planWeek(args: PlanWeekArgs): WeekPlan {
  const {
    tasks,
    todayStr,
    estimate,
    busyByDate,
    count = WEEK_LENGTH,
    scope = DEFAULT_PLAN_SCOPE,
  } = args
  const capacity =
    Number.isFinite(args.capacityMinutes) && args.capacityMinutes > 0
      ? args.capacityMinutes
      : DEFAULT_DAILY_CAPACITY_MINUTES

  const dates = weekDates(todayStr, count)
  const lastDay = dates[dates.length - 1] ?? todayStr

  const costOf = (t: Task): { cost: number; estimated: boolean } => {
    const real = t.effort_minutes
    return real == null
      ? { cost: Math.max(1, Math.round(estimate(t))), estimated: true }
      : { cost: Math.max(0, Math.round(real)), estimated: false }
  }

  // Room per day = capacity − that day's meetings − work already scheduled there.
  // Unestimated existing work is charged the SAME assumed cost the planner uses,
  // so a second run can't double-book a day (mirrors planDay's ledger).
  const remaining = new Map<string, number>()
  for (const date of dates) {
    const existing = tasks
      .filter((t) => t.scheduled_for === date && isOpen(t))
      .reduce((sum, t) => sum + costOf(t).cost, 0)
    remaining.set(date, Math.max(0, capacity - busyFor(busyByDate, date) - existing))
  }

  const candidates = tasks
    .filter((t) => isWeekCandidate(t, todayStr, lastDay, scope))
    .map((t) => ({ task: t, ...costOf(t) }))

  candidates.sort((a, b) => comparePlanOrder(a, b, todayStr))

  const byDate = new Map<string, WeekPlanPick[]>(dates.map((d) => [d, []]))
  const picks: WeekPlanPick[] = []
  let skipped = 0

  for (const candidate of candidates) {
    // Never schedule a task AFTER its due date. An already-overdue task has no
    // usable deadline left, so it may go anywhere (earliest-first puts it today).
    const due = candidate.task.due_date
    const latest = due != null && due >= todayStr ? due : lastDay

    let placed = false
    for (const date of dates) {
      if (date > latest) break
      const room = remaining.get(date) ?? 0
      if (candidate.cost > room) continue
      remaining.set(date, room - candidate.cost)
      const pick: WeekPlanPick = {
        task: candidate.task,
        date,
        cost: candidate.cost,
        estimated: candidate.estimated,
      }
      byDate.get(date)?.push(pick)
      picks.push(pick)
      placed = true
      break
    }
    if (!placed) skipped += 1
  }

  const days: WeekPlanDay[] = dates.map((date) => {
    const dayPicks = byDate.get(date) ?? []
    const existing = tasks
      .filter((t) => t.scheduled_for === date && isOpen(t))
      .reduce((sum, t) => sum + costOf(t).cost, 0)
    return {
      date,
      picks: dayPicks,
      addedMinutes: dayPicks.reduce((sum, p) => sum + p.cost, 0),
      remainingBefore: Math.max(0, capacity - busyFor(busyByDate, date) - existing),
    }
  })

  const census = censusFor(tasks, todayStr, scope, lastDay)

  return {
    days,
    picks,
    totalMinutes: picks.reduce((sum, p) => sum + p.cost, 0),
    taskCount: picks.length,
    candidateCount: candidates.length,
    skipped,
    weekFull: days.every((d) => d.remainingBefore <= 0),
    scope,
    excludedByScope: census.excludedByScope,
    alreadyPlanned: census.alreadyPlanned,
  }
}
