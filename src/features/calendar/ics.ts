import { differenceInCalendarDays, startOfWeek } from 'date-fns'

/**
 * Minimal, dependency-free ICS (iCalendar) parsing for ONE purpose: how many
 * minutes of a given LOCAL day are consumed by timed calendar events. Pure, no
 * I/O — fully unit-tested. Never throws on malformed input (returns [] / 0).
 *
 * SUPPORTED: VEVENT with DTSTART + (DTEND | DURATION); UTC ("…Z"), floating, and
 * date-only (all-day) values; line folding; SUMMARY; recurrence FREQ=DAILY and
 * FREQ=WEEKLY with INTERVAL / BYDAY / UNTIL / COUNT(daily) and EXDATE.
 *
 * DELIBERATELY APPROXIMATED (documented limits — calendar import is additive and
 * degrades gracefully, so an approximation only nudges the meter, never breaks it):
 *  - ALL-DAY events are NON-consuming (they don't reduce timed capacity).
 *  - Floating / TZID times are read as the user's LOCAL wall-clock (correct when
 *    the calendar's zone matches the user's). UTC ("Z") times convert exactly.
 *  - MONTHLY / YEARLY recurrence is not expanded (rare for day-capacity meetings).
 *  - COUNT is enforced for DAILY only; WEEKLY relies on UNTIL.
 */

const WEEKDAY_CODES: Record<string, number> = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 }
const DAY_MS = 24 * 60 * 60 * 1000

export interface RRule {
  freq: 'DAILY' | 'WEEKLY' | 'OTHER'
  interval: number
  byday: number[]
  until: number | null
  count: number | null
}

export interface IcsEvent {
  summary: string | null
  allDay: boolean
  startMs: number
  endMs: number
  rrule: RRule | null
  /** Excluded local date keys (yyyy-MM-dd). */
  exdates: string[]
}

function pad(n: number): string {
  return String(n).padStart(2, '0')
}
function dayKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

// ---- line unfolding (RFC5545 continuation lines start with space/tab) ----
function unfold(text: string): string[] {
  const raw = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')
  const out: string[] = []
  for (const line of raw) {
    if ((line.startsWith(' ') || line.startsWith('\t')) && out.length > 0) {
      out[out.length - 1] += line.slice(1)
    } else {
      out.push(line)
    }
  }
  return out
}

interface Prop {
  name: string
  params: Record<string, string>
  value: string
}
function parseProp(line: string): Prop | null {
  const colon = line.indexOf(':')
  if (colon === -1) return null
  const left = line.slice(0, colon)
  const value = line.slice(colon + 1)
  const segs = left.split(';')
  const params: Record<string, string> = {}
  for (let i = 1; i < segs.length; i++) {
    const eq = segs[i].indexOf('=')
    if (eq !== -1) params[segs[i].slice(0, eq).toUpperCase()] = segs[i].slice(eq + 1)
  }
  return { name: segs[0].toUpperCase(), params, value }
}

interface ParsedDate {
  ms: number
  allDay: boolean
  dateKey: string
}

/** Parse an ICS DATE / DATE-TIME value into an epoch + all-day flag. */
export function parseIcsDate(value: string, params: Record<string, string> = {}): ParsedDate | null {
  const v = value.trim()
  const dateOnly = /^(\d{4})(\d{2})(\d{2})$/.exec(v)
  if (dateOnly && (params.VALUE === 'DATE' || !v.includes('T'))) {
    const [, y, mo, d] = dateOnly
    const ms = new Date(Number(y), Number(mo) - 1, Number(d)).getTime()
    return { ms, allDay: true, dateKey: `${y}-${mo}-${d}` }
  }
  const dt = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z)?$/.exec(v)
  if (dt) {
    const [, y, mo, d, h, mi, s, z] = dt
    const ms = z
      ? Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s))
      : new Date(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s)).getTime()
    return { ms, allDay: false, dateKey: dayKey(new Date(ms)) }
  }
  return null
}

/** Parse an ISO-8601 duration (e.g. PT1H30M, P1D) into milliseconds. */
export function parseIcsDuration(value: string): number | null {
  const m = /^(-)?P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(value.trim())
  if (!m || (m[2] == null && m[3] == null && m[4] == null && m[5] == null)) return null
  const sign = m[1] ? -1 : 1
  const days = Number(m[2] ?? 0)
  const h = Number(m[3] ?? 0)
  const mi = Number(m[4] ?? 0)
  const s = Number(m[5] ?? 0)
  return sign * (((days * 24 + h) * 60 + mi) * 60 + s) * 1000
}

function parseRRule(value: string): RRule {
  const parts: Record<string, string> = {}
  for (const seg of value.split(';')) {
    const eq = seg.indexOf('=')
    if (eq !== -1) parts[seg.slice(0, eq).toUpperCase()] = seg.slice(eq + 1)
  }
  const freqRaw = (parts.FREQ ?? '').toUpperCase()
  const freq = freqRaw === 'DAILY' ? 'DAILY' : freqRaw === 'WEEKLY' ? 'WEEKLY' : 'OTHER'
  const byday = (parts.BYDAY ?? '')
    .split(',')
    .map((c) => WEEKDAY_CODES[c.trim().slice(-2).toUpperCase()])
    .filter((n): n is number => n != null)
  const untilParsed = parts.UNTIL ? parseIcsDate(parts.UNTIL) : null
  return {
    freq,
    interval: Math.max(1, Number(parts.INTERVAL ?? 1) || 1),
    byday,
    until: untilParsed ? untilParsed.ms : null,
    count: parts.COUNT ? Number(parts.COUNT) || null : null,
  }
}

