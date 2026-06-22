import type { Task, TaskPriority } from '@/types/database'
import { byPosition } from './selectors'

/**
 * Pure task view sort/filter. Manual = the persisted drag order (byPosition);
 * every other mode falls back to that order as a stable tiebreaker, so equal-key
 * tasks keep the arrangement the user dragged them into. No I/O — unit-tested.
 */

export type SortMode = 'manual' | 'priority' | 'due' | 'effort'

export const SORT_MODES: { value: SortMode; label: string }[] = [
  { value: 'manual', label: 'Manual order' },
  { value: 'priority', label: 'By priority' },
  { value: 'due', label: 'By due date' },
  { value: 'effort', label: 'By effort' },
]

/** 'all' = no filter; otherwise an exact priority level. */
export type PriorityFilter = 'all' | TaskPriority

/** Nulls last; ascending otherwise. ISO dates (yyyy-MM-dd) compare lexically. */
function cmpDateAsc(a: string | null, b: string | null): number {
  if (a === b) return 0
  if (a == null) return 1
  if (b == null) return -1
  return a < b ? -1 : 1
}

/** Nulls (unestimated) last; ascending otherwise. */
function cmpEffortAsc(a: number | null, b: number | null): number {
  if (a == null && b == null) return 0
  if (a == null) return 1
  if (b == null) return -1
  return a - b
}

/** Sort a view's tasks by the chosen mode (returns a new array). */
export function sortTasks(tasks: Task[], mode: SortMode): Task[] {
  const list = tasks.slice()
  switch (mode) {
    case 'manual':
      return list.sort(byPosition)
    case 'priority': // High -> None
      return list.sort((a, b) => b.priority - a.priority || byPosition(a, b))
    case 'due': // soonest first, no-due last
      return list.sort((a, b) => cmpDateAsc(a.due_date, b.due_date) || byPosition(a, b))
    case 'effort': // lightest first, unestimated last
      return list.sort((a, b) => cmpEffortAsc(a.effort_minutes, b.effort_minutes) || byPosition(a, b))
  }
}

/** Quick filter to a single priority level ('all' = no filter). */
export function filterByPriority(tasks: Task[], filter: PriorityFilter): Task[] {
  if (filter === 'all') return tasks
  return tasks.filter((t) => t.priority === filter)
}

/** Apply a view's priority filter, then sort — the order the UI renders. */
export function applyTaskView(
  tasks: Task[],
  prefs: { sortMode: SortMode; priorityFilter: PriorityFilter },
): Task[] {
  return sortTasks(filterByPriority(tasks, prefs.priorityFilter), prefs.sortMode)
}
