import { describe, expect, it } from 'vitest'
import { makeTask } from '@/test/factories'
import type { Task } from '@/types/database'
import { isWeekCandidate, planWeek, type PlanWeekArgs } from './planWeek'

const TODAY = '2026-06-22' // Monday
const LAST = '2026-06-28' // Sunday, day 7
const CAPACITY = 360
const estimate = () => 30

const plan = (tasks: Task[], over: Partial<PlanWeekArgs> = {}) =>
  planWeek({ tasks, capacityMinutes: CAPACITY, todayStr: TODAY, estimate, ...over })

describe('isWeekCandidate — eligibility', () => {
  it('takes an unscheduled Inbox task', () => {
    expect(isWeekCandidate(makeTask({ project_id: null }), TODAY, LAST)).toBe(true)
  })

  it('takes an overdue task', () => {
    expect(
      isWeekCandidate(makeTask({ project_id: 'p1', scheduled_for: '2026-06-18' }), TODAY, LAST),
    ).toBe(true)
  })

  it('takes a project task whose deadline falls inside the window', () => {
    expect(isWeekCandidate(makeTask({ project_id: 'p1', due_date: LAST }), TODAY, LAST)).toBe(true)
  })

  /**
   * THE REGRESSION, and the assertion that hid it. This test used to read
   * "LEAVES a project task with no deadline alone" and expect `false`, on the
   * grounds that planning a week must not dump a backlog. Per-day CAPACITY is
   * what prevents that, and it prevents it regardless of what the planner is
   * allowed to consider. The rule as written made a deadline-free project
   * permanently unplannable.
   */
  it('TAKES a project task with no deadline — the "nothing to plan" bug', () => {
    expect(isWeekCandidate(makeTask({ project_id: 'p1' }), TODAY, LAST)).toBe(true)
  })

  it('takes a deadline beyond the window: it is still work you could do now', () => {
    expect(isWeekCandidate(makeTask({ project_id: 'p1', due_date: '2026-07-30' }), TODAY, LAST)).toBe(
      true,
    )
  })

  it('the narrow scope still exists, and is opt-in', () => {
    const undated = makeTask({ project_id: 'p1' })
    expect(isWeekCandidate(undated, TODAY, LAST, 'dated')).toBe(false)
    expect(isWeekCandidate(undated, TODAY, LAST, 'all')).toBe(true)
    // A deadline inside the window survives the narrow scope; one beyond it does not.
    expect(isWeekCandidate(makeTask({ due_date: LAST }), TODAY, LAST, 'dated')).toBe(true)
    expect(isWeekCandidate(makeTask({ due_date: '2026-07-30' }), TODAY, LAST, 'dated')).toBe(false)
  })

  it('never disturbs work already scheduled, in or beyond the week', () => {
    expect(isWeekCandidate(makeTask({ scheduled_for: TODAY }), TODAY, LAST)).toBe(false)
    expect(isWeekCandidate(makeTask({ scheduled_for: '2026-06-25' }), TODAY, LAST)).toBe(false)
    expect(isWeekCandidate(makeTask({ scheduled_for: '2026-08-01' }), TODAY, LAST)).toBe(false)
  })

  it('ignores finished and cancelled work', () => {
    expect(isWeekCandidate(makeTask({ status: 'done' }), TODAY, LAST)).toBe(false)
    expect(isWeekCandidate(makeTask({ status: 'cancelled' }), TODAY, LAST)).toBe(false)
  })
})

describe('planWeek — packing never overcommits a day', () => {
  it('fills the first day, then spills to the next', () => {
    // 5 × 120m = 600m against 360m/day ⇒ 3 on Monday (360), 2 on Tuesday.
    const tasks = Array.from({ length: 5 }, (_, i) =>
      makeTask({ id: `t${i}`, effort_minutes: 120 }),
    )
    const result = plan(tasks)
    expect(result.days[0].addedMinutes).toBe(360)
    expect(result.days[1].addedMinutes).toBe(240)
    expect(result.taskCount).toBe(5)
    expect(result.skipped).toBe(0)
  })

  it('never exceeds any day’s capacity', () => {
    const tasks = Array.from({ length: 40 }, (_, i) => makeTask({ id: `t${i}`, effort_minutes: 90 }))
    for (const day of plan(tasks).days) {
      expect(day.addedMinutes).toBeLessThanOrEqual(CAPACITY)
    }
  })

  it('subtracts that day’s meetings from the room available', () => {
    const result = plan([makeTask({ id: 'a', effort_minutes: 300 })], {
      busyByDate: { [TODAY]: 120 }, // only 240 left on Monday
    })
    expect(result.days[0].remainingBefore).toBe(240)
    expect(result.days[0].picks).toHaveLength(0) // 300 doesn't fit
    expect(result.days[1].picks.map((p) => p.task.id)).toEqual(['a'])
  })

  it('subtracts work already scheduled on a day', () => {
    const result = plan([
      makeTask({ id: 'existing', scheduled_for: TODAY, effort_minutes: 300 }),
      makeTask({ id: 'new', effort_minutes: 120 }),
    ])
    expect(result.days[0].remainingBefore).toBe(60)
    expect(result.days[1].picks.map((p) => p.task.id)).toEqual(['new'])
  })

  it('reports a completely full week and plans nothing', () => {
    const existing = Array.from({ length: 7 }, (_, i) =>
      makeTask({ id: `full${i}`, scheduled_for: `2026-06-${22 + i}`, effort_minutes: 400 }),
    )
    const result = plan([...existing, makeTask({ id: 'new', effort_minutes: 15 })])
    expect(result.weekFull).toBe(true)
    expect(result.taskCount).toBe(0)
    expect(result.skipped).toBe(1)
  })
})

