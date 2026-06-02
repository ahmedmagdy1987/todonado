import { format } from 'date-fns'

/**
 * Date helpers for Todonado.
 *
 * `scheduled_for` / `due_date` are Postgres `date` columns and arrive as
 * `yyyy-MM-dd` strings. We compare them as strings — ISO date strings sort
 * lexicographically, so `<` / `===` are correct and timezone-free.
 */

/** Today's local date as `yyyy-MM-dd`. */
export function todayISO(now: Date = new Date()): string {
  return format(now, 'yyyy-MM-dd')
}

/** A date `offsetDays` from `now`, as `yyyy-MM-dd` (e.g. tomorrow = +1). */
export function isoDateOffset(offsetDays: number, now: Date = new Date()): string {
  const d = new Date(now)
  d.setDate(d.getDate() + offsetDays)
  return format(d, 'yyyy-MM-dd')
}

/** True if ISO date `a` is strictly before ISO date `b`. */
export function isBeforeDay(a: string, b: string): boolean {
  return a < b
}

/** True if ISO date `a` is the same day as `b`. */
export function isSameDay(a: string, b: string): boolean {
  return a === b
}
