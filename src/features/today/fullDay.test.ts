import { describe, expect, it } from 'vitest'
import { makeTask } from '@/test/factories'
import { withCalendar } from '@/features/calendar/capacity'
import { planWeek } from '@/features/week/planWeek'
import { planDay } from './autoPlan'
import { computeCapacity, suggestTasksToMoveTomorrow } from './capacity'

/**
 * A DAY THE CALENDAR HAS ALREADY FILLED.
 *
 * `effectiveCapacity` is `max(0, capacity − busy)`, so a day of back-to-back
 * meetings passes exactly ZERO to the planners. Both of them treated zero as
 * "unset" and substituted the six-hour default, so:
 *
 *   • "Plan my day" filled a day that had no room, promised it would never go
 *     over, and then wrote it;
 *   • the overbooking guard computed `planned − 360`, went negative, and
 *     returned nothing on precisely the day it exists for.
 *
 * `/week` computed the same remainder WITHOUT a fallback and refused the day,
 * so the two surfaces disagreed about the same calendar. These tests pin the
 * agreement, and pin that a raw (non-derived) capacity still falls back.
 */

const TODAY = '2026-07-31'
const estimate = () => 30

describe('a fully-booked day has no room, and both planners agree', () => {
  it('withCalendar reports exactly zero when meetings consume the day', () => {
    const cal = withCalendar(60, 360, 420)
    expect(cal.effectiveCapacity).toBe(0)
    expect(cal.summary.status).toBe('over')
  })

  it('planDay picks NOTHING when the remaining capacity is zero', () => {
    const tasks = [
      makeTask({ id: 'a', title: 'Meeting prep', effort_minutes: 60, scheduled_for: TODAY }),
      makeTask({ id: 'b1', title: 'Backlog one', effort_minutes: 120, scheduled_for: null }),
      makeTask({ id: 'b2', title: 'Backlog two', effort_minutes: 120, scheduled_for: null }),
    ]
    const plan = planDay(tasks, 0, TODAY, estimate)
    expect(plan.picks).toEqual([])
    expect(plan.capacityFull).toBe(true)
    expect(plan.remainingCapacity).toBe(0)
  })

  it('an EXACT fit leaves no room either', () => {
    // busy === capacity, the boundary the old `> 0` guard also mishandled.
    const cal = withCalendar(0, 360, 360)
    expect(cal.effectiveCapacity).toBe(0)
    expect(planDay([makeTask({ id: 'x', effort_minutes: 30 })], cal.effectiveCapacity, TODAY, estimate).picks).toEqual([])
  })

  it('the overbooking guard still suggests moving work when the day is full', () => {
    const todayTasks = [
      makeTask({ id: 'a', title: 'Low', effort_minutes: 30, priority: 0, scheduled_for: TODAY }),
      makeTask({ id: 'b', title: 'High', effort_minutes: 30, priority: 3, scheduled_for: TODAY }),
    ]
    const suggestions = suggestTasksToMoveTomorrow(todayTasks, 0)
    expect(suggestions.length, 'the guard must not go silent on a full day').toBeGreaterThan(0)
    // Lowest priority first — the guard's own rule, unchanged.
    expect(suggestions[0].id).toBe('a')
  })

  it('/week and /today reach the SAME answer for the same full day', () => {
    const tasks = [makeTask({ id: 'b1', title: 'Backlog', effort_minutes: 120, scheduled_for: null })]
    const dayPlan = planDay(tasks, 0, TODAY, estimate)
    const weekPlan = planWeek({
      tasks,
      capacityMinutes: 360,
      todayStr: TODAY,
      estimate,
      // Every day of the week fully booked.
      busyByDate: new Map(
        Array.from({ length: 7 }, (_, i) => {
          const d = new Date(`${TODAY}T12:00:00`)
          d.setDate(d.getDate() + i)
          return [d.toISOString().slice(0, 10), 400] as const
        }),
      ),
    })
    expect(dayPlan.picks).toEqual([])
    expect(weekPlan.picks).toEqual([])
  })
})

describe('a RAW capacity still falls back — the guard was not simply deleted', () => {
  it('computeCapacity keeps treating a non-positive raw capacity as unset', () => {
    // It divides by capacity, so a zero here really is nonsense. The capacity
    // editor's own floor is 15 minutes, so this only guards a corrupt profile.
    expect(computeCapacity(180, 0).capacityMinutes).toBe(360)
    expect(computeCapacity(180, Number.NaN).capacityMinutes).toBe(360)
  })

  it('the planners still fall back on a NON-FINITE capacity', () => {
    const tasks = [makeTask({ id: 'b', effort_minutes: 60, scheduled_for: null })]
    expect(planDay(tasks, Number.NaN, TODAY, estimate).picks.length).toBe(1)
    expect(
      suggestTasksToMoveTomorrow(
        [makeTask({ id: 'a', effort_minutes: 600, scheduled_for: TODAY })],
        Number.NaN,
      ).length,
    ).toBe(1)
  })
})
