import type { Task } from '@/types/database'
import { DEFAULT_DAILY_CAPACITY_MINUTES } from '@/lib/config'
import {
  DEFAULT_PLAN_SCOPE,
  censusFor,
  comparePlanOrder,
  isPlannable,
  type PlanScope,
} from './planScope'

/**
 * Deterministic auto-plan-my-day. Pure, no React, no I/O — fully unit-tested.
 * Picks the set of tasks that fits into today's REMAINING capacity and never
 * exceeds it. The capacity MATH (computeCapacity/sumEffort) is reused unchanged.
 */

export interface PlanPick {
  task: Task
  /** Minutes used for packing: the task's real effort, or an estimate when null. */
  cost: number
  /** True when `cost` came from an estimate (the task has no effort_minutes). */
  estimated: boolean
}

export interface DayPlan {
  picks: PlanPick[]
  /** Total minutes of the picked set — always <= remainingCapacity. */
  totalMinutes: number
  /** Capacity left for today BEFORE planning (capacity − already-planned today). */
  remainingCapacity: number
  /** True when today is already at/over capacity (nothing can be added). */
  capacityFull: boolean
  /** How many eligible candidates were considered. */
  candidateCount: number
  /** Eligible candidates that didn't fit and stay in the backlog. */
  skipped: number
  /** Which pool this plan drew from. */
  scope: PlanScope
  /**
   * Open tasks only the WIDER scope would have considered. Non-zero means an
   * empty plan has a one-tap fix rather than being a dead end.
   */
  excludedByScope: number
  /** Open tasks already sitting on today or a future day. */
  alreadyPlanned: number
}

const isOpen = (t: Task) => t.status === 'todo' || t.status === 'in_progress'

/**
 * Eligible to be auto-planned into today.
 *
 * The rule now lives in `planScope.ts`, shared with `planWeek`, because the two
 * had drifted into different answers to the same question. See that file for
 * why "project work with no deadline" used to be excluded and why it no longer
 * is — it is the whole reason this planner reported an empty day on a full
 * workspace.
 */
export function isPlanCandidate(
  t: Task,
  todayStr: string,
  scope: PlanScope = DEFAULT_PLAN_SCOPE,
): boolean {
  return isPlannable(t, todayStr, scope, todayStr)
}

/**
 * Build today's plan. Greedy over a FIXED, explainable sort — priority (high
 * first), then due date (overdue/soonest first, undated last), then effort
 * (smaller first) — adding each candidate only if it still fits the remaining
 * capacity; anything that would exceed it is skipped. NEVER overcommits.
 *
 * `estimate` supplies an assumed cost for tasks with no `effort_minutes` (the 3A
 * auto-estimator). That value is used ONLY for this calc — it is never written
 * back to the task.
 */
export function planDay(
  tasks: Task[],
  capacityMinutes: number,
  todayStr: string,
  estimate: (task: Task) => number,
  scope: PlanScope = DEFAULT_PLAN_SCOPE,
): DayPlan {
  // `>= 0`, NOT `> 0`. This receives a DERIVED REMAINDER, not a raw setting:
  // TodayPage passes `cal.effectiveCapacity`, which is `max(0, capacity − busy)`
  // and is legitimately ZERO on a day the calendar has filled.
  //
  // Treating that zero as "unset" and substituting six hours meant the planner
  // filled a day that had no room, then wrote it — while `/week`, which computes
  // the same remainder without a fallback, correctly refused the same day. It is
  // the app's central promise ("we refuse to pretend a 14-hour day fits in 8")
  // failing precisely when the calendar says the day is full.
  //
  // `computeCapacity` deliberately keeps `> 0`: it is fed the RAW profile value
  // and divides by it, where a zero really is nonsense. The capacity editor's
  // own floor is 15 minutes, so a raw zero cannot come from the UI either way.
  const capacity =
    Number.isFinite(capacityMinutes) && capacityMinutes >= 0
      ? capacityMinutes
      : DEFAULT_DAILY_CAPACITY_MINUTES

  // Already planned today = remaining (open) effort scheduled for today. We charge
  // an unestimated open task the SAME assumed cost the planner uses for candidates
  // (max(1, round(estimate))), not 0 — otherwise a picked-but-unestimated task
  // (apply writes only scheduled_for, never the estimate) would vanish from the
  // ledger, and a second "Plan my day" run would re-fill the day and overcommit.
  // NOTE: this intentionally diverges from the capacity meter (which treats null
  // effort as 0 and surfaces its own "N unestimated" caveat) so the planner's
  // "never over" promise holds across repeated apply.
  const plannedToday = tasks
    .filter((t) => t.scheduled_for === todayStr && isOpen(t))
    .reduce((sum, t) => {
      const real = t.effort_minutes
      return sum + (real == null ? Math.max(1, Math.round(estimate(t))) : Math.max(0, Math.round(real)))
    }, 0)
  const remainingCapacity = Math.max(0, capacity - plannedToday)
  const census = censusFor(tasks, todayStr, scope, todayStr)

  if (remainingCapacity <= 0) {
    return {
      picks: [],
      totalMinutes: 0,
      remainingCapacity: 0,
      capacityFull: true,
      candidateCount: 0,
      skipped: 0,
      scope,
      excludedByScope: census.excludedByScope,
      alreadyPlanned: census.alreadyPlanned,
    }
  }

  const candidates = tasks
    .filter((t) => isPlanCandidate(t, todayStr, scope))
    .map((t) => {
      const real = t.effort_minutes
      const estimated = real == null
      const cost = estimated ? Math.max(1, Math.round(estimate(t))) : Math.max(0, Math.round(real))
      return { task: t, cost, estimated }
    })

  candidates.sort((a, b) => comparePlanOrder(a, b, todayStr))

  const picks: PlanPick[] = []
  let totalMinutes = 0
  let skipped = 0
  for (const c of candidates) {
    if (totalMinutes + c.cost <= remainingCapacity) {
      picks.push(c)
      totalMinutes += c.cost
    } else {
      skipped += 1
    }
  }

  return {
    picks,
    totalMinutes,
    remainingCapacity,
    capacityFull: false,
    candidateCount: candidates.length,
    skipped,
    scope,
    excludedByScope: census.excludedByScope,
    alreadyPlanned: census.alreadyPlanned,
  }
}
