import { describe, expect, it } from 'vitest'
import { computePlanningStreak, planningDaysFromTasks, planningStreak } from './streak'
import { makeTask } from '@/test/factories'

const TODAY = '2026-06-23'

describe('planningDaysFromTasks', () => {
  it('counts a day with a scheduled task OR a completed task (local day)', () => {
    const days = planningDaysFromTasks([
      makeTask({ scheduled_for: '2026-06-23' }),
      makeTask({ status: 'done', completed_at: '2026-06-20T12:00:00' }), // noon → no midnight cross
      makeTask({ status: 'todo', scheduled_for: null }), // contributes nothing
    ])
    expect(days.has('2026-06-23')).toBe(true)
    expect(days.has('2026-06-20')).toBe(true)
    expect(days.size).toBe(2)
  })

  it('does not count a done task with no completed_at and no schedule', () => {
    expect(planningDaysFromTasks([makeTask({ status: 'done', completed_at: null })]).size).toBe(0)
  })
})

describe('computePlanningStreak', () => {
  const set = (...days: string[]) => new Set(days)

  it('counts consecutive days ending today', () => {
    const s = computePlanningStreak(set('2026-06-21', '2026-06-22', '2026-06-23'), TODAY)
    expect(s).toEqual({ count: 3, includesToday: true })
  })

  it('keeps the streak alive when today is not planned yet but yesterday was (grace day)', () => {
    const s = computePlanningStreak(set('2026-06-21', '2026-06-22'), TODAY)
    expect(s).toEqual({ count: 2, includesToday: false })
  })

  it('is 0 when neither today nor yesterday is a planning day (broken, no shame)', () => {
    expect(computePlanningStreak(set('2026-06-20'), TODAY)).toEqual({ count: 0, includesToday: false })
    expect(computePlanningStreak(set(), TODAY)).toEqual({ count: 0, includesToday: false })
  })

  it('stops at the first gap', () => {
    // today + day-before-yesterday, but yesterday missing → only today counts
    const s = computePlanningStreak(set('2026-06-23', '2026-06-21'), TODAY)
    expect(s).toEqual({ count: 1, includesToday: true })
  })

  it('a single planned day today is a 1-day streak', () => {
    expect(computePlanningStreak(set(TODAY), TODAY)).toEqual({ count: 1, includesToday: true })
  })

  it('is idempotent for the same day (recomputing does not change it)', () => {
    const days = set('2026-06-22', '2026-06-23')
    expect(computePlanningStreak(days, TODAY)).toEqual(computePlanningStreak(days, TODAY))
  })

  it('crosses a month boundary correctly', () => {
    const s = computePlanningStreak(set('2026-05-31', '2026-06-01', '2026-06-02'), '2026-06-02')
    expect(s.count).toBe(3)
  })
})

describe('planningStreak (from tasks)', () => {
  it('derives the streak end-to-end from the tasks cache', () => {
    const tasks = [
      makeTask({ scheduled_for: '2026-06-23' }),
      makeTask({ scheduled_for: '2026-06-22' }),
      makeTask({ status: 'done', completed_at: '2026-06-21T12:00:00' }),
    ]
    expect(planningStreak(tasks, TODAY)).toEqual({ count: 3, includesToday: true })
  })
})
