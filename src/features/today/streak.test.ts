import { describe, expect, it } from 'vitest'
import { computePlanningStreak, planningDaysFromTasks, planningStreak } from './streak'
import { historyCutoffDay } from '@/features/history/historyWindow'
import { FREE_HISTORY_DAYS } from '@/lib/config'
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

describe('planningStreak under a plan history window', () => {
  const FREE_CUTOFF = historyCutoffDay(FREE_HISTORY_DAYS, TODAY) // 2026-06-10

  /** Tasks scheduled on each of the `n` local days ending today. */
  function streakOfDays(n: number) {
    const days: string[] = []
    const d = new Date(`${TODAY}T00:00:00`)
    for (let i = 0; i < n; i += 1) {
      const copy = new Date(d)
      copy.setDate(copy.getDate() - i)
      days.push(
        `${copy.getFullYear()}-${String(copy.getMonth() + 1).padStart(2, '0')}-${String(copy.getDate()).padStart(2, '0')}`,
      )
    }
    return days.map((day) => makeTask({ scheduled_for: day }))
  }

  it('shows the FULL streak with no window (Pro)', () => {
    expect(planningStreak(streakOfDays(30), TODAY, null).count).toBe(30)
  })

  it('caps a Free streak at the window — never counts days it cannot show', () => {
    // 2026-06-10 .. 2026-06-23 inclusive = 14 days.
    expect(planningStreak(streakOfDays(30), TODAY, FREE_CUTOFF).count).toBe(FREE_HISTORY_DAYS)
  })

  it('is identical on both plans when the streak fits inside the window', () => {
    const tasks = streakOfDays(5)
    expect(planningStreak(tasks, TODAY, FREE_CUTOFF)).toEqual(planningStreak(tasks, TODAY, null))
  })

  it('is unchanged for a brand-new user — first run can never hit the window', () => {
    const tasks = streakOfDays(3) // a 3-day-old account
    expect(planningStreak(tasks, TODAY, FREE_CUTOFF).count).toBe(3)
    expect(planningStreak(tasks, TODAY, FREE_CUTOFF).includesToday).toBe(true)
  })

  it('defaults to unlimited when no cutoff is passed (back-compatible)', () => {
    expect(planningStreak(streakOfDays(30), TODAY).count).toBe(30)
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