/** Parse all VEVENTs from ICS text. Never throws; ignores anything it can't read. */
export function parseIcsEvents(text: string): IcsEvent[] {
  // Case-insensitive precheck: RFC5545 property names are case-insensitive and
  // the parse loop below already upper-cases every line, so an all-lowercase
  // (but valid) calendar must not be dropped here. Linear, allocation-free scan.
  if (typeof text !== 'string' || !/begin:vevent/i.test(text)) return []
  const events: IcsEvent[] = []
  let cur:
    | { summary?: string; start?: ParsedDate; end?: ParsedDate; durationMs?: number; rrule?: RRule; exdates: string[] }
    | null = null

  for (const line of unfold(text)) {
    const up = line.toUpperCase()
    if (up === 'BEGIN:VEVENT') {
      cur = { exdates: [] }
      continue
    }
    if (up === 'END:VEVENT') {
      if (cur?.start) {
        const start = cur.start
        let endMs: number
        if (cur.end) endMs = cur.end.ms
        else if (cur.durationMs != null) endMs = start.ms + cur.durationMs
        else if (start.allDay) endMs = start.ms + DAY_MS
        else endMs = start.ms
        events.push({
          summary: cur.summary ?? null,
          allDay: start.allDay,
          startMs: start.ms,
          endMs,
          rrule: cur.rrule ?? null,
          exdates: cur.exdates,
        })
      }
      cur = null
      continue
    }
    if (!cur) continue
    const prop = parseProp(line)
    if (!prop) continue
    switch (prop.name) {
      case 'DTSTART': {
        const pd = parseIcsDate(prop.value, prop.params)
        if (pd) cur.start = pd
        break
      }
      case 'DTEND': {
        const pd = parseIcsDate(prop.value, prop.params)
        if (pd) cur.end = pd
        break
      }
      case 'DURATION': {
        const d = parseIcsDuration(prop.value)
        if (d != null) cur.durationMs = d
        break
      }
      case 'RRULE':
        cur.rrule = parseRRule(prop.value)
        break
      case 'SUMMARY':
        cur.summary = prop.value
        break
      case 'EXDATE':
        for (const part of prop.value.split(',')) {
          const pd = parseIcsDate(part, prop.params)
          if (pd) cur.exdates.push(pd.dateKey)
        }
        break
    }
  }
  return events
}

/** Does a recurring event occur on the given LOCAL day (a local-midnight Date)? */
function occursOnDay(ev: IcsEvent, day: Date): boolean {
  const r = ev.rrule
  if (!r || r.freq === 'OTHER') return false
  const start = new Date(ev.startMs)
  if (differenceInCalendarDays(day, start) < 0) return false // before the series began
  if (r.until != null && differenceInCalendarDays(day, new Date(r.until)) > 0) return false
  if (ev.exdates.includes(dayKey(day))) return false

  if (r.freq === 'DAILY') {
    const dd = differenceInCalendarDays(day, start)
    if (dd % r.interval !== 0) return false
    if (r.count != null && dd / r.interval >= r.count) return false
    return true
  }
  // WEEKLY
  const allowed = r.byday.length ? r.byday : [start.getDay()]
  if (!allowed.includes(day.getDay())) return false
  const weeks = Math.round(
    differenceInCalendarDays(
      startOfWeek(day, { weekStartsOn: 0 }),
      startOfWeek(start, { weekStartsOn: 0 }),
    ) / 7,
  )
  return weeks % r.interval === 0
}

function overlapMs(aStart: number, aEnd: number, bStart: number, bEnd: number): number {
  return Math.max(0, Math.min(aEnd, bEnd) - Math.max(aStart, bStart))
}

/**
 * Total busy MINUTES that timed events consume on `todayStr` (yyyy-MM-dd) in the
 * user's LOCAL day. All-day events are excluded; recurring DAILY/WEEKLY events
 * are expanded for today; capped at 24h. Pure + safe on any input.
 */
export function busyMinutesForDay(events: IcsEvent[], todayStr: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(todayStr)
  if (!m) return 0
  const [, y, mo, d] = m.map(Number)
  const dayStart = new Date(y, mo - 1, d, 0, 0, 0, 0)
  const dayStartMs = dayStart.getTime()
  const dayEndMs = new Date(y, mo - 1, d + 1, 0, 0, 0, 0).getTime()

  let totalMs = 0
  for (const ev of events) {
    if (ev.allDay) continue
    const duration = Math.max(0, ev.endMs - ev.startMs)
    if (!ev.rrule) {
      totalMs += overlapMs(ev.startMs, ev.endMs, dayStartMs, dayEndMs)
    } else if (occursOnDay(ev, dayStart)) {
      const s = new Date(ev.startMs)
      const occStart = new Date(y, mo - 1, d, s.getHours(), s.getMinutes(), s.getSeconds()).getTime()
      totalMs += overlapMs(occStart, occStart + duration, dayStartMs, dayEndMs)
    }
  }
  // Total-function guarantee ("safe on any input"): a non-finite endMs/startMs on
  // a hand-constructed IcsEvent could make totalMs NaN — clamp it back to 0 so the
  // meter never receives NaN. (Parser-emitted events are always finite; this guards
  // the exported API for any future caller.)
  const mins = Math.round(totalMs / 60000)
  return Number.isFinite(mins) ? Math.min(24 * 60, Math.max(0, mins)) : 0
}

/** Convenience: parse text and sum today's busy minutes. Never throws. */
export function busyMinutesFromIcs(text: string, todayStr: string): number {
  try {
    return busyMinutesForDay(parseIcsEvents(text), todayStr)
  } catch {
    return 0
  }
}
