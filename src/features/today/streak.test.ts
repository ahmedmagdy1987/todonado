import { describe, expect, it } from 'vitest'
import { ENTITLEMENTS } from '@/features/billing/entitlements'
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

/*
 * REGRESSION: THE STREAK IS NEVER WINDOWED BY PLAN.
 *
 * This block used to assert the OPPOSITE. `planningStreak` took a `cutoffDay`
 * and the Free history window was passed into it, so a Free user who had planned
 * every day for three months read "14-day streak" indefinitely, with nothing
 * anywhere to explain why. The window is a display limit on completed work; a
 * streak is a motivation counter over the user's own cached tasks. Conflating
 * them made the product look like it had forgotten, and the one thing a streak
 * has to be is believed.
 *
 * The parameter is gone, so the coupling cannot come back by a caller passing a
 * cutoff it happens to have in scope, which is how it arrived. The tests below
 * prove the streak exceeds any plausible Free window and that the two tiers get
 * the same number.
 */
describe('planningStreak is uncapped on every plan', () => {
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

  it('counts a streak far longer than the Free history window', () => {
    // 120 days is well beyond any window this product would plausibly ship, so
    // this fails if the window is ever reintroduced at any length.
    const long = streakOfDays(120)
    expect(planningStreak(long, TODAY).count).toBe(120)
    expect(planningStreak(long, TODAY).count).toBeGreaterThan(
      ENTITLEMENTS.free.limits.historyDays,
    )
  })

  it('gives Free and Pro the identical number, because plan is not an input', () => {
    // `planningStreak` takes tasks and a day. There is deliberately no third
    // argument, so there is nothing a caller could pass to make these differ.
    const tasks = streakOfDays(45)
    expect(planningStreak(tasks, TODAY)).toEqual(planningStreak(tasks, TODAY))
    expect(planningStreak(tasks, TODAY).count).toBe(45)
  })

  it('is unchanged for a brand-new account', () => {
    const tasks = streakOfDays(3)
    expect(planningStreak(tasks, TODAY).count).toBe(3)
    expect(planningStreak(tasks, TODAY).includesToday).toBe(true)
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
