import type { Task } from '@/types/database'
import { DEFAULT_DAILY_CAPACITY_MINUTES } from '@/lib/config'

/**
 * Pure capacity math for the Today command center — the MVP differentiator.
 * No React, no I/O: fully unit-tested.
 */

export type CapacityStatus = 'empty' | 'ok' | 'near' | 'over'

/** Fraction of capacity at which we shift the meter to "near" (amber). */
export const NEAR_THRESHOLD = 0.8

export interface CapacitySummary {
  plannedMinutes: number
  capacityMinutes: number
  /** Remaining headroom, clamped at 0. */
  freeMinutes: number
  /** Amount over capacity, clamped at 0. */
  overMinutes: number
  /** Uncapped percentage of capacity used (can exceed 100). */
  pct: number
  /** Percentage for the meter bar, clamped to 0..100. */
  barPct: number
  status: CapacityStatus
}

type EffortBearing = Pick<Task, 'effort_minutes'>

/** Sum the effort (minutes) of the given tasks, treating null as 0. */
export function sumEffort(tasks: EffortBearing[]): number {
  return tasks.reduce((total, t) => total + (t.effort_minutes ?? 0), 0)
}

/** Derive the full capacity summary from planned minutes vs capacity. */
export function computeCapacity(
  plannedMinutes: number,
  capacityMinutes: number,
): CapacitySummary {
  const capacity = capacityMinutes > 0 ? capacityMinutes : DEFAULT_DAILY_CAPACITY_MINUTES
  const planned = Math.max(0, Math.round(plannedMinutes))
  const ratio = planned / capacity

  let status: CapacityStatus
  if (planned === 0) status = 'empty'
  else if (planned > capacity) status = 'over'
  else if (ratio >= NEAR_THRESHOLD) status = 'near'
  else status = 'ok'

  return {
    plannedMinutes: planned,
    capacityMinutes: capacity,
    freeMinutes: Math.max(0, capacity - planned),
    overMinutes: Math.max(0, planned - capacity),
    pct: Math.round(ratio * 100),
    barPct: Math.min(100, Math.round(ratio * 100)),
    status,
  }
}

/**
 * When today is overbooked, suggest the fewest/lowest-value tasks to move to
 * tomorrow to get back under capacity. Considers only movable (todo /
 * in_progress) tasks that carry an effort estimate. Lowest priority goes
 * first; ties broken by larger effort (move fewer tasks). Never returns more
 * than needed.
 */
export function suggestTasksToMoveTomorrow(
  todayTasks: Task[],
  capacityMinutes: number,
): Task[] {
  const capacity = capacityMinutes > 0 ? capacityMinutes : DEFAULT_DAILY_CAPACITY_MINUTES
  // Base "over" on remaining (movable) effort — completed work shouldn't count.
  const planned = sumEffort(
    todayTasks.filter((t) => t.status === 'todo' || t.status === 'in_progress'),
  )
  let over = planned - capacity
  if (over <= 0) return []

  const candidates = todayTasks
    .filter((t) => t.status === 'todo' || t.status === 'in_progress')
    .filter((t) => (t.effort_minutes ?? 0) > 0)
    .sort(
      (a, b) =>
        a.priority - b.priority || (b.effort_minutes ?? 0) - (a.effort_minutes ?? 0),
    )

  const toMove: Task[] = []
  for (const task of candidates) {
    if (over <= 0) break
    toMove.push(task)
    over -= task.effort_minutes ?? 0
  }
  return toMove
}
