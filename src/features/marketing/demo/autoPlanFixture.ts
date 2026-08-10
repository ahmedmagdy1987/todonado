import type { Task } from '@/types/database'

/**
 * Fixture for the auto-plan widget (W2), deliberately kept in its OWN module:
 * it is several full Task rows, and the hero must not drag them into the
 * landing's first-paint chunk. Only AutoPlanDemo (a lazy chunk) imports this.
 */

/**
 * A fixed "today" so the planner is deterministic and never depends on the
 * visitor's clock (a real run uses the user's local day).
 */
export const DEMO_TODAY = '2026-06-15'

/** Minimal Task builder for demo rows — every field the real planner reads. */
function demoBacklogTask(
  id: string,
  title: string,
  priority: Task['priority'],
  effort: number,
  due: string | null,
): Task {
  return {
    id,
    workspace_id: 'demo',
    project_id: null, // Inbox → an eligible auto-plan candidate
    section_id: null,
    title,
    notes: null,
    status: 'todo',
    priority,
    due_date: due,
    effort_minutes: effort,
    scheduled_for: null,
    position: 0,
    recurrence_freq: null,
    recurrence_interval: 1,
    recurrence_weekdays: null,
    recurrence_until: null,
    recurrence_anchor: null,
    created_at: `${DEMO_TODAY}T08:00:00.000Z`,
    updated_at: `${DEMO_TODAY}T08:00:00.000Z`,
    completed_at: null,
  }
}

/**
 * A deliberately overloaded backlog: 600 minutes of work against a 360-minute
 * day. The real planner picks 345 of it (96% of capacity) and leaves three
 * tasks behind — which is the whole point of the widget.
 */
/*
 * ONLY THE TITLES CHANGED, AND THAT IS DELIBERATE.
 *
 * Every priority, estimate and due date below is exactly what it was, because
 * `e2e/smoke.spec.ts` asserts the planner's real output ("5 planned · 3 left in
 * backlog") against this fixture. Renaming a task is a copy change; renumbering
 * one silently changes what the demo proves.
 *
 * The old titles read as a software team's sprint board — "Refactor the auth
 * guard", "Ship the pricing page fix", "Tidy the design tokens". Todonado is
 * for anyone with more to do than fits in a day, and the examples on the public
 * page should not quietly narrow that to programmers.
 */
export const AUTOPLAN_BACKLOG: readonly Task[] = [
  demoBacklogTask('ap-1', 'Finish the client proposal', 3, 60, '2026-06-15'),
  demoBacklogTask('ap-2', 'Prepare the quarterly report', 3, 90, '2026-06-16'),
  demoBacklogTask('ap-3', 'Reply to customer emails', 2, 45, '2026-06-15'),
  demoBacklogTask('ap-4', 'Record the training video', 2, 120, null),
  demoBacklogTask('ap-5', 'Review the new contracts', 1, 90, null),
  demoBacklogTask('ap-6', 'Update the welcome guide', 1, 30, null),
  demoBacklogTask('ap-7', 'Plan next quarter', 0, 120, null),
  demoBacklogTask('ap-8', 'Organize the shared folder', 0, 45, null),
] as const

/**
 * The planner never consults this for the demo (every backlog row carries a
 * real estimate), but `planDay` requires an estimator — so supply the app's
 * neutral 30-minute fallback rather than a magic number.
 */
export const DEMO_ESTIMATE = () => 30
