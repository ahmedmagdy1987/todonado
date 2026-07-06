import { describe, expect, it } from 'vitest'
import { makeTask, makeFocusSession } from '@/test/factories'
import {
  computeInsights,
  dailyEffortSeries,
  focusStats,
  lastNDays,
  rolloverStats,
  summaryFor,
} from './insights'

const TODAY = '2026-06-16'

describe('lastNDays', () => {
  it('returns n chronological local days ending today', () => {
    const days = lastNDays(7, TODAY)
    expect(days).toHaveLength(7)
    expect(days[0]).toBe('2026-06-10')
    expect(days[6]).toBe('2026-06-16')
  })
})

describe('dailyEffortSeries', () => {
  const tasks = [
    makeTask({ scheduled_for: TODAY, effort_minutes: 60, status: 'todo' }),
    makeTask({ scheduled_for: TODAY, effort_minutes: 30, status: 'done' }),
    makeTask({ scheduled_for: TODAY, effort_minutes: 50, status: 'cancelled' }), // excluded
    makeTask({ scheduled_for: '2026-06-15', effort_minutes: 120, status: 'done' }),
    makeTask({ scheduled_for: null, effort_minutes: 90, status: 'todo' }), // unscheduled, excluded
  ]
  const series = dailyEffortSeries(tasks, lastNDays(7, TODAY), 360)
  const byDate = (d: string) => series.find((p) => p.date === d)!

  it('sums planned effort excluding cancelled and unscheduled tasks', () => {
    expect(byDate(TODAY).plannedMinutes).toBe(90) // 60 + 30, not the cancelled 50
  })
  it('counts only done effort as completed', () => {
    expect(byDate(TODAY).completedMinutes).toBe(30)
    expect(byDate('2026-06-15').completedMinutes).toBe(120)
  })
  it('derives capacity % against the capacity', () => {
    expect(byDate(TODAY).capacityPct).toBe(25) // 90 / 360
    expect(byDate('2026-06-14').plannedMinutes).toBe(0)
    expect(byDate('2026-06-14').status).toBe('empty')
  })
})

describe('focusStats', () => {
  const sessions = [
    makeFocusSession({ started_at: '2026-06-16T12:00:00', actual_seconds: 1500, interruptions: 2, status: 'completed' }),
    makeFocusSession({ started_at: '2026-06-15T12:00:00', actual_seconds: 600, interruptions: 0, status: 'abandoned' }),
    makeFocusSession({ started_at: '2026-06-16T13:00:00', actual_seconds: 0, status: 'running' }), // ignored
    makeFocusSession({ started_at: '2026-05-01T12:00:00', actual_seconds: 3000, status: 'completed' }), // outside window
  ]
  const stats = focusStats(sessions, lastNDays(7, TODAY))

  it('counts only finished sessions inside the window', () => {
    expect(stats.sessionCount).toBe(2)
    expect(stats.completedSessions).toBe(1)
    expect(stats.abandonedSessions).toBe(1)
  })
  it('sums focus seconds and interruptions', () => {
    expect(stats.focusSeconds).toBe(2100)
    expect(stats.interruptions).toBe(2)
  })
  it('computes a completion rate from finished sessions', () => {
    expect(stats.completionRate).toBe(0.5)
  })
  it('buckets focus minutes per day', () => {
    expect(stats.daily.find((d) => d.date === '2026-06-16')!.minutes).toBe(25)
    expect(stats.daily.find((d) => d.date === '2026-06-15')!.minutes).toBe(10)
  })
  it('sums raw seconds per day and rounds once (no per-session rounding drift)', () => {
    // 20 abandoned sessions of 20s on one day = 400s ≈ 7 min. Per-session rounding
    // would floor each to 0 and show 0m; round-once shows the true 7.
    const many = Array.from({ length: 20 }, () =>
      makeFocusSession({ started_at: '2026-06-16T09:00:00', actual_seconds: 20, status: 'abandoned' }),
    )
    const s = focusStats(many, lastNDays(7, TODAY))
    expect(s.focusSeconds).toBe(400)
    expect(s.daily.find((d) => d.date === '2026-06-16')!.minutes).toBe(7) // round(400/60)
  })
  it('returns a null completion rate with no finished sessions', () => {
    expect(focusStats([], lastNDays(7, TODAY)).completionRate).toBeNull()
  })
})

