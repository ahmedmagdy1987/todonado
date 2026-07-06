import { describe, expect, it } from 'vitest'
import {
  busyMinutesForDay,
  busyMinutesFromIcs,
  parseIcsDate,
  parseIcsDuration,
  parseIcsEvents,
} from './ics'

const TODAY = '2026-06-23'
const WEEKDAY_CODES = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA']

function ics(...body: string[]): string {
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', ...body, 'END:VCALENDAR'].join('\r\n')
}
function vevent(...props: string[]): string[] {
  return ['BEGIN:VEVENT', ...props, 'END:VEVENT']
}
/** Busy minutes for TODAY from a single VEVENT described by its props. */
function busy(...props: string[]): number {
  return busyMinutesFromIcs(ics(...vevent(...props)), TODAY)
}

describe('parseIcsDate', () => {
  it('parses UTC, floating, and all-day values', () => {
    expect(parseIcsDate('20260623T140000Z')).toEqual({
      ms: Date.UTC(2026, 5, 23, 14, 0, 0),
      allDay: false,
      dateKey: expect.any(String),
    })
    expect(parseIcsDate('20260623T090000')).toMatchObject({
      ms: new Date(2026, 5, 23, 9, 0, 0).getTime(),
      allDay: false,
    })
    expect(parseIcsDate('20260623')).toMatchObject({ allDay: true, dateKey: '2026-06-23' })
    expect(parseIcsDate('nonsense')).toBeNull()
  })
})

describe('parseIcsDuration', () => {
  it('parses ISO-8601 durations, rejects junk', () => {
    expect(parseIcsDuration('PT1H30M')).toBe(90 * 60000)
    expect(parseIcsDuration('PT45M')).toBe(45 * 60000)
    expect(parseIcsDuration('P1D')).toBe(24 * 60 * 60000)
    expect(parseIcsDuration('PT')).toBeNull()
    expect(parseIcsDuration('nope')).toBeNull()
  })
})

describe('parseIcsEvents', () => {
  it('reads VEVENTs with summary, unfolds folded lines, ignores junk', () => {
    const text = ics(
      // a folded SUMMARY: the continuation line starts with a space (RFC5545)
      ...vevent('DTSTART:20260623T090000', 'DTEND:20260623T100000', 'SUMMARY:Stand', ' up'),
    )
    const events = parseIcsEvents(text)
    expect(events).toHaveLength(1)
    expect(events[0].summary).toBe('Standup') // folded continuation joined
    expect(parseIcsEvents('garbage')).toEqual([])
  })
})

describe('busyMinutesForDay', () => {
  it('counts a single timed meeting today', () => {
    expect(busy('DTSTART:20260623T090000', 'DTEND:20260623T103000')).toBe(90)
  })

  it('ignores a meeting on a different day', () => {
    expect(busy('DTSTART:20260624T090000', 'DTEND:20260624T100000')).toBe(0)
  })

  it('treats all-day events as NON-consuming', () => {
    expect(busy('DTSTART;VALUE=DATE:20260623', 'DTEND;VALUE=DATE:20260624', 'SUMMARY:Vacation')).toBe(0)
  })

  it('supports DURATION when DTEND is absent', () => {
    expect(busy('DTSTART:20260623T140000', 'DURATION:PT45M')).toBe(45)
  })

  it('clamps an event that spans into today from yesterday', () => {
    expect(busy('DTSTART:20260622T230000', 'DTEND:20260623T010000')).toBe(60) // only the part in today
  })

  it('sums multiple meetings', () => {
    const text = ics(
      ...vevent('DTSTART:20260623T090000', 'DTEND:20260623T093000'),
      ...vevent('DTSTART:20260623T140000', 'DTEND:20260623T150000'),
    )
    expect(busyMinutesForDay(parseIcsEvents(text), TODAY)).toBe(90)
  })

  it('expands a DAILY recurrence onto today', () => {
    expect(busy('DTSTART:20260620T090000', 'DTEND:20260620T093000', 'RRULE:FREQ=DAILY')).toBe(30)
  })

  it('respects DAILY INTERVAL and COUNT', () => {
    // every 2 days from 06-20 → 06-20, 06-22, 06-24… → not 06-23
    expect(busy('DTSTART:20260620T090000', 'DTEND:20260620T093000', 'RRULE:FREQ=DAILY;INTERVAL=2')).toBe(0)
    // every 2 days from 06-21 → 06-21, 06-23 → today
    expect(busy('DTSTART:20260621T090000', 'DTEND:20260621T093000', 'RRULE:FREQ=DAILY;INTERVAL=2')).toBe(30)
    // COUNT=2 from 06-20 → only 06-20, 06-21 → not today
    expect(busy('DTSTART:20260620T090000', 'DTEND:20260620T093000', 'RRULE:FREQ=DAILY;COUNT=2')).toBe(0)
  })

  it('expands a WEEKLY recurrence (interval + BYDAY)', () => {
    // weekly from exactly one week ago → occurs today
    expect(busy('DTSTART:20260616T090000', 'DTEND:20260616T100000', 'RRULE:FREQ=WEEKLY')).toBe(60)
    // every 2 weeks from one week ago → this is an "off" week → 0
    expect(busy('DTSTART:20260616T090000', 'DTEND:20260616T100000', 'RRULE:FREQ=WEEKLY;INTERVAL=2')).toBe(0)
    // BYDAY matching today's weekday counts; a different weekday does not
    const dow = new Date(2026, 5, 23).getDay()
    const today = WEEKDAY_CODES[dow]
    const other = WEEKDAY_CODES[(dow + 1) % 7]
    expect(busy('DTSTART:20260616T090000', 'DTEND:20260616T100000', `RRULE:FREQ=WEEKLY;BYDAY=${today}`)).toBe(60)
    expect(busy('DTSTART:20260616T090000', 'DTEND:20260616T100000', `RRULE:FREQ=WEEKLY;BYDAY=${other}`)).toBe(0)
  })

  it('honors UNTIL and EXDATE', () => {
    expect(
      busy('DTSTART:20260620T090000', 'DTEND:20260620T093000', 'RRULE:FREQ=DAILY;UNTIL=20260622T000000Z'),
    ).toBe(0) // series ended before today
    expect(
      busy('DTSTART:20260620T090000', 'DTEND:20260620T093000', 'RRULE:FREQ=DAILY', 'EXDATE:20260623T090000'),
    ).toBe(0) // today explicitly excluded
  })

  it('never throws on malformed input', () => {
    expect(busyMinutesFromIcs('', TODAY)).toBe(0)
    expect(busyMinutesFromIcs('totally not ical', TODAY)).toBe(0)
    expect(busyMinutesForDay(parseIcsEvents('garbage'), 'not-a-date')).toBe(0)
  })

  it('parses an all-lowercase (RFC-legal) calendar (case-insensitive)', () => {
    const text = 'begin:vevent\r\ndtstart:20260623T090000\r\ndtend:20260623T100000\r\nend:vevent'
    expect(busyMinutesFromIcs(text, TODAY)).toBe(60)
  })

  it('returns 0 (never NaN) for an event with non-finite start/end', () => {
    const bad = [{ summary: null, allDay: false, startMs: NaN, endMs: NaN, rrule: null, exdates: [] }]
    expect(busyMinutesForDay(bad, TODAY)).toBe(0)
  })
})
