import { describe, expect, it } from 'vitest'
import { computeCapacity } from '@/features/today/capacity'
import { withCalendar } from './capacity'

describe('withCalendar — calendar-aware capacity (extends, does not replace)', () => {
  it('with zero busy minutes, it is identical to the core computeCapacity', () => {
    const cal = withCalendar(120, 360, 0)
    expect(cal.summary).toEqual(computeCapacity(120, 360))
    expect(cal.effectiveCapacity).toBe(360)
    expect(cal.busyMinutes).toBe(0)
  })

  it('meetings consume capacity the same way task effort does', () => {
    const cal = withCalendar(120, 360, 120) // 2h tasks + 2h meetings of a 6h day
    expect(cal.summary.plannedMinutes).toBe(240) // tasks + busy
    expect(cal.summary.capacityMinutes).toBe(360) // raw capacity (editor still edits this)
    expect(cal.summary.freeMinutes).toBe(120)
    expect(cal.summary.status).toBe('ok')
    expect(cal.effectiveCapacity).toBe(240) // room left for tasks after meetings
  })

  it('pushes the day over when tasks + meetings exceed capacity', () => {
    const cal = withCalendar(300, 360, 120) // 5h tasks + 2h meetings
    expect(cal.summary.status).toBe('over')
    expect(cal.summary.overMinutes).toBe(60)
    expect(cal.effectiveCapacity).toBe(240)
  })

  it('clamps negative / non-finite busy and task inputs to 0', () => {
    expect(withCalendar(120, 360, -50).busyMinutes).toBe(0)
    expect(withCalendar(120, 360, Number.NaN).busyMinutes).toBe(0)
    expect(withCalendar(Number.NaN, 360, 30).taskMinutes).toBe(0)
  })
})
