import { describe, expect, it } from 'vitest'
import { isPlanCandidate, planDay } from './autoPlan'
import { makeTask } from '@/test/factories'

const TODAY = '2026-06-23'
const flat = () => 30 // constant estimator for effortless tasks

describe('isPlanCandidate', () => {
  it('includes open work that is not already on a day', () => {
    expect(isPlanCandidate(makeTask({ project_id: null }), TODAY)).toBe(true) // inbox
    expect(
      isPlanCandidate(makeTask({ project_id: 'p', scheduled_for: '2026-06-20' }), TODAY),
    ).toBe(true) // overdue project task
    expect(isPlanCandidate(makeTask({ project_id: 'p', due_date: TODAY }), TODAY)).toBe(true) // due today
    // excluded:
    expect(isPlanCandidate(makeTask({ status: 'done' }), TODAY)).toBe(false)
    expect(isPlanCandidate(makeTask({ scheduled_for: TODAY }), TODAY)).toBe(false) // already today
    expect(isPlanCandidate(makeTask({ scheduled_for: '2026-06-30' }), TODAY)).toBe(false) // future
  })

  /**
   * THE REGRESSION. This file used to assert the opposite:
   *
   *     expect(isPlanCandidate(makeTask({ project_id: 'p' }), TODAY)).toBe(false)
   *                                                    // "project backlog, not due"
   *
   * which is exactly the rule that made "Plan my day" report an empty day to
   * someone with a full project. It was not an oversight — it was deliberate,
   * and it was wrong. Capacity is what stops a backlog being dumped on anyone.
   */
  it('PLANS PROJECT WORK THAT HAS NO DEADLINE — the "nothing to plan" bug', () => {
    expect(isPlanCandidate(makeTask({ project_id: 'p' }), TODAY)).toBe(true)
  })

  it('the narrow scope is still available, and is opt-in', () => {
    const undatedProjectTask = makeTask({ project_id: 'p' })
    expect(isPlanCandidate(undatedProjectTask, TODAY, 'dated')).toBe(false)
    expect(isPlanCandidate(undatedProjectTask, TODAY, 'all')).toBe(true)
    // Overdue and due-today survive the narrow scope, which is the point of it.
    expect(isPlanCandidate(makeTask({ project_id: 'p', due_date: TODAY }), TODAY, 'dated')).toBe(true)
    expect(
      isPlanCandidate(makeTask({ project_id: 'p', scheduled_for: '2026-06-01' }), TODAY, 'dated'),
    ).toBe(true)
  })
})