describe('planWeek — the due-date rule', () => {
  it('never schedules a task AFTER its due date', () => {
    // Monday is full, so this 60m task would spill to Tuesday — but it's due today.
    const result = plan([
      makeTask({ id: 'blocker', scheduled_for: TODAY, effort_minutes: 360 }),
      makeTask({ id: 'urgent', effort_minutes: 60, due_date: TODAY }),
    ])
    expect(result.picks).toHaveLength(0)
    expect(result.skipped).toBe(1)
  })

  it('places a deadline task on the last day that still respects it', () => {
    const result = plan([
      makeTask({ id: 'mon-full', scheduled_for: TODAY, effort_minutes: 360 }),
      makeTask({ id: 'due-wed', effort_minutes: 60, due_date: '2026-06-24' }),
    ])
    expect(result.picks[0].date).toBe('2026-06-23') // earliest day with room, before the deadline
  })

  it('lets an already-overdue task go anywhere — earliest first', () => {
    const result = plan([
      makeTask({ id: 'late', scheduled_for: '2026-06-01', due_date: '2026-06-02', effort_minutes: 60 }),
    ])
    expect(result.picks[0].date).toBe(TODAY)
  })
})

describe('planWeek — ordering is explainable and deterministic', () => {
  const tasks = [
    makeTask({ id: 'low', priority: 0, effort_minutes: 30 }),
    makeTask({ id: 'high', priority: 3, effort_minutes: 30 }),
    makeTask({ id: 'mid-soon', priority: 2, effort_minutes: 30, due_date: '2026-06-23' }),
    makeTask({ id: 'mid-later', priority: 2, effort_minutes: 30, due_date: '2026-06-26' }),
    makeTask({ id: 'mid-small', priority: 2, effort_minutes: 15 }),
  ]

  it('sorts by tier first, then priority, due date and effort inside it', () => {
    expect(plan(tasks).picks.map((p) => p.task.id)).toEqual([
      'mid-soon', // dated, 06-23
      'mid-later', // dated, 06-26
      'high', // undated, priority 3
      'mid-small', // undated, priority 2
      'low', // undated, priority 0
    ])
  })

  it('is deterministic — same input, same plan', () => {
    const a = plan(tasks)
    const b = plan([...tasks].reverse())
    expect(a.picks.map((p) => [p.task.id, p.date])).toEqual(b.picks.map((p) => [p.task.id, p.date]))
  })
})

describe('planWeek — estimates are for the calculation only', () => {
  it('charges an unestimated task the estimator’s value and flags it', () => {
    const result = plan([makeTask({ id: 'noeffort', effort_minutes: null })], {
      estimate: () => 45,
    })
    expect(result.picks[0].cost).toBe(45)
    expect(result.picks[0].estimated).toBe(true)
    // The task itself is untouched — the planner only proposes.
    expect(result.picks[0].task.effort_minutes).toBeNull()
  })

  it('marks a real estimate as not estimated', () => {
    expect(plan([makeTask({ effort_minutes: 60 })]).picks[0].estimated).toBe(false)
  })
})

describe('planWeek — kind empty states', () => {
  it('handles nothing eligible', () => {
    // Everything open is already on a day, so there is genuinely nothing to place.
    const result = plan([makeTask({ project_id: 'p1', scheduled_for: '2026-06-25' })])
    expect(result).toMatchObject({ taskCount: 0, candidateCount: 0, skipped: 0, weekFull: false })
    expect(result.days).toHaveLength(7)
    expect(result.alreadyPlanned).toBe(1)
  })

  it('an empty NARROW plan reports the backlog it is ignoring', () => {
    const result = plan([makeTask({ id: 'u', project_id: 'p1' })], { scope: 'dated' })
    expect(result.candidateCount).toBe(0)
    expect(result.excludedByScope).toBe(1)
    // The same task, one tap later.
    expect(plan([makeTask({ id: 'u', project_id: 'p1' })], { scope: 'all' }).taskCount).toBe(1)
  })

  it('handles no tasks at all', () => {
    const result = plan([])
    expect(result.taskCount).toBe(0)
    expect(result.totalMinutes).toBe(0)
    expect(result.days.every((d) => d.picks.length === 0)).toBe(true)
  })

  it('puts everything on day one when it all fits', () => {
    const result = plan([
      makeTask({ id: 'a', effort_minutes: 30 }),
      makeTask({ id: 'b', effort_minutes: 45 }),
    ])
    expect(result.days[0].picks).toHaveLength(2)
    expect(result.days.slice(1).every((d) => d.picks.length === 0)).toBe(true)
    expect(result.totalMinutes).toBe(75)
  })

  it('falls back to the default capacity when given a nonsense one', () => {
    const result = plan([makeTask({ effort_minutes: 30 })], { capacityMinutes: 0 })
    expect(result.days[0].remainingBefore).toBe(360 - 30 + 30) // DEFAULT_DAILY_CAPACITY_MINUTES
    expect(result.taskCount).toBe(1)
  })
})
