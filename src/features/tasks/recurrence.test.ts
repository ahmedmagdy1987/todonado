import { describe, it, expect } from 'vitest'
import { computeNextOccurrence, buildNextOccurrence, nextOccurrenceDate } from './recurrence'
import { makeTask } from '@/test/factories'

// Reference: 2026-06-01 is a Monday (getDay 1).
const MON = '2026-06-01'

describe('computeNextOccurrence — daily', () => {
  it('adds interval days', () => {
    expect(computeNextOccurrence({ freq: 'daily', interval: 1 }, MON)).toBe('2026-06-02')
    expect(computeNextOccurrence({ freq: 'daily', interval: 3 }, MON)).toBe('2026-06-04')
  })
})

describe('computeNextOccurrence — weekly', () => {
  it('same single weekday → +1 week', () => {
    expect(computeNextOccurrence({ freq: 'weekly', interval: 1, weekdays: [1] }, MON)).toBe(
      '2026-06-08',
    )
  })

  it('multi-weekday → next selected day in the same week', () => {
    // Mon(1) + Wed(3); from Mon -> Wed same week
    expect(computeNextOccurrence({ freq: 'weekly', interval: 1, weekdays: [1, 3] }, MON)).toBe(
      '2026-06-03',
    )
  })

  it('interval 2 weeks skips the off week', () => {
    expect(computeNextOccurrence({ freq: 'weekly', interval: 2, weekdays: [1] }, MON)).toBe(
      '2026-06-15',
    )
  })

  it('no weekdays → falls back to +interval weeks', () => {
    expect(computeNextOccurrence({ freq: 'weekly', interval: 1, weekdays: [] }, MON)).toBe(
      '2026-06-08',
    )
  })

  it('multi-weekday + interval 2 weeks (trickiest path)', () => {
    // from Wed 2026-06-03, on Mon+Wed, every 2 weeks → next on-interval week = 06-15 (Mon)
    expect(
      computeNextOccurrence({ freq: 'weekly', interval: 2, weekdays: [1, 3] }, '2026-06-03'),
    ).toBe('2026-06-15')
  })

  it('drops out-of-range weekday values', () => {
    expect(
      computeNextOccurrence({ freq: 'weekly', interval: 1, weekdays: [1, 7, -1] }, MON),
    ).toBe('2026-06-08')
  })

  it('respects the until cutoff on the weekly path', () => {
    expect(
      computeNextOccurrence({ freq: 'weekly', interval: 1, weekdays: [1], until: '2026-06-05' }, MON),
    ).toBeNull()
  })
})

describe('computeNextOccurrence — monthly (month-end clamp)', () => {
  it('adds interval months', () => {
    expect(computeNextOccurrence({ freq: 'monthly', interval: 3 }, '2026-01-15')).toBe(
      '2026-04-15',
    )
  })

  it('clamps Jan 31 -> Feb 28 in a non-leap year', () => {
    expect(computeNextOccurrence({ freq: 'monthly', interval: 1 }, '2026-01-31')).toBe(
      '2026-02-28',
    )
  })

  it('clamps Jan 31 -> Feb 29 in a leap year', () => {
    expect(computeNextOccurrence({ freq: 'monthly', interval: 1 }, '2028-01-31')).toBe(
      '2028-02-29',
    )
  })
})

describe('computeNextOccurrence — yearly', () => {
  it('adds interval years', () => {
    expect(computeNextOccurrence({ freq: 'yearly', interval: 1 }, '2026-03-10')).toBe(
      '2027-03-10',
    )
  })

  it('clamps Feb 29 -> Feb 28 onto a non-leap year', () => {
    expect(computeNextOccurrence({ freq: 'yearly', interval: 1 }, '2028-02-29')).toBe(
      '2029-02-28',
    )
  })
})

describe('computeNextOccurrence — until cutoff', () => {
  it('returns null when the next date is past until', () => {
    expect(
      computeNextOccurrence({ freq: 'daily', interval: 1, until: '2026-06-01' }, MON),
    ).toBeNull()
  })

  it('allows a next date equal to until', () => {
    expect(
      computeNextOccurrence({ freq: 'daily', interval: 1, until: '2026-06-02' }, MON),
    ).toBe('2026-06-02')
  })

  it('allows a next date before until', () => {
    expect(
      computeNextOccurrence({ freq: 'daily', interval: 1, until: '2026-06-30' }, MON),
    ).toBe('2026-06-02')
  })
})