describe('planDay', () => {
  it('greedily fills within remaining capacity and never exceeds it', () => {
    const tasks = [
      makeTask({ id: 'a', effort_minutes: 30, priority: 3 }),
      makeTask({ id: 'b', effort_minutes: 30, priority: 2 }),
      makeTask({ id: 'c', effort_minutes: 30, priority: 1 }),
    ]
    const plan = planDay(tasks, 60, TODAY, flat)
    expect(plan.picks.map((p) => p.task.id)).toEqual(['a', 'b']) // priority desc, fits 60
    expect(plan.totalMinutes).toBe(60)
    expect(plan.totalMinutes).toBeLessThanOrEqual(plan.remainingCapacity)
    expect(plan.skipped).toBe(1)
    expect(plan.capacityFull).toBe(false)
  })

  /**
   * Tiers before attributes: overdue, then dated, then undated project work,
   * then loose capture. Priority, deadline and effort break ties INSIDE a tier.
   *
   * This replaces a pure "priority first" order. A high-priority task with no
   * date used to outrank a deadline landing tomorrow, which is the wrong answer
   * when one of them can actually be late.
   */
  it('orders by tier first: overdue → dated → project backlog → inbox', () => {
    const tasks = [
      makeTask({ id: 'inbox-high', priority: 3, project_id: null }),
      makeTask({ id: 'proj-undated', priority: 0, project_id: 'p' }),
      makeTask({ id: 'dated-late', priority: 0, due_date: '2026-06-30' }),
      makeTask({ id: 'overdue', priority: 0, due_date: '2026-06-01' }),
    ]
    const plan = planDay(tasks, 1000, TODAY, flat)
    expect(plan.picks.map((p) => p.task.id)).toEqual([
      'overdue', // late beats everything
      'dated-late', // a deadline beats no deadline, whatever the priority
      'proj-undated', // deliberate work
      'inbox-high', // loose capture last, even at priority 3
    ])
  })

  it('inside a tier: priority → due date (soonest first) → effort (smaller first)', () => {
    const tasks = [
      makeTask({ id: 'low-soon', priority: 1, due_date: '2026-06-25', effort_minutes: 20 }),
      makeTask({ id: 'high-late', priority: 3, due_date: '2026-06-30', effort_minutes: 20 }),
      makeTask({ id: 'p1-late', priority: 1, due_date: '2026-06-28', effort_minutes: 20 }),
      makeTask({ id: 'p1-soon-big', priority: 1, due_date: '2026-06-25', effort_minutes: 50 }),
    ]
    const plan = planDay(tasks, 1000, TODAY, flat)
    // All four are `dated` (none late), so the old tiebreakers decide.
    expect(plan.picks.map((p) => p.task.id)).toEqual([
      'high-late', // priority 3 wins
      'low-soon', // p1, due 06-25, 20m
      'p1-soon-big', // p1, due 06-25, 50m (same due, larger effort after)
      'p1-late', // p1, due 06-28
    ])
  })

  it('uses the estimate for effortless tasks (calc only, marked estimated)', () => {
    const plan = planDay([makeTask({ id: 'x', effort_minutes: null })], 100, TODAY, () => 25)
    expect(plan.picks[0].estimated).toBe(true)
    expect(plan.picks[0].cost).toBe(25)
    // The task's own effort is never mutated by the planner.
    expect(plan.picks[0].task.effort_minutes).toBeNull()
  })

  it('reports capacityFull when today is already at capacity', () => {
    const tasks = [makeTask({ id: 't', effort_minutes: 60, scheduled_for: TODAY })]
    const plan = planDay(tasks, 60, TODAY, flat)
    expect(plan.capacityFull).toBe(true)
    expect(plan.remainingCapacity).toBe(0)
    expect(plan.picks).toHaveLength(0)
  })

  it('subtracts already-planned today effort from remaining capacity', () => {
    const tasks = [
      makeTask({ id: 'planned', effort_minutes: 40, scheduled_for: TODAY }),
      makeTask({ id: 'cand', effort_minutes: 30 }),
    ]
    const plan = planDay(tasks, 60, TODAY, flat) // 60 − 40 = 20 left; 30 won't fit
    expect(plan.remainingCapacity).toBe(20)
    expect(plan.picks).toHaveLength(0)
    expect(plan.candidateCount).toBe(1)
    expect(plan.skipped).toBe(1)
  })

  it('returns no candidates only when there is genuinely nothing left', () => {
    const tasks = [
      makeTask({ status: 'done' }),
      makeTask({ scheduled_for: '2026-06-30' }), // future
      makeTask({ scheduled_for: TODAY }), // already today
    ]
    const plan = planDay(tasks, 360, TODAY, flat)
    expect(plan.candidateCount).toBe(0)
    expect(plan.picks).toHaveLength(0)
    expect(plan.capacityFull).toBe(false)
    // ...and it can SAY so: two open tasks are already on a day.
    expect(plan.alreadyPlanned).toBe(2)
    expect(plan.excludedByScope).toBe(0)
  })

  it('an empty NARROW plan reports the backlog it is ignoring, so the UI can offer it', () => {
    const tasks = [
      makeTask({ id: 'a', project_id: 'p', effort_minutes: 30 }),
      makeTask({ id: 'b', project_id: 'p', effort_minutes: 30 }),
      makeTask({ id: 'c', scheduled_for: TODAY }),
    ]
    const narrow = planDay(tasks, 360, TODAY, flat, 'dated')
    expect(narrow.candidateCount).toBe(0)
    expect(narrow.excludedByScope, 'the two undated project tasks').toBe(2)
    expect(narrow.alreadyPlanned).toBe(1)

    // One tap later, the same tasks are a real plan.
    const wide = planDay(tasks, 360, TODAY, flat, 'all')
    expect(wide.picks.map((p) => p.task.id)).toEqual(['a', 'b'])
    expect(wide.excludedByScope).toBe(0)
  })

  it('never exceeds remaining capacity even with one huge task', () => {
    const plan = planDay([makeTask({ id: 'huge', effort_minutes: 200 })], 60, TODAY, flat)
    expect(plan.candidateCount).toBe(1)
    expect(plan.picks).toHaveLength(0)
    expect(plan.skipped).toBe(1)
    expect(plan.totalMinutes).toBe(0)
  })

  it('charges estimated picks so a second run never overcommits (never-over holds across apply)', () => {
    const backlog = [
      makeTask({ id: 'a', project_id: null, effort_minutes: null }),
      makeTask({ id: 'b', project_id: null, effort_minutes: null }),
      makeTask({ id: 'c', project_id: null, effort_minutes: null }),
      makeTask({ id: 'd', project_id: null, effort_minutes: null }),
    ]
    const est = () => 30
    const run1 = planDay(backlog, 60, TODAY, est)
    expect(run1.picks).toHaveLength(2) // 2 × 30 fills the 60-minute capacity

    // Simulate apply: the picked tasks get scheduled_for=today, effort stays null.
    const applied = backlog.map((t) =>
      run1.picks.some((p) => p.task.id === t.id) ? { ...t, scheduled_for: TODAY } : t,
    )
    const run2 = planDay(applied, 60, TODAY, est)
    // The two applied-but-unestimated tasks are charged their estimate (60 total),
    // so the day is full — the second run adds nothing (previously it re-filled).
    expect(run2.remainingCapacity).toBe(0)
    expect(run2.capacityFull).toBe(true)
    expect(run2.picks).toHaveLength(0)
  })
})
