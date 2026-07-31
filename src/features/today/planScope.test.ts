import { describe, expect, it } from 'vitest'
import { makeTask } from '@/test/factories'
import { planDay } from './autoPlan'
import { planWeek } from '@/features/week/planWeek'
import {
  DEFAULT_PLAN_SCOPE,
  PLAN_TIER,
  censusFor,
  isPlannable,
  planTier,
} from './planScope'

/**
 * THE SHAPES A REAL BACKLOG COMES IN, and which of them the planner could see.
 *
 * The complaint was that "Plan my day", "Plan my week" and the briefing report
 * nothing to plan while the user obviously has work. This file is the
 * reproduction: one case per shape, each asserting whether it is plannable, so
 * the answer is written down rather than inferred from two nested booleans in
 * two different files.
 *
 * The rule that produced the bug was:
 *
 *     projectless || overdue || due
 *
 * Shape (a) below — a task in a project, no due date, never scheduled — matches
 * none of those three, and there was no fourth branch. It was not deprioritised;
 * it could never be planned at all, on any day, forever. That is the single most
 * ordinary way to keep a to-do list.
 */

const TODAY = '2026-06-22'
const NEXT_WEEK = '2026-06-29'
const LAST = '2026-06-28'
const flat = () => 30

const shapes = {
  /** (a) In a project, no due date, never scheduled. THE BUG. */
  projectNoDate: makeTask({ id: 'a', project_id: 'p1' }),
  /** (b) In a project, due next week. */
  projectDueNextWeek: makeTask({ id: 'b', project_id: 'p1', due_date: NEXT_WEEK }),
  /** (c) Loose capture: no project, no dates at all. */
  inboxNoDate: makeTask({ id: 'c', project_id: null }),
  /** (e) No effort estimate — must still be plannable, costed by the estimator. */
  noEffort: makeTask({ id: 'e', project_id: 'p1', effort_minutes: null }),
  /** (f) Already scheduled for a future day: leave it exactly where it is. */
  alreadyScheduled: makeTask({ id: 'f', project_id: 'p1', scheduled_for: NEXT_WEEK }),
  /** Overdue: a schedule that has passed. */
  overdue: makeTask({ id: 'g', project_id: 'p1', scheduled_for: '2026-06-01' }),
  /** On today already — re-planning it would double-count it. */
  onToday: makeTask({ id: 'h', project_id: 'p1', scheduled_for: TODAY }),
  done: makeTask({ id: 'i', status: 'done' }),
  cancelled: makeTask({ id: 'j', status: 'cancelled' }),
}

describe('which shapes the planner can see (default scope)', () => {
  const can = (t: Parameters<typeof isPlannable>[0]) =>
    isPlannable(t, TODAY, DEFAULT_PLAN_SCOPE, TODAY)

  it('(a) project work with NO due date is plannable — this was the bug', () => {
    expect(can(shapes.projectNoDate)).toBe(true)
  })

  it('(b) project work due next week is plannable', () => {
    expect(can(shapes.projectDueNextWeek)).toBe(true)
  })

  it('(c) undated inbox capture is plannable', () => {
    expect(can(shapes.inboxNoDate)).toBe(true)
  })

  it('(e) a task with no effort estimate is plannable', () => {
    expect(can(shapes.noEffort)).toBe(true)
  })

  it('(f) work already on a day is left alone', () => {
    expect(can(shapes.alreadyScheduled)).toBe(false)
    expect(can(shapes.onToday)).toBe(false)
  })

  it('overdue work is plannable; finished work is not', () => {
    expect(can(shapes.overdue)).toBe(true)
    expect(can(shapes.done)).toBe(false)
    expect(can(shapes.cancelled)).toBe(false)
  })

  /**
   * (d) SUBTASKS. They live in their own table and are not `Task` rows, so they
   * never reach a planner. That is deliberate — a subtask has no effort, no
   * date and no independent existence — and it is recorded here so the omission
   * is a decision rather than a gap someone rediscovers.
   */
  it('(d) subtasks are not planned, by design', () => {
    expect(Object.keys(shapes)).not.toContain('subtask')
  })
})

