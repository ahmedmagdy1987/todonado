import {
  addDays,
  addMonths,
  addYears,
  differenceInCalendarDays,
  format,
  parseISO,
  startOfWeek,
} from 'date-fns'
import { todayISO } from '@/lib/date'
import type { NewTaskInput, RecurrenceFreq, Task } from '@/types/database'

/**
 * Pure recurrence date math + next-occurrence builder. No React, no I/O —
 * fully unit-tested. Dates are `yyyy-MM-dd` strings, compared lexicographically.
 */
export interface RecurrenceRule {
  freq: RecurrenceFreq
  interval: number
  weekdays?: number[] | null
  until?: string | null
}

/** Next weekly date: the next selected weekday on an "on-interval" week. */
function nextWeekly(from: Date, interval: number, weekdays?: number[] | null): Date {
  const valid = (weekdays ?? []).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6)
  if (valid.length === 0) return addDays(from, interval * 7)
  const allowed = new Set(valid)
  const fromWeekStart = startOfWeek(from, { weekStartsOn: 0 })
  const maxLookahead = interval * 7 + 8
  for (let i = 1; i <= maxLookahead; i++) {
    const cand = addDays(from, i)
    if (!allowed.has(cand.getDay())) continue
    const weeksApart = Math.round(
      differenceInCalendarDays(startOfWeek(cand, { weekStartsOn: 0 }), fromWeekStart) / 7,
    )
    if (weeksApart % interval === 0) return cand
  }
  return addDays(from, interval * 7)
}

/**
 * First date STRICTLY after `from` in the series anchored at `anchor`, stepping
 * `addFn` by `interval` from the anchor. Computing from the anchor (not the
 * previous, already-clamped date) is what keeps month-end intent: Jan 31 ->
 * Feb 28 -> Mar 31 (not Mar 28). addMonths/addYears are monotonic in k, so the
 * loop terminates; the guard is a belt-and-suspenders cap.
 */
function nthFromAnchor(
  addFn: (date: Date, amount: number) => Date,
  anchor: Date,
  from: Date,
  interval: number,
): Date {
  let k = 1
  let cand = addFn(anchor, k * interval)
  let guard = 0
  while (cand <= from && guard < 4000) {
    k += 1
    cand = addFn(anchor, k * interval)
    guard += 1
  }
  return cand
}

function nextDate(rule: RecurrenceRule, from: Date, anchor: Date): Date {
  const interval = Number.isFinite(rule.interval) ? Math.max(1, Math.floor(rule.interval)) : 1
  switch (rule.freq) {
    case 'daily':
      return addDays(from, interval)
    case 'weekly':
      return nextWeekly(from, interval, rule.weekdays)
    case 'monthly':
      // Anchored so the clamp (Jan 31 -> Feb 28/29) is per target month, never permanent.
      return nthFromAnchor(addMonths, anchor, from, interval)
    case 'yearly':
      // Anchored so Feb 29 clamps to Feb 28 only on non-leap years, then recovers.
      return nthFromAnchor(addYears, anchor, from, interval)
    default: {
      const exhaustive: never = rule.freq
      return exhaustive
    }
  }
}

/**
 * The next occurrence strictly after `fromDate`, or null if it would fall past
 * `until`. For monthly/yearly, `anchorDate` pins the intended day-of-month
 * (defaults to `fromDate`, preserving single-step behaviour); daily/weekly ignore it.
 */
export function computeNextOccurrence(
  rule: RecurrenceRule,
  fromDate: string,
  anchorDate: string = fromDate,
): string | null {
  const next = nextDate(rule, parseISO(fromDate), parseISO(anchorDate))
  const nextStr = format(next, 'yyyy-MM-dd')
  if (rule.until && nextStr > rule.until) return null
  return nextStr
}

type RecurrenceFields = Pick<
  Task,
  'recurrence_freq' | 'recurrence_interval' | 'recurrence_weekdays' | 'recurrence_until'
>

export function ruleFromTask(task: RecurrenceFields): RecurrenceRule | null {
  if (!task.recurrence_freq) return null
  return {
    freq: task.recurrence_freq,
    interval: task.recurrence_interval,
    weekdays: task.recurrence_weekdays,
    until: task.recurrence_until,
  }
}

/**
 * Next occurrence date for a recurring task. Anchored on the task's scheduled/
 * due date, but if completing it late would produce a date on or before today
 * (an already-overdue clone), the occurrence is advanced — preserving the rule's
 * phase (weekday / month-day) — to the first date strictly AFTER today. On-time
 * tasks advance exactly one interval as before. Honors `until`: returns null
 * once the rule runs out before reaching a future date.
 */
