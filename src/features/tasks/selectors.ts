import type { Task } from '@/types/database'
import { isBeforeDay, isSameDay } from '@/lib/date'

/**
 * Pure task view selectors. The app keeps one workspace-wide task cache and
 * derives every view from it with these functions — keeping optimistic updates
 * trivial and the logic fully unit-testable.
 */

const isActive = (t: Task): boolean => t.status !== 'cancelled'
const isOpen = (t: Task): boolean => t.status !== 'done' && t.status !== 'cancelled'

/** Stable ordering: by position, then creation time as a tiebreaker. */
export function byPosition(a: Task, b: Task): number {
  if (a.position !== b.position) return a.position - b.position
  return a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0
}

/**
 * Inbox: every open task with no project — the catch-all safety net.
 *
 * DATA-LOSS GUARD: this deliberately does NOT filter by `scheduled_for` or
 * `due_date`. Today shows today only, so a project-less task with a future date
 * is surfaced *only* here; excluding dated tasks would make it invisible
 * everywhere (lost from the UI). Keep this date-independent — the invariant is
 * pinned in selectors.test.ts.
 */
export function selectInbox(tasks: Task[]): Task[] {
  return tasks.filter((t) => t.project_id == null && isOpen(t)).sort(byPosition)
}

/** Tasks scheduled for `todayStr` (any non-cancelled status). */
export function selectToday(tasks: Task[], todayStr: string): Task[] {
  return tasks
    .filter((t) => t.scheduled_for != null && isSameDay(t.scheduled_for, todayStr) && isActive(t))
    .sort(byPosition)
}

/** Overdue: open tasks scheduled before today (roll-over candidates). */
export function selectOverdue(tasks: Task[], todayStr: string): Task[] {
  return tasks
    .filter((t) => t.scheduled_for != null && isBeforeDay(t.scheduled_for, todayStr) && isOpen(t))
    .sort(byPosition)
}

/** All non-cancelled tasks in a project. */
export function selectByProject(tasks: Task[], projectId: string): Task[] {
  return tasks.filter((t) => t.project_id === projectId && isActive(t)).sort(byPosition)
}

/** Non-cancelled tasks in a given section (or the project's unsectioned tasks when `sectionId` is null). */
export function selectBySection(
  tasks: Task[],
  projectId: string,
  sectionId: string | null,
): Task[] {
  return tasks
    .filter((t) => t.project_id === projectId && t.section_id === sectionId && isActive(t))
    .sort(byPosition)
}