describe('buildNextOccurrence (spawn on complete)', () => {
  it('returns null for non-recurring tasks', () => {
    expect(buildNextOccurrence(makeTask({ recurrence_freq: null }))).toBeNull()
  })

  it('advances scheduled_for and carries the rule + copies fields', () => {
    const task = makeTask({
      title: 'Water plants',
      notes: 'kitchen + balcony',
      project_id: 'p1',
      section_id: 's1',
      effort_minutes: 15,
      priority: 2,
      scheduled_for: MON,
      due_date: null,
      recurrence_freq: 'daily',
      recurrence_interval: 2,
    })
    const next = buildNextOccurrence(task, MON)
    expect(next).not.toBeNull()
    expect(next?.scheduled_for).toBe('2026-06-03')
    expect(next?.due_date).toBeNull()
    expect(next?.title).toBe('Water plants')
    expect(next?.notes).toBe('kitchen + balcony')
    expect(next?.project_id).toBe('p1')
    expect(next?.section_id).toBe('s1')
    expect(next?.effort_minutes).toBe(15)
    expect(next?.priority).toBe(2)
    expect(next?.recurrence_freq).toBe('daily')
    expect(next?.recurrence_interval).toBe(2)
  })

  it('advances due_date when the task is due-dated (on-time → month-end clamp)', () => {
    const task = makeTask({
      due_date: '2026-01-31',
      scheduled_for: null,
      recurrence_freq: 'monthly',
      recurrence_interval: 1,
    })
    // Completed on its due date (on-time) so it anchors normally; this exercises
    // the Jan-31 → Feb-28 month-end clamp without the overdue-recovery path.
    const next = buildNextOccurrence(task, '2026-01-31')
    expect(next?.due_date).toBe('2026-02-28')
    expect(next?.scheduled_for).toBeNull()
  })

  it('anchors a dateless recurring task to a concrete next due date', () => {
    const task = makeTask({
      due_date: null,
      scheduled_for: null,
      recurrence_freq: 'daily',
      recurrence_interval: 1,
    })
    const next = buildNextOccurrence(task, MON)
    expect(next?.due_date).toBe('2026-06-02') // anchored on today (MON) + 1
    expect(next?.scheduled_for).toBeNull()
  })

  it('does not spawn past the end date', () => {
    const task = makeTask({
      scheduled_for: MON,
      recurrence_freq: 'daily',
      recurrence_interval: 1,
      recurrence_until: '2026-06-01',
    })
    expect(buildNextOccurrence(task, MON)).toBeNull()
  })
})

describe('nextOccurrenceDate — overdue recovery (anchor from today)', () => {
  it('on-time task advances exactly one interval from its own date', () => {
    const t = makeTask({ scheduled_for: '2026-06-04', recurrence_freq: 'daily', recurrence_interval: 1 })
    expect(nextOccurrenceDate(t, '2026-06-04')).toBe('2026-06-05')
  })

  it('overdue daily task lands on the day after TODAY, not one day after the stale date', () => {
    const t = makeTask({ scheduled_for: '2026-05-20', recurrence_freq: 'daily', recurrence_interval: 1 })
    // Stale-anchor math would give 2026-05-21 (still ~2 weeks overdue); recovery → next future day.
    expect(nextOccurrenceDate(t, '2026-06-04')).toBe('2026-06-05')
  })

  it('overdue weekly task preserves its weekday phase (next Monday after today)', () => {
    // Mondays; 2026-06-01 and 2026-06-08 are Mondays; today is Thu 2026-06-04.
    const t = makeTask({
      scheduled_for: '2026-05-04',
      recurrence_freq: 'weekly',
      recurrence_interval: 1,
      recurrence_weekdays: [1],
    })
    expect(nextOccurrenceDate(t, '2026-06-04')).toBe('2026-06-08')
  })

  it('returns null when an overdue recurrence has already passed its until date', () => {
    const t = makeTask({
      scheduled_for: '2026-05-20',
      recurrence_freq: 'daily',
      recurrence_interval: 1,
      recurrence_until: '2026-05-25',
    })
    expect(nextOccurrenceDate(t, '2026-06-04')).toBeNull()
  })

  it('buildNextOccurrence spawns a future-dated clone for an overdue task', () => {
    const t = makeTask({ scheduled_for: '2026-05-20', recurrence_freq: 'daily', recurrence_interval: 1 })
    expect(buildNextOccurrence(t, '2026-06-04')?.scheduled_for).toBe('2026-06-05')
  })
})
