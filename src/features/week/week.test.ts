import { describe, expect, it } from 'vitest'
import { makeTask } from '@/test/factories'
import { WEEK_LENGTH, buildWeek, weekDates, weekPlannedMinutes } from './week'

const TODAY = '2026-06-22' // a Monday
const CAPACITY = 360

describe('weekDates', () => {
  it('returns the next 7 local days starting today', () => {
    expect(weekDates(TODAY)).toEqual([
      '2026-06-22',
      '2026-06-23',
      '2026-06-24',
      '2026-06-25',
      '2026-06-26',
      '2026-06-27',
      '2026-06-28',
    ])
  })

  it('crosses month and year boundaries', () => {
    expect(weekDates('2026-06-29')).toContain('2026-07-01')
    expect(weekDates('2025-12-29')).toContain('2026-01-01')
  })

  it('honours a custom length and tolerates zero', () => {
    expect(weekDates(TODAY, 3)).toHaveLength(3)
    expect(weekDates(TODAY, 0)).toEqual([])
  })
})

describe('buildWeek — day composition', () => {
  it('always produces 7 columns, today first', () => {
    const days = buildWeek({ todayStr: TODAY, tasks: [], capacityMinutes: CAPACITY })
    expect(days).toHaveLength(WEEK_LENGTH)
    expect(days[0].date).toBe(TODAY)
    expect(days[0].isToday).toBe(true)
    expect(days.slice(1).every((d) => !d.isToday)).toBe(true)
    expect(days[0].weekday).toBe('Mon')
    expect(days[0].dayOfMonth).toBe(22)
  })

  it('places each task on the day its scheduled_for names', () => {
    const days = buildWeek({
      todayStr: TODAY,
      capacityMinutes: CAPACITY,
      tasks: [
        makeTask({ id: 'a', scheduled_for: '2026-06-22' }),
        makeTask({ id: 'b', scheduled_for: '2026-06-24' }),
        makeTask({ id: 'c', scheduled_for: '2026-06-24' }),
      ],
    })
    expect(days[0].tasks.map((t) => t.id)).toEqual(['a'])
    expect(days[2].tasks.map((t) => t.id)).toEqual(['b', 'c'])
    expect(days[1].tasks).toEqual([])
  })

  it('leaves UNSCHEDULED tasks out — Inbox stays their only home', () => {
    const days = buildWeek({
      todayStr: TODAY,
      capacityMinutes: CAPACITY,
      tasks: [makeTask({ scheduled_for: null })],
    })
    expect(days.flatMap((d) => d.tasks)).toEqual([])
  })

  it('ignores days outside the window and cancelled work', () => {
    const days = buildWeek({
      todayStr: TODAY,
      capacityMinutes: CAPACITY,
      tasks: [
        makeTask({ id: 'far', scheduled_for: '2026-08-01' }),
        makeTask({ id: 'x', scheduled_for: '2026-06-23', status: 'cancelled' }),
      ],
    })
    expect(days.flatMap((d) => d.tasks)).toEqual([])
  })

  it('orders a day by position, then creation time', () => {
    const days = buildWeek({
      todayStr: TODAY,
      capacityMinutes: CAPACITY,
      tasks: [
        makeTask({ id: 'second', scheduled_for: TODAY, position: 1 }),
        makeTask({ id: 'first', scheduled_for: TODAY, position: 0 }),
      ],
    })
    expect(days[0].tasks.map((t) => t.id)).toEqual(['first', 'second'])
  })
})

describe('buildWeek — per-day capacity', () => {
  it('counts only OPEN effort, so a finished day reads as clear', () => {
    const days = buildWeek({
      todayStr: TODAY,
      capacityMinutes: CAPACITY,
      tasks: [
        makeTask({ scheduled_for: TODAY, effort_minutes: 60, status: 'done' }),
        makeTask({ scheduled_for: TODAY, effort_minutes: 30, status: 'todo' }),
      ],
    })
    expect(days[0].tasks).toHaveLength(2) // both still SHOWN
    expect(days[0].taskMinutes).toBe(30) // but only the open one is counted
  })

  it('subtracts that day’s calendar busy, like Today does', () => {
    const days = buildWeek({
      todayStr: TODAY,
      capacityMinutes: CAPACITY,
      tasks: [makeTask({ scheduled_for: '2026-06-23', effort_minutes: 60 })],
      busyByDate: new Map([['2026-06-23', 120]]),
    })
    const wed = days[1]
    expect(wed.busyMinutes).toBe(120)
    // 60 tasks + 120 meetings against 360 ⇒ 50%, and 240 left for tasks.
    expect(wed.capacity.summary.pct).toBe(50)
    expect(wed.capacity.effectiveCapacity).toBe(240)
  })

  it('accepts a plain object for busy and treats missing/invalid as 0', () => {
    const days = buildWeek({
      todayStr: TODAY,
      capacityMinutes: CAPACITY,
      tasks: [],
      busyByDate: { '2026-06-22': 90 },
    })
    expect(days[0].busyMinutes).toBe(90)
    expect(days[1].busyMinutes).toBe(0)
  })

  it('flags an over-capacity day', () => {
    const days = buildWeek({
      todayStr: TODAY,
      capacityMinutes: CAPACITY,
      tasks: [makeTask({ scheduled_for: TODAY, effort_minutes: 400 })],
    })
    expect(days[0].capacity.summary.status).toBe('over')
  })
})

describe('buildWeek — overdue surfaces on today only', () => {
  const tasks = [
    makeTask({ id: 'late', scheduled_for: '2026-06-18', effort_minutes: 120, status: 'todo' }),
    makeTask({ id: 'done-late', scheduled_for: '2026-06-18', status: 'done' }),
  ]

  it('lists open overdue work on today’s column', () => {
    const days = buildWeek({ todayStr: TODAY, tasks, capacityMinutes: CAPACITY })
    expect(days[0].overdue.map((t) => t.id)).toEqual(['late'])
  })

  it('never puts overdue work on any other day', () => {
    const days = buildWeek({ todayStr: TODAY, tasks, capacityMinutes: CAPACITY })
    expect(days.slice(1).every((d) => d.overdue.length === 0)).toBe(true)
  })

  it('does NOT count overdue effort in today’s capacity — /week must agree with /today', () => {
    const days = buildWeek({ todayStr: TODAY, tasks, capacityMinutes: CAPACITY })
    expect(days[0].taskMinutes).toBe(0)
    expect(days[0].capacity.summary.status).toBe('empty')
  })
})

describe('weekPlannedMinutes', () => {
  it('sums open effort across the week', () => {
    const days = buildWeek({
      todayStr: TODAY,
      capacityMinutes: CAPACITY,
      tasks: [
        makeTask({ scheduled_for: '2026-06-22', effort_minutes: 60 }),
        makeTask({ scheduled_for: '2026-06-25', effort_minutes: 45 }),
      ],
    })
    expect(weekPlannedMinutes(days)).toBe(105)
  })

  it('is 0 for an empty week', () => {
    expect(weekPlannedMinutes(buildWeek({ todayStr: TODAY, tasks: [], capacityMinutes: CAPACITY }))).toBe(0)
  })
})
