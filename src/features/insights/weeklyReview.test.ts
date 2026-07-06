import { describe, expect, it } from 'vitest'
import { makeTask, makeFocusSession } from '@/test/factories'
import { computeWeeklyReview, WEEKLY_MIN_DAYS } from './weeklyReview'

const TODAY = '2026-06-16' // a Tuesday
// This week (rolling 7): 06-10 .. 06-16.  Last week: 06-03 .. 06-09.

describe('computeWeeklyReview', () => {
  it('flags not-enough-data below the minimum logged days (non-shaming empty state)', () => {
    const r = computeWeeklyReview([], [], 360, TODAY)
    expect(r.daysLogged).toBe(0)
    expect(r.hasEnoughData).toBe(false)
    expect(r.bestDay).toBeNull()
    expect(r.thisWeek.plannedMinutes).toBe(0)
  })

  it('sums this-week vs last-week planned/completed/focus from the right windows', () => {
    const tasks = [
      // This week
      makeTask({ scheduled_for: '2026-06-16', effort_minutes: 60, status: 'done' }),
      makeTask({ scheduled_for: '2026-06-15', effort_minutes: 30, status: 'todo' }),
      makeTask({ scheduled_for: '2026-06-12', effort_minutes: 90, status: 'done' }),
      // Last week
      makeTask({ scheduled_for: '2026-06-08', effort_minutes: 45, status: 'done' }),
      makeTask({ scheduled_for: '2026-06-04', effort_minutes: 45, status: 'todo' }),
      // Outside both windows (ignored)
      makeTask({ scheduled_for: '2026-05-01', effort_minutes: 999, status: 'done' }),
    ]
    const sessions = [
      makeFocusSession({ started_at: '2026-06-16T09:00:00', actual_seconds: 1500, status: 'completed' }), // 25m this week
      makeFocusSession({ started_at: '2026-06-05T09:00:00', actual_seconds: 600, status: 'completed' }), // 10m last week
    ]
    const r = computeWeeklyReview(tasks, sessions, 360, TODAY)

    expect(r.thisWeek.plannedMinutes).toBe(180) // 60 + 30 + 90
    expect(r.thisWeek.completedMinutes).toBe(150) // 60 + 90
    expect(r.thisWeek.completedCount).toBe(2)
    expect(r.thisWeek.focusMinutes).toBe(25)
    expect(r.thisWeek.completionRate).toBeCloseTo(150 / 180)

    expect(r.lastWeek.plannedMinutes).toBe(90) // 45 + 45
    expect(r.lastWeek.completedMinutes).toBe(45)
    expect(r.lastWeek.focusMinutes).toBe(10)

    expect(r.focusDeltaMinutes).toBe(15) // 25 − 10
    expect(r.completionRateDelta).toBeCloseTo(150 / 180 - 45 / 90)
    expect(r.hasEnoughData).toBe(true)
    expect(r.daily).toHaveLength(7)
  })

  it('picks the best day by completed effort', () => {
    const tasks = [
      makeTask({ scheduled_for: '2026-06-16', effort_minutes: 60, status: 'done' }),
      makeTask({ scheduled_for: '2026-06-12', effort_minutes: 90, status: 'done' }),
      makeTask({ scheduled_for: '2026-06-11', effort_minutes: 30, status: 'done' }),
    ]
    const r = computeWeeklyReview(tasks, [], 360, TODAY)
    expect(r.bestDay).toEqual({ date: '2026-06-12', completedMinutes: 90 })
  })

  it('leaves completionRateDelta null when a week has no planned effort', () => {
    const tasks = [makeTask({ scheduled_for: '2026-06-16', effort_minutes: 60, status: 'done' })]
    const r = computeWeeklyReview(tasks, [], 360, TODAY)
    expect(r.thisWeek.completionRate).toBe(1)
    expect(r.lastWeek.completionRate).toBeNull()
    expect(r.completionRateDelta).toBeNull()
  })

  it('requires at least WEEKLY_MIN_DAYS of activity to be "enough"', () => {
    // Exactly one day with activity → not enough.
    const oneDay = computeWeeklyReview(
      [makeTask({ scheduled_for: '2026-06-16', effort_minutes: 60, status: 'todo' })],
      [],
      360,
      TODAY,
    )
    expect(oneDay.daysLogged).toBe(1)
    expect(oneDay.hasEnoughData).toBe(WEEKLY_MIN_DAYS <= 1)

    // Two distinct days → enough (with WEEKLY_MIN_DAYS = 2).
    const twoDays = computeWeeklyReview(
      [
        makeTask({ scheduled_for: '2026-06-16', effort_minutes: 60, status: 'todo' }),
        makeTask({ scheduled_for: '2026-06-14', effort_minutes: 30, status: 'todo' }),
      ],
      [],
      360,
      TODAY,
    )
    expect(twoDays.daysLogged).toBe(2)
    expect(twoDays.hasEnoughData).toBe(true)
  })
})
