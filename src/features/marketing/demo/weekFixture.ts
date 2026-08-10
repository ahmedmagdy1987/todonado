import type { Task } from '@/types/database'
import { isoDateOffset } from '@/lib/date'
import { DEMO_TODAY } from './autoPlanFixture'

/**
 * Fixture for the week-board widget (W4). In its OWN module for the same reason
 * `autoPlanFixture` is: these are full Task rows, and the hero must never drag
 * them into the landing's first-paint chunk. Only WeekBoardDemo imports it.
 *
 * `DEMO_TODAY` is shared with the auto-plan fixture so both widgets describe the
 * same fictional week and neither depends on the visitor's clock.
 */

const day = (offset: number) => isoDateOffset(offset, new Date(`${DEMO_TODAY}T12:00:00.000Z`))

function demoTask(over: Partial<Task> & Pick<Task, 'id' | 'title'>): Task {
  return {
    workspace_id: 'demo',
    project_id: null,
    section_id: null,
    notes: null,
    status: 'todo',
    priority: 0,
    due_date: null,
    effort_minutes: null,
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
    ...over,
  } as Task
}

/**
 * A half-committed week. Three days already carry real work, so the planner has
 * to pack AROUND it rather than into seven empty columns — which is the whole
 * point: the promise is "no day goes over", and an empty week could not show it.
 */
export const WEEK_EXISTING: readonly Task[] = [
  // Titles only, same reason as the other two fixtures: "Sprint review",
  // "Board pack" and "Team 1:1s" are all team-specific shorthand. Minutes and
  // dates are untouched, so the board still fills exactly as it did.
  demoTask({ id: 'wk-e1', title: 'Client workshop', effort_minutes: 180, scheduled_for: day(0) }),
  demoTask({ id: 'wk-e2', title: 'Quarterly review', effort_minutes: 120, scheduled_for: day(1) }),
  demoTask({ id: 'wk-e3', title: 'Board presentation', effort_minutes: 240, scheduled_for: day(3) }),
  demoTask({ id: 'wk-e4', title: 'Team check-ins', effort_minutes: 90, scheduled_for: day(4) }),
] as const

/**
 * The backlog to distribute. Every one is project-less (an Inbox task), which is
 * what makes it an eligible week candidate under the real `isWeekCandidate`
 * rule. The two with deadlines exist to show the planner refusing to schedule a
 * task after its own due date.
 */
export const WEEK_BACKLOG: readonly Task[] = [
  demoTask({ id: 'wk-1', title: 'Draft the launch email', effort_minutes: 90, priority: 3, due_date: day(1) }),
  demoTask({ id: 'wk-2', title: 'Finish the client proposal', effort_minutes: 120, priority: 3 }),
  demoTask({ id: 'wk-3', title: 'Record the welcome video', effort_minutes: 150, priority: 2 }),
  demoTask({ id: 'wk-4', title: 'Update the pricing page', effort_minutes: 60, priority: 2, due_date: day(2) }),
  demoTask({ id: 'wk-5', title: 'Clean up last year’s files', effort_minutes: 180, priority: 1 }),
  demoTask({ id: 'wk-6', title: 'Organize the shared drive', effort_minutes: 120, priority: 0 }),
  demoTask({ id: 'wk-7', title: 'Plan next quarter', effort_minutes: 240, priority: 0 }),
] as const

export const WEEK_TASKS: readonly Task[] = [...WEEK_EXISTING, ...WEEK_BACKLOG] as const
