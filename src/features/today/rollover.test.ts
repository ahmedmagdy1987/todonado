import { describe, it, expect } from 'vitest'
import { selectRolloverTasks, rolloverSpan, oldestScheduled } from './rollover'
import { makeTask } from '@/test/factories'

describe('selectRolloverTasks', () => {
  it('selects only open, overdue tasks', () => {
    const od = makeTask({ scheduled_for: '2026-06-01', title: 'od' })
    const odDone = makeTask({ scheduled_for: '2026-05-30', status: 'done' })
    const today = makeTask({ scheduled_for: '2026-06-02' })
    const unscheduled = makeTask({ scheduled_for: null })
    const result = selectRolloverTasks([od, odDone, today, unscheduled], '2026-06-02')
    expect(result.map((t) => t.title)).toEqual(['od'])
  })
})

describe('oldestScheduled', () => {
  it('returns the minimum scheduled_for, ignoring nulls', () => {
    const tasks = [
      makeTask({ scheduled_for: '2026-06-03' }),
      makeTask({ scheduled_for: null }),
      makeTask({ scheduled_for: '2026-06-01' }),
    ]
    expect(oldestScheduled(tasks)).toBe('2026-06-01')
  })

  it('returns null when nothing is scheduled', () => {
    expect(oldestScheduled([makeTask({ scheduled_for: null })])).toBeNull()
  })
})

describe('rolloverSpan (banner copy: "yesterday" vs "earlier")', () => {
  it('is "yesterday" when the only leftover is truly from yesterday', () => {
    expect(rolloverSpan([makeTask({ scheduled_for: '2026-06-03' })], '2026-06-04')).toBe('yesterday')
  })

  it('is "earlier" when a leftover is 2+ days old (Jun-2 shown on Jun-4 — the reported bug)', () => {
    const tasks = [
      makeTask({ scheduled_for: '2026-06-02' }),
      makeTask({ scheduled_for: '2026-06-03' }),
    ]
    expect(rolloverSpan(tasks, '2026-06-04')).toBe('earlier')
  })

  it('finds the true oldest regardless of array order (list is sorted by position, not date)', () => {
    const tasks = [
      makeTask({ scheduled_for: '2026-06-03', position: 0 }),
      makeTask({ scheduled_for: '2026-06-01', position: 1 }),
    ]
    expect(rolloverSpan(tasks, '2026-06-04')).toBe('earlier')
  })

  it('is "none" for an empty set', () => {
    expect(rolloverSpan([], '2026-06-04')).toBe('none')
  })
})
