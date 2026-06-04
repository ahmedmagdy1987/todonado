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

function nextDate(rule: RecurrenceRule, from: Date): Date {
  const interval = Number.isFinite(rule.interval) ? Math.max(1, Math.floor(rule.interval)) : 1
  switch (rule.freq) {
    case 'daily':
      return addDays(from, interval)
    case 'weekly':
      return nextWeekly(from, interval, rule.weekdays)
    case 'monthly':
      // date-fns addMonths clamps month-end (Jan 31 -> Feb 28/29).
      return addMonths(from, interval)
    case 'yearly':
      // addYears clamps Feb 29 -> Feb 28 on non-leap years.
      return addYears(from, interval)
    default: {
      const exhaustive: never = rule.freq
      return exhaustive
    }
  }
}

/** The next occurrence after `fromDate`, or null if it would fall past `until`. */
export function computeNextOccurrence(rule: RecurrenceRule, fromDate: string): string | null {
  const next = nextDate(rule, parseISO(fromDate))
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
  const anchor = task.scheduled_for ?? task.due_date ?? todayStr
  let next = computeNextOccurrence(rule, anchor)
  let guard = 0
  while (next !== null && next <= todayStr && guard < 1000) {
    const advanced = computeNextOccurrence(rule, next)
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