export function nextOccurrenceDate(task: Task, todayStr: string = todayISO()): string | null {
  const rule = ruleFromTask(task)
  if (!rule) return null
  const current = task.scheduled_for ?? task.due_date ?? todayStr
  // Anchor pins monthly/yearly day-of-month across the series; legacy rows
  // without a persisted anchor fall back to the current date (no drift fix, but
  // no regression either).
  const anchor = task.recurrence_anchor ?? current
  let next = computeNextOccurrence(rule, current, anchor)
  let guard = 0
  while (next !== null && next <= todayStr && guard < 1000) {
    const advanced = computeNextOccurrence(rule, next, anchor)
    if (advanced === null) return null // ran out (past `until`) before reaching the future
    if (advanced === next) break // defensive: no forward progress
    next = advanced
    guard += 1
  }
  return next
}

/**
 * Build the input for the next occurrence spawned when a recurring task is
 * completed: copies content + the SAME recurrence rule, with the date(s)
 * advanced. Returns null for non-recurring tasks or past the end date.
 */
export function buildNextOccurrence(task: Task, todayStr: string = todayISO()): NewTaskInput | null {
  if (!task.recurrence_freq) return null
  const next = nextOccurrenceDate(task, todayStr)
  if (!next) return null
  const hasAnyDate = task.due_date != null || task.scheduled_for != null
  // Carry the stable anchor forward unchanged so the whole series computes from
  // the original day-of-month (legacy rows derive it from their current date).
  const carriedAnchor = task.recurrence_anchor ?? task.scheduled_for ?? task.due_date ?? null
  return {
    workspace_id: task.workspace_id,
    title: task.title,
    notes: task.notes,
    project_id: task.project_id,
    section_id: task.section_id,
    effort_minutes: task.effort_minutes,
    priority: task.priority,
    // Advance whichever date(s) the task used; ensure a dateless recurrence still
    // anchors to a concrete next due date.
    due_date: task.due_date != null || !hasAnyDate ? next : null,
    scheduled_for: task.scheduled_for != null ? next : null,
    position: task.position,
    recurrence_freq: task.recurrence_freq,
    recurrence_interval: task.recurrence_interval,
    recurrence_weekdays: task.recurrence_weekdays,
    recurrence_until: task.recurrence_until,
    recurrence_anchor: carriedAnchor,
  }
}

const UNIT: Record<RecurrenceFreq, string> = {
  daily: 'day',
  weekly: 'week',
  monthly: 'month',
  yearly: 'year',
}

/** Human-readable cadence, e.g. "Repeats daily" / "Every 2 weeks". */
export function recurrenceLabel(task: RecurrenceFields): string {
  if (!task.recurrence_freq) return 'Does not repeat'
  const n = task.recurrence_interval
  if (n <= 1) return `Repeats ${task.recurrence_freq}`
  return `Every ${n} ${UNIT[task.recurrence_freq]}s`
}

/**
 * The `recurrence_anchor` a save should write.
 *
 * THE ANCHOR IS THE SERIES' MEMORY OF WHICH DAY OF THE MONTH IT WANTS. A task
 * due on the 31st clamps to the 28th in February; without a stable anchor the
 * next occurrence is computed from the 28th and the series silently walks
 * backwards, never to return. `nextOccurrence` carries it forward correctly —
 * the hole was the EDIT path, which never loaded the existing anchor and
 * rewrote it from whatever the current occurrence happened to show. Editing the
 * notes of a February occurrence re-anchored the whole series to the 28th.
 *
 * So: moving a date is an instruction and re-anchors; touching anything else
 * leaves the anchor exactly where it was.
 */
export function anchorForSave(input: {
  /** Is the task recurring after this save? */
  recurring: boolean
  /** The anchor already stored on the task, if any. */
  existingAnchor: string | null
  /** The dates as they were before this edit (null for a new task). */
  previous: { scheduled: string | null; due: string | null } | null
  /** The dates the form is about to write. */
  next: { scheduled: string | null; due: string | null }
}): string | null {
  if (!input.recurring) return null
  const fallback = input.next.scheduled ?? input.next.due ?? null
  if (!input.previous) return fallback
  const moved =
    input.next.scheduled !== input.previous.scheduled || input.next.due !== input.previous.due
  if (moved) return fallback
  return input.existingAnchor ?? fallback
}
