import { describe, expect, it } from 'vitest'
import { buildEventRow, shouldTrackDayReturned } from './events'

describe('buildEventRow', () => {
  it('attributes to the current user and carries the optional flag/source', () => {
    expect(buildEventRow('task_created', 'user-1', { flag: true, source: 'today' })).toEqual({
      event: 'task_created',
      user_id: 'user-1',
      flag: true,
      source: 'today',
    })
  })

  it('defaults user_id/flag/source to null (no PII, anon-safe)', () => {
    expect(buildEventRow('day_returned', null)).toEqual({
      event: 'day_returned',
      user_id: null,
      flag: null,
      source: null,
    })
  })

  it('preserves flag:false (does not coerce to null)', () => {
    expect(buildEventRow('task_created', 'u', { flag: false }).flag).toBe(false)
  })
})

describe('shouldTrackDayReturned', () => {
  it('fires when the day changed or was never recorded', () => {
    expect(shouldTrackDayReturned(null, '2026-06-23')).toBe(true)
    expect(shouldTrackDayReturned('2026-06-22', '2026-06-23')).toBe(true)
  })
  it('does not fire twice on the same day', () => {
    expect(shouldTrackDayReturned('2026-06-23', '2026-06-23')).toBe(false)
  })
})
