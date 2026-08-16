import type { Task } from '@/types/database'

/**
 * Fixture for the recovery widget, in its own module for the same reason
 * `autoPlanFixture` is: these are full Task rows and the hero must not drag
 * them into the landing's first-paint chunk.
 *
 * ── THE DATES ARE REAL DATES, AND THAT MATTERS ─────────────────────────────
 *
 * The widget runs the product's real `selectRolloverTasks` and `rolloverSpan`,
 * both of which compare LOCAL calendar day strings. Fixed strings are used (not
 * the visitor's clock) so the demo is deterministic everywhere, exactly as
 * `autoPlanFixture` pins `DEMO_TODAY`. `rolloverSpan` then genuinely derives
 * "yesterday" rather than being told it.
 */

/** A fixed "today", so the selection is identical in every timezone. */
export const RECOVERY_TODAY = '2026-06-15'
/** The day the unfinished work was originally planned for. */
export const RECOVERY_YESTERDAY = '2026-06-14'

function demoTask(
  id: string,
  title: string,
  effort: number,
  scheduledFor: string,
  status: Task['status'],
  priority: Task['priority'] = 1,
): Task {
  return {
    id,
    workspace_id: 'demo',
    project_id: null,
    section_id: null,
    title,
    notes: null,
    status,
    priority,
    due_date: null,
    effort_minutes: effort,
    scheduled_for: scheduledFor,
    position: 0,
    recurrence_freq: null,
    recurrence_interval: 1,
    recurrence_weekdays: null,
    recurrence_until: null,
    recurrence_anchor: null,
    created_at: `${RECOVERY_YESTERDAY}T08:00:00.000Z`,
    updated_at: `${RECOVERY_YESTERDAY}T08:00:00.000Z`,
    completed_at: status === 'done' ? `${RECOVERY_YESTERDAY}T16:00:00.000Z` : null,
  }
}

/**
 * Yesterday, honestly: four things done, two not.
 *
 * A day that went badly, NOT a day that went catastrophically. The section's
 * claim is that ordinary slippage is normal and recoverable, and a fixture
 * where nothing got done would be arguing something else.
 */
export const RECOVERY_YESTERDAY_TASKS: readonly Task[] = [
  demoTask('r-1', 'Team meeting', 60, RECOVERY_YESTERDAY, 'done'),
  demoTask('r-2', 'Reply to customer emails', 45, RECOVERY_YESTERDAY, 'done'),
  demoTask('r-3', 'Review the project proposal', 45, RECOVERY_YESTERDAY, 'todo', 2),
  demoTask('r-4', 'Update the budget sheet', 30, RECOVERY_YESTERDAY, 'done'),
  demoTask('r-5', 'Draft the launch email', 60, RECOVERY_YESTERDAY, 'todo', 2),
  demoTask('r-6', 'Book the venue', 15, RECOVERY_YESTERDAY, 'done'),
] as const

/** What today already holds before anything is carried over. */
export const RECOVERY_TODAY_TASKS: readonly Task[] = [
  demoTask('t-1', 'Prepare Thursday’s presentation', 90, RECOVERY_TODAY, 'todo', 2),
  demoTask('t-2', 'One-to-one with Sam', 30, RECOVERY_TODAY, 'todo'),
  demoTask('t-3', 'Review the monthly budget', 60, RECOVERY_TODAY, 'todo'),
] as const