describe('rolloverStats', () => {
  const tasks = [
    makeTask({ scheduled_for: '2026-06-10', status: 'todo' }), // overdue (oldest)
    makeTask({ scheduled_for: '2026-06-14', status: 'in_progress' }), // overdue
    makeTask({ scheduled_for: TODAY, status: 'todo' }), // today, not overdue
    makeTask({ scheduled_for: '2026-06-12', status: 'done', completed_at: '2026-06-13T12:00:00' }), // slipped
    makeTask({ scheduled_for: '2026-06-12', status: 'done', completed_at: '2026-06-12T12:00:00' }), // on time
  ]
  const r = rolloverStats(tasks, TODAY)

  it('counts the live overdue backlog and its oldest age', () => {
    expect(r.overdueCount).toBe(2)
    expect(r.oldestOverdueDays).toBe(6) // 06-16 minus 06-10
  })
  it('measures the slipped-past-plan ratio from completed tasks', () => {
    expect(r.completedWithPlan).toBe(2)
    expect(r.slippedCount).toBe(1)
    expect(r.slippedRatio).toBe(0.5)
    expect(r.onTimeRatio).toBe(0.5)
  })
  it('returns null ratios with no completed-with-plan basis', () => {
    expect(rolloverStats([], TODAY).slippedRatio).toBeNull()
  })
})

describe('summaryFor', () => {
  const tasks = [
    makeTask({ scheduled_for: TODAY, effort_minutes: 60, status: 'done' }),
    makeTask({ scheduled_for: TODAY, effort_minutes: 90, status: 'todo' }),
    makeTask({ scheduled_for: '2026-01-01', effort_minutes: 999, status: 'done' }), // outside 7d
  ]
  const sessions = [makeFocusSession({ started_at: '2026-06-16T12:00:00', actual_seconds: 1200, status: 'completed' })]
  const s = summaryFor(tasks, sessions, 7, TODAY)

  it('totals planned, completed, and focus within the window only', () => {
    expect(s.plannedMinutes).toBe(150) // 60 + 90 (not the old 999)
    expect(s.completedMinutes).toBe(60)
    expect(s.completedCount).toBe(1)
    expect(s.focusSeconds).toBe(1200)
  })
})

describe('computeInsights', () => {
  it('flags no data for an empty workspace', () => {
    const data = computeInsights([], [], 360, TODAY)
    expect(data.hasData).toBe(false)
    expect(data.daily).toHaveLength(14)
    expect(data.capacityAvgPct).toBe(0)
  })

  it('averages capacity on planning days and counts over-capacity days', () => {
    const tasks = [
      makeTask({ scheduled_for: TODAY, effort_minutes: 400, status: 'todo' }), // 111% -> over
      makeTask({ scheduled_for: '2026-06-15', effort_minutes: 180, status: 'todo' }), // 50%
    ]
    const data = computeInsights(tasks, [], 360, TODAY)
    expect(data.hasData).toBe(true)
    expect(data.planningDays).toBe(2)
    expect(data.daysOverCapacity).toBe(1)
    expect(data.capacityAvgPct).toBe(Math.round((111 + 50) / 2)) // 81
  })

  it('treats a non-finite capacity like any other invalid value (uses the default, consistently)', () => {
    const tasks = [makeTask({ scheduled_for: TODAY, effort_minutes: 400, status: 'todo' })]
    const data = computeInsights(tasks, [], Infinity, TODAY)
    // Everything computed against DEFAULT_DAILY_CAPACITY_MINUTES (360), not Infinity:
    expect(data.capacityMinutes).toBe(360)
    expect(data.daysOverCapacity).toBe(1) // 400 > 360
    expect(data.capacityAvgPct).toBe(Math.round((400 / 360) * 100)) // 111, not 0
  })
})
