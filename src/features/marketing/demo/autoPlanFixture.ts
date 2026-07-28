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
export const AUTOPLAN_BACKLOG: readonly Task[] = [
  demoBacklogTask('ap-1', 'Ship the pricing page fix', 3, 60, '2026-06-15'),
  demoBacklogTask('ap-2', 'Prep the investor update', 3, 90, '2026-06-16'),
  demoBacklogTask('ap-3', 'Reply to the support backlog', 2, 45, '2026-06-15'),
  demoBacklogTask('ap-4', 'Record the demo video', 2, 120, null),
  demoBacklogTask('ap-5', 'Refactor the auth guard', 1, 90, null),
  demoBacklogTask('ap-6', 'Update the onboarding copy', 1, 30, null),
  demoBacklogTask('ap-7', 'Plan the Q3 roadmap', 0, 120, null),
  demoBacklogTask('ap-8', 'Tidy the design tokens', 0, 45, null),
] as const

/**
 * The planner never consults this for the demo (every backlog row carries a
 * real estimate), but `planDay` requires an estimator — so supply the app's
 * neutral 30-minute fallback rather than a magic number.
 */
export const DEMO_ESTIMATE = () => 30
