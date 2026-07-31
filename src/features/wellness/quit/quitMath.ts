import { format } from 'date-fns'
import type { QuitCheckin } from '@/types/database'

/**
 * Pure math for the quit tracker. No React, no I/O, no medical logic — just
 * date bookkeeping over the user's own day zero and their own check-ins.
 *
 * THE CENTRAL RULE: the clean streak is DERIVED from `quit_started_at`, never
 * stored and never incremented. Same discipline as the Focus timer deriving
 * elapsed from `started_at`. A stored counter would need a daily job to stay
 * true, would drift if the app were closed, and would have to be "repaired" on
 * every reopen. Deriving it means a user who ignores the app for a month comes
 * back to a streak that GREW.
 *
 * CALENDAR DAYS, NOT 24-HOUR BLOCKS. Quitting at 11pm and looking at 1am the
 * next night should read "day 1", not "day 0" — so whole days are counted by
 * LOCAL calendar-day arithmetic, exactly as historyWindow.ts does it, never by
 * dividing elapsed milliseconds by 86,400,000. That also makes the count
 * immune to DST: a 23- or 25-hour day is still one day.
 */

/** Milestones we celebrate, in days. Ascending, and the only place they live. */
export const QUIT_MILESTONES = [1, 3, 7, 14, 30, 90, 180, 365] as const

export type QuitMilestone = (typeof QUIT_MILESTONES)[number]

/** Local calendar day (yyyy-MM-dd) for a timestamp. */
export function dayOf(iso: string | Date): string {
  return format(typeof iso === 'string' ? new Date(iso) : iso, 'yyyy-MM-dd')
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

/**
 * Whole LOCAL calendar days between two yyyy-MM-dd strings (b - a).
 * Both are normalised to local midnight first, so a DST transition inside the
 * range cannot add or drop a day.
 */
export function daysBetween(a: string, b: string): number {
  const from = parseDay(a)
  const to = parseDay(b)
  // Compare at UTC noon of each local date: immune to the ±1h DST shift that
  // would otherwise round a 23-hour day down to 0.
  const ms =
    Date.UTC(to.getFullYear(), to.getMonth(), to.getDate()) -
    Date.UTC(from.getFullYear(), from.getMonth(), from.getDate())
  return Math.round(ms / 86_400_000)
}

/**
 * Whole clean days completed since day zero, by local calendar day.
 * The day you quit is day 0; the next local day is day 1. Never negative — a
 * `quit_started_at` in the future (clock skew, or a user backdating forward)
 * reads as 0 rather than a nonsensical negative streak.
 */
export function cleanDays(quitStartedAt: string, now: Date = new Date()): number {
  return Math.max(0, daysBetween(dayOf(quitStartedAt), dayOf(now)))
}

export interface CleanElapsed {
  days: number
  hours: number
  minutes: number
  seconds: number
}

/**
 * The LIVE counter: exact elapsed time since day zero, split for display.
 * `days` here is elapsed 24h blocks, which is what a running clock should show
 * — it is deliberately NOT the same number as `cleanDays()`, which counts
 * calendar days for milestones. They can differ by one within a day, and that
 * is correct: the clock says "18h 20m", the milestone says "day 1".
 * Clamped at zero so a future timestamp never renders negative time.
 */
export function cleanElapsed(quitStartedAt: string, now: Date = new Date()): CleanElapsed {
  const ms = Math.max(0, now.getTime() - new Date(quitStartedAt).getTime())
  const totalSeconds = Math.floor(ms / 1000)
  return {
    days: Math.floor(totalSeconds / 86_400),
    hours: Math.floor((totalSeconds % 86_400) / 3600),
    minutes: Math.floor((totalSeconds % 3600) / 60),
    seconds: totalSeconds % 60,
  }
}

/** The highest milestone already reached, or null before the first one. */
export function lastMilestone(days: number): QuitMilestone | null {
  let hit: QuitMilestone | null = null
  for (const m of QUIT_MILESTONES) {
    if (days >= m) hit = m
  }
  return hit
}

/** The next milestone ahead, or null once every milestone is behind you. */
export function nextMilestone(days: number): QuitMilestone | null {
  for (const m of QUIT_MILESTONES) {
    if (days < m) return m
  }
  return null
}

/** Days remaining until the next milestone; null when there is none left. */
export function daysToNextMilestone(days: number): number | null {
  const next = nextMilestone(days)
  return next === null ? null : next - days
}

/**
 * True exactly ON a milestone day — the trigger for the in-app celebration.
 * Boundary-exact by construction: day 6 and day 8 are not milestones, day 7 is.
 */
export function isMilestoneDay(days: number): boolean {
  return (QUIT_MILESTONES as readonly number[]).includes(days)
}

/** Progress 0..1 from the previous milestone to the next (1 once all are past). */
export function milestoneProgress(days: number): number {
  const next = nextMilestone(days)
  if (next === null) return 1
  const prev = lastMilestone(days) ?? 0
  const span = next - prev
  if (span <= 0) return 1
  return Math.min(1, Math.max(0, (days - prev) / span))
}

/**
 * What a slip writes. Day zero moves to `now`; the best run is RAISED to the
 * run just completed if it beat the record, and otherwise left alone. It never
 * decreases — the point of keeping it is that a slip cannot erase what you
 * already proved you could do.
 */
export function slipPatch(
  quitStartedAt: string,
  longestStreakDays: number,
  now: Date = new Date(),
): { quit_started_at: string; longest_streak_days: number } {
  const completed = cleanDays(quitStartedAt, now)
  return {
    quit_started_at: now.toISOString(),
    longest_streak_days: Math.max(longestStreakDays, completed),
  }
}

/**
 * The best run to DISPLAY: the stored record or the run in progress, whichever
 * is longer. Without this the current streak would visibly overtake the "best
 * ever" number and sit above it until the next slip, which reads as a bug.
 */
export function bestStreak(
  quitStartedAt: string,
  longestStreakDays: number,
  now: Date = new Date(),
): number {
  return Math.max(longestStreakDays, cleanDays(quitStartedAt, now))
}

/** Set of local days a habit was checked in on. */
export function checkedDaysForHabit(checkins: QuitCheckin[], habitId: string): Set<string> {
  const days = new Set<string>()
  for (const c of checkins) {
    if (c.habit_id === habitId) days.add(c.checked_on)
  }
  return days
}

/**
 * Consecutive check-in days ending today (or yesterday if today isn't checked
 * yet — the day isn't over). Identical tolerance to the wellness tracker's
 * computeStreak, deliberately: two streak mechanics in one app should behave
 * the same way.
 *
 * This is a SEPARATE, secondary number. It never gates the clean streak.
 */
export function checkinStreak(checkedDays: Set<string>, today: string): number {
  let cursor: string
  if (checkedDays.has(today)) cursor = today
  else if (checkedDays.has(shiftDay(today, -1))) cursor = shiftDay(today, -1)
  else return 0

  let streak = 0
  while (checkedDays.has(cursor)) {
    streak++
    cursor = shiftDay(cursor, -1)
  }
  return streak
}

/**
 * Human phrasing for the headline number. Deliberately plain: no "amazing!",
 * no exclamation marks, no emoji. Someone on day 0 after a slip should be able
 * to read this without flinching.
 */
export function cleanDaysLabel(days: number): string {
  if (days === 0) return 'Day zero: today counts'
  if (days === 1) return '1 day clean'
  return `${days} days clean`
}
