import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { todayISO } from '@/lib/date'
import { selectOverdue, selectToday } from '@/features/tasks/selectors'
import { selectRolloverTasks } from './rollover'
import { makeTask } from '@/test/factories'

/**
 * Regression guard for the core invariant: "today / overdue / scheduled-for-today
 * / roll-over" must use the USER'S LOCAL calendar day, never UTC. A UTC-based
 * `today` (e.g. new Date().toISOString().slice(0,10)) would be off by one around
 * local midnight for east-of-UTC (UTC+7) and west-of-UTC (UTC-8) users.
 *
 * We pin the process timezone (Node honours a runtime `process.env.TZ` change for
 * subsequent Date operations). Etc/GMT signs are POSIX-inverted, and these zones
 * have no DST, so the offset is exact and stable:
 *   Etc/GMT-7  ==  UTC+7   (e.g. Bangkok)
 *   Etc/GMT+8  ==  UTC-8   (e.g. Pitcairn)
 */
const UTC_PLUS_7 = 'Etc/GMT-7'
const UTC_MINUS_8 = 'Etc/GMT+8'
const originalTZ = process.env.TZ

function setTZ(tz: string): void {
  process.env.TZ = tz
}

afterAll(() => {
  if (originalTZ === undefined) delete process.env.TZ
  else process.env.TZ = originalTZ
})

describe('todayISO resolves to the LOCAL calendar day near midnight', () => {
  it('UTC+7: an instant just after local midnight is the new local day, not the UTC day', () => {
    setTZ(UTC_PLUS_7)
    // 2026-06-04T17:30Z === 2026-06-05 00:30 local (UTC+7)
    expect(todayISO(new Date('2026-06-04T17:30:00Z'))).toBe('2026-06-05')
  })

  it('UTC-8: an instant just before local midnight is still the current local day, not the UTC day', () => {
    setTZ(UTC_MINUS_8)
    // 2026-06-05T05:30Z === 2026-06-04 21:30 local (UTC-8)
    expect(todayISO(new Date('2026-06-05T05:30:00Z'))).toBe('2026-06-04')
  })

  it('the same instant maps to different local days in UTC+7 vs UTC-8 (UTC math would break at least one)', () => {
    const instant = new Date('2026-06-04T18:30:00Z')
    setTZ(UTC_PLUS_7)
    const plus7 = todayISO(instant) // 2026-06-05 01:30 local
    setTZ(UTC_MINUS_8)
    const minus8 = todayISO(instant) // 2026-06-04 10:30 local
    expect(plus7).toBe('2026-06-05')
    expect(minus8).toBe('2026-06-04')
    expect(plus7).not.toBe(minus8)
  })
})

describe('today / overdue / roll-over classify against the LOCAL day — UTC+7', () => {
  beforeEach(() => setTZ(UTC_PLUS_7))

  it('uses local "today" across the UTC date boundary', () => {
    // Local now = 2026-06-05 00:30 (UTC+7) while the UTC clock still reads 2026-06-04.
    const today = todayISO(new Date('2026-06-04T17:30:00Z'))
    expect(today).toBe('2026-06-05')

    const tasks = [
      makeTask({ scheduled_for: '2026-06-05', title: 'today' }),
      makeTask({ scheduled_for: '2026-06-04', title: 'yesterday' }),
      makeTask({ scheduled_for: '2026-06-03', title: 'older' }),
    ]

    expect(selectToday(tasks, today).map((t) => t.title)).toEqual(['today'])
    expect(selectOverdue(tasks, today).map((t) => t.title).sort()).toEqual(['older', 'yesterday'])
    expect(selectRolloverTasks(tasks, today).map((t) => t.title).sort()).toEqual(['older', 'yesterday'])
  })
})

describe('today / overdue / roll-over classify against the LOCAL day — UTC-8', () => {
  beforeEach(() => setTZ(UTC_MINUS_8))

  it('uses local "today" across the UTC date boundary', () => {
    // Local now = 2026-06-04 21:30 (UTC-8) while the UTC clock already reads 2026-06-05.
    const today = todayISO(new Date('2026-06-05T05:30:00Z'))
    expect(today).toBe('2026-06-04')

    const tasks = [
      makeTask({ scheduled_for: '2026-06-04', title: 'today' }),
      makeTask({ scheduled_for: '2026-06-03', title: 'yesterday' }),
      makeTask({ scheduled_for: '2026-06-05', title: 'tomorrow' }),
    ]

    expect(selectToday(tasks, today).map((t) => t.title)).toEqual(['today'])
    expect(selectOverdue(tasks, today).map((t) => t.title)).toEqual(['yesterday'])
    expect(selectRolloverTasks(tasks, today).map((t) => t.title)).toEqual(['yesterday'])
  })
})