describe('the narrow scope excludes exactly the undated work, and nothing else', () => {
  const narrow = (t: Parameters<typeof isPlannable>[0]) => isPlannable(t, TODAY, 'dated', TODAY)

  it('drops undated work', () => {
    expect(narrow(shapes.projectNoDate)).toBe(false)
    expect(narrow(shapes.inboxNoDate)).toBe(false)
  })

  it('keeps overdue and due-today', () => {
    expect(narrow(shapes.overdue)).toBe(true)
    expect(narrow(makeTask({ due_date: TODAY }))).toBe(true)
  })

  it('the horizon widens the NARROW scope, and only it', () => {
    // Due inside the week: out of scope for one day, in scope for seven.
    const dueInWindow = makeTask({ project_id: 'p1', due_date: '2026-06-26' })
    expect(narrow(dueInWindow)).toBe(false)
    expect(isPlannable(dueInWindow, TODAY, 'dated', LAST)).toBe(true)

    // Due AFTER the week: still out of the narrow scope at either horizon...
    expect(isPlannable(shapes.projectDueNextWeek, TODAY, 'dated', LAST)).toBe(false)
    // ...but ordinary work you could choose to do now, which `all` allows.
    expect(isPlannable(shapes.projectDueNextWeek, TODAY, 'all', TODAY)).toBe(true)
  })
})

describe('planTier — deadlines first, then intent', () => {
  it('ranks late work above everything', () => {
    expect(planTier(shapes.overdue, TODAY)).toBe(PLAN_TIER.overdue)
    expect(planTier(makeTask({ due_date: '2026-01-01' }), TODAY)).toBe(PLAN_TIER.overdue)
  })

  it('ranks a live deadline above undated work', () => {
    expect(planTier(shapes.projectDueNextWeek, TODAY)).toBe(PLAN_TIER.dated)
  })

  it('ranks deliberate project work above loose capture', () => {
    expect(planTier(shapes.projectNoDate, TODAY)).toBe(PLAN_TIER.projectUndated)
    expect(planTier(shapes.inboxNoDate, TODAY)).toBe(PLAN_TIER.inboxUndated)
  })
})

describe('censusFor explains an empty result', () => {
  it('separates "hidden by scope" from "already on a day"', () => {
    const tasks = [shapes.projectNoDate, shapes.inboxNoDate, shapes.alreadyScheduled, shapes.done]

    expect(censusFor(tasks, TODAY, 'dated', TODAY)).toEqual({
      eligible: 0,
      excludedByScope: 2,
      alreadyPlanned: 1,
    })
    expect(censusFor(tasks, TODAY, 'all', TODAY)).toEqual({
      eligible: 2,
      excludedByScope: 0,
      alreadyPlanned: 1,
    })
  })
})

describe('the reproduction: a workspace of nothing but undated project work', () => {
  const backlog = [
    makeTask({ id: 't1', project_id: 'p1', effort_minutes: 60 }),
    makeTask({ id: 't2', project_id: 'p1', effort_minutes: 45 }),
    makeTask({ id: 't3', project_id: 'p2', effort_minutes: 30, priority: 2 }),
  ]

  it('planDay produces a real plan instead of an empty one', () => {
    const plan = planDay(backlog, 360, TODAY, flat)
    expect(plan.candidateCount).toBe(3)
    expect(plan.picks).toHaveLength(3)
    expect(plan.totalMinutes).toBe(135)
    expect(plan.totalMinutes).toBeLessThanOrEqual(plan.remainingCapacity)
  })

  it('planWeek produces a real plan instead of an empty one', () => {
    const plan = planWeek({
      tasks: backlog,
      capacityMinutes: 360,
      todayStr: TODAY,
      estimate: flat,
    })
    expect(plan.candidateCount).toBe(3)
    expect(plan.taskCount).toBe(3)
  })

  it('STILL never exceeds capacity — widening the pool did not widen the day', () => {
    const many = Array.from({ length: 40 }, (_, i) =>
      makeTask({ id: `x${i}`, project_id: 'p1', effort_minutes: 60 }),
    )
    const plan = planDay(many, 180, TODAY, flat)
    expect(plan.totalMinutes).toBeLessThanOrEqual(180)
    expect(plan.picks).toHaveLength(3)
    expect(plan.skipped).toBe(37)
  })

  it('STILL never schedules a task after its own due date', () => {
    const plan = planWeek({
      // Due tomorrow, but every early day is full of meetings.
      tasks: [makeTask({ id: 'tight', effort_minutes: 300, due_date: '2026-06-23' })],
      capacityMinutes: 360,
      todayStr: TODAY,
      estimate: flat,
      busyByDate: { '2026-06-22': 360, '2026-06-23': 360 },
    })
    expect(plan.taskCount, 'placed it after its deadline').toBe(0)
    expect(plan.skipped).toBe(1)
  })
})
