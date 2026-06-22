import type { Task } from '@/types/database'
import { DEFAULT_DAILY_CAPACITY_MINUTES } from '@/lib/config'
import { sumEffort } from './capacity'

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
}

const isOpen = (t: Task) => t.status === 'todo' || t.status === 'in_progress'

/**
 * Eligible to be auto-planned into today: an OPEN task NOT already on today and
 * available to pull — either project-less (an Inbox task) or due/overdue. A task
 * scheduled for a FUTURE day is left alone (we never disturb an existing plan).
 */
export function isPlanCandidate(t: Task, todayStr: string): boolean {
  if (!isOpen(t)) return false
  if (t.scheduled_for === todayStr) return false // already on today
  if (t.scheduled_for != null && t.scheduled_for > todayStr) return false // future plan
  const projectless = t.project_id == null
  const overdue = t.scheduled_for != null && t.scheduled_for < todayStr
  const due = t.due_date != null && t.due_date <= todayStr
  return projectless || overdue || due
}

const UNDATED = '9999-12-31'

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
): DayPlan {
  const capacity =
    Number.isFinite(capacityMinutes) && capacityMinutes > 0
      ? capacityMinutes
      : DEFAULT_DAILY_CAPACITY_MINUTES

  // Already planned today = remaining (open) effort scheduled for today — matches
  // the capacity meter (counts incomplete effort; treats null as 0).
  const plannedToday = sumEffort(tasks.filter((t) => t.scheduled_for === todayStr && isOpen(t)))
  const remainingCapacity = Math.max(0, capacity - plannedToday)

  if (remainingCapacity <= 0) {
    return {
      picks: [],
      totalMinutes: 0,
      remainingCapacity: 0,
      capacityFull: true,
      candidateCount: 0,
      skipped: 0,
    }
  }

  const candidates = tasks
    .filter((t) => isPlanCandidate(t, todayStr))
    .map((t) => {
      const real = t.effort_minutes
      const estimated = real == null
      const cost = estimated ? Math.max(1, Math.round(estimate(t))) : Math.max(0, Math.round(real))
      return { task: t, cost, estimated }
    })

  candidates.sort((a, b) => {
    if (b.task.priority !== a.task.priority) return b.task.priority - a.task.priority // priority desc
    const ad = a.task.due_date ?? UNDATED
    const bd = b.task.due_date ?? UNDATED
    if (ad !== bd) return ad < bd ? -1 : 1 // due date asc (undated last)
    if (a.cost !== b.cost) return a.cost - b.cost // effort asc (fit more)
    return a.task.id < b.task.id ? -1 : a.task.id > b.task.id ? 1 : 0 // stable
  })

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
  }
}
