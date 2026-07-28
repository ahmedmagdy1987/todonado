import { describe, expect, it, beforeAll, afterAll } from 'vitest'
import { busyMinutesByDate, busyMinutesFromIcs } from './ics'

/**
 * Date-parameterised calendar busy — what the week view needs.
 *
 * `busyMinutesForDay` was ALREADY date-parameterised, so nothing about the
 * per-day arithmetic changed; `busyMinutesByDate` only parses once for many
 * days. These tests pin that equivalence (it must agree with the single-day
 * function for every date) and cover a week's worth of recurrence, DST edges and
 * all-day handling. The pre-existing ics.test.ts is untouched and still green.
 */

// Pinned so day fixtures mean the same thing on any machine or CI runner.
const originalTZ = process.env.TZ
beforeAll(() => {
  process.env.TZ = 'America/New_York'
})
afterAll(() => {
  process.env.TZ = originalTZ
})

const cal = (...events: string[]) =>
  ['BEGIN:VCALENDAR', 'VERSION:2.0', ...events, 'END:VCALENDAR'].join('\r\n')

const timed = (uid: string, start: string, end: string, extra: string[] = []) =>
  ['BEGIN:VEVENT', `UID:${uid}`, `DTSTART:${start}`, `DTEND:${end}`, ...extra, 'END:VEVENT'].join('\r\n')

const week = (from: string) => {
  const out: string[] = []
  const d = new Date(`${from}T00:00:00`)
  for (let i = 0; i < 7; i += 1) {
    const c = new Date(d)
    c.setDate(c.getDate() + i)
    out.push(
      `${c.getFullYear()}-${String(c.getMonth() + 1).padStart(2, '0')}-${String(c.getDate()).padStart(2, '0')}`,
    )
  }
  return out
}

describe('busyMinutesByDate agrees with the single-day function', () => {
  it('matches busyMinutesFromIcs for every date in the range', () => {
    const text = cal(
      timed('a', '20260622T090000', '20260622T100000'), // Mon 1h
      timed('b', '20260624T140000', '20260624T153000'), // Wed 1h30
      timed('c', '20260101T080000', '20260101T090000', ['RRULE:FREQ=DAILY']), // 1h every day
    )
    const dates = week('2026-06-22')
    const byDate = busyMinutesByDate(text, dates)
    for (const date of dates) {
      expect(byDate.get(date), date).toBe(busyMinutesFromIcs(text, date))
    }
  })

  it('returns an entry for every requested date, in the caller’s order', () => {
    const dates = week('2026-06-22')
    const byDate = busyMinutesByDate(cal(), dates)
    expect([...byDate.keys()]).toEqual(dates)
    expect([...byDate.values()].every((v) => v === 0)).toBe(true)
  })
})

describe('recurrence expanded across a whole week', () => {
  it('spreads a DAILY series over all seven days', () => {
    const text = cal(timed('d', '20260601T090000', '20260601T093000', ['RRULE:FREQ=DAILY']))
    const byDate = busyMinutesByDate(text, week('2026-06-22'))
    expect([...byDate.values()]).toEqual([30, 30, 30, 30, 30, 30, 30])
  })

  it('places a WEEKLY BYDAY series on the right days only', () => {
    // Mondays and Wednesdays, 1h. Week starts Monday 2026-06-22.
    const text = cal(
      timed('w', '20260601T100000', '20260601T110000', ['RRULE:FREQ=WEEKLY;BYDAY=MO,WE']),
    )
    const byDate = busyMinutesByDate(text, week('2026-06-22'))
    expect([...byDate.values()]).toEqual([60, 0, 60, 0, 0, 0, 0])
  })

  it('honours INTERVAL across weeks', () => {
    const text = cal(
      timed('i', '20260615T100000', '20260615T110000', ['RRULE:FREQ=WEEKLY;BYDAY=MO;INTERVAL=2']),
    )
    // Series anchored the previous Monday ⇒ 2026-06-22 is an OFF week.
    expect(busyMinutesByDate(text, ['2026-06-22']).get('2026-06-22')).toBe(0)
    expect(busyMinutesByDate(text, ['2026-06-29']).get('2026-06-29')).toBe(60)
  })

  it('drops an EXDATE occurrence mid-week', () => {
    const text = cal(
      timed('e', '20260601T090000', '20260601T100000', [
        'RRULE:FREQ=DAILY',
        'EXDATE:20260624T090000',
      ]),
    )
    const byDate = busyMinutesByDate(text, week('2026-06-22'))
    expect([...byDate.values()]).toEqual([60, 60, 0, 60, 60, 60, 60])
  })

  it('stops at UNTIL part-way through the week', () => {
    const text = cal(
      timed('u', '20260601T090000', '20260601T100000', ['RRULE:FREQ=DAILY;UNTIL=20260624T235900']),
    )
    const byDate = busyMinutesByDate(text, week('2026-06-22'))
    expect([...byDate.values()]).toEqual([60, 60, 60, 0, 0, 0, 0])
  })
})

describe('DST edges', () => {
  it('keeps a daily meeting at the same length across spring-forward', () => {
    // US DST begins 2026-03-08. A 09:00–10:00 local daily meeting stays 60m.
    const text = cal(timed('s', '20260301T090000', '20260301T100000', ['RRULE:FREQ=DAILY']))
    const byDate = busyMinutesByDate(text, week('2026-03-05'))
    expect([...byDate.values()]).toEqual([60, 60, 60, 60, 60, 60, 60])
  })

  it('keeps a daily meeting at the same length across fall-back', () => {
    // US DST ends 2026-11-01.
    const text = cal(timed('f', '20261001T090000', '20261001T100000', ['RRULE:FREQ=DAILY']))
    const byDate = busyMinutesByDate(text, week('2026-10-29'))
    expect([...byDate.values()]).toEqual([60, 60, 60, 60, 60, 60, 60])
  })
})

describe('all-day events stay non-consuming, every day of the week', () => {
  it('contributes zero across the range', () => {
    const text = cal(
      [
        'BEGIN:VEVENT',
        'UID:allday',
        'DTSTART;VALUE=DATE:20260622',
        'DTEND;VALUE=DATE:20260629',
        'END:VEVENT',
      ].join('\r\n'),
    )
    const byDate = busyMinutesByDate(text, week('2026-06-22'))
    expect([...byDate.values()]).toEqual([0, 0, 0, 0, 0, 0, 0])
  })
})

describe('robustness', () => {
  it('never throws on junk, returning zeros', () => {
    for (const junk of ['', 'not a calendar', 'BEGIN:VEVENT']) {
      const byDate = busyMinutesByDate(junk, week('2026-06-22'))
      expect([...byDate.values()]).toEqual([0, 0, 0, 0, 0, 0, 0])
    }
  })

  it('handles an empty date list', () => {
    expect(busyMinutesByDate(cal(), []).size).toBe(0)
  })
})
