import { format } from 'date-fns'
import type { WellnessLog } from '@/types/database'

/**
 * Pure helpers for the wellness tracker: turning "taken" logs into per-item
 * taken-dates, today checks, and a consecutive-day streak. No medical logic —
 * just date bookkeeping over the user's own log events. Fully unit-tested.
 */

/** Local calendar day (yyyy-MM-dd) for a timestamp. */
export function logDay(taken_at: string): string {
  return format(new Date(taken_at), 'yyyy-MM-dd')
}

/** Parse a yyyy-MM-dd as a LOCAL date (avoids UTC-midnight drift). */
function parseDay(day: string): Date {
  const [y, m, d] = day.split('-').map(Number)
  return new Date(y, m - 1, d)
}

/** yyyy-MM-dd `n` days from `day` (n may be negative). */
export function shiftDay(day: string, n: number): string {
  const dt = parseDay(day)
  dt.setDate(dt.getDate() + n)
  return format(dt, 'yyyy-MM-dd')
}

/** Set of local days an item was marked taken. */
export function takenDaysForItem(logs: WellnessLog[], itemId: string): Set<string> {
  const days = new Set<string>()
  for (const log of logs) {
    if (log.item_id === itemId) days.add(logDay(log.taken_at))
  }
  return days
}

export function isTakenOn(takenDays: Set<string>, day: string): boolean {
  return takenDays.has(day)
}

/**
 * Consecutive-day streak ending at `today` (or yesterday if today isn't logged
 * yet — the day isn't over). Returns 0 if neither today nor yesterday is logged.
 */
export function computeStreak(takenDays: Set<string>, today: string): number {
  let cursor: string
  if (takenDays.has(today)) cursor = today
  else if (takenDays.has(shiftDay(today, -1))) cursor = shiftDay(today, -1)
  else return 0

  let streak = 0
  while (takenDays.has(cursor)) {
    streak++
    cursor = shiftDay(cursor, -1)
  }
  return streak
}
