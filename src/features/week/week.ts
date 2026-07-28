import { format, parseISO } from 'date-fns'
import { isoDateOffset } from '@/lib/date'
import { sumEffort } from '@/features/today/capacity'
import { withCalendar, type CalendarCapacity } from '@/features/calendar/capacity'
import type { Task } from '@/types/database'

/**
 * Pure week-view composition: which days, which tasks land on each, and each
 * day's own capacity. No React, no I/O — fully unit-tested.
 *
 * Reuses the EXISTING capacity math (`withCalendar` → `computeCapacity`) once
 * per day, so a day column in /week and the meter on /today can never disagree.
 */

/** How many days the week view spans, starting today. */
export const WEEK_LENGTH = 7

/** dnd-kit droppable id for a day column. */
export const dayDroppableId = (date: string) => `day:${date}`
/** DOM id for a day column, so the mobile strip can scroll to it. */
export const dayAnchorId = (date: string) => `week-day-${date}`

/** The date a droppable id refers to, or null when it isn't a day target. */
export function dateFromDroppableId(id: string): string | null {
  return id.startsWith('day:') ? id.slice('day:'.length) : null
}

const isActive = (t: Task) => t.status !== 'cancelled'
const isOpen = (t: Task) => t.status === 'todo' || t.status === 'in_progress'

/** The next `count` local dates starting at `todayStr`, inclusive. */
export function weekDates(todayStr: string, count: number = WEEK_LENGTH): string[] {
  const base = parseISO(todayStr)
  const days: string[] = []
  for (let i = 0; i < Math.max(0, count); i += 1) days.push(isoDateOffset(i, base))
  return days
}

/** Short weekday label ("Mon") for a `yyyy-MM-dd` date. */
export function weekdayLabel(dateStr: string): string {
  try {
    return format(parseISO(dateStr), 'EEE')
  } catch {
    return dateStr
  }
}

/** Day-of-month number for a `yyyy-MM-dd` date. */
export function dayOfMonth(dateStr: string): number {
  try {
    return parseISO(dateStr).getDate()
  } catch {
    return 0
  }
}

export interface WeekDayView {
  date: string
  isToday: boolean
  weekday: string
  dayOfMonth: number
  /** Non-cancelled tasks scheduled for this exact day, in position order. */
  tasks: Task[]
  /** Effort of the OPEN tasks scheduled here (what the meter counts). */
  taskMinutes: number
  busyMinutes: number
  /** The same capacity object Today uses, computed for this day. */
  capacity: CalendarCapacity
  /**
   * TODAY ONLY: open tasks still scheduled in the past. Surfaced on today's
   * column (consistent with Today's roll-over banner) but deliberately NOT
   * counted in today's capacity — they aren't scheduled for today yet, and
   * counting them would make the meter disagree with /today.
   */
  overdue: Task[]
}

/** Stable ordering: position, then creation time (the app's convention). */
function byPosition(a: Task, b: Task): number {
  if (a.position !== b.position) return a.position - b.position
  return a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0
}

export interface BuildWeekArgs {
  todayStr: string
  tasks: Task[]
  /** The user's raw daily capacity (same value Today uses). */
  capacityMinutes: number
  /** Calendar busy minutes per date; missing ⇒ 0. */
  busyByDate?: Map<string, number> | Record<string, number>
  count?: number
}

function busyFor(
  source: BuildWeekArgs['busyByDate'],
  date: string,
): number {
  if (!source) return 0
  const value = source instanceof Map ? source.get(date) : source[date]
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

/**
 * Build the 7 day columns.
 *
 * A task appears on the day its `scheduled_for` names — nothing is inferred and
 * nothing is moved. Unscheduled tasks are absent by design: Inbox remains their
 * home, so no task is ever invisible in exactly one place.
 */
export function buildWeek(args: BuildWeekArgs): WeekDayView[] {
  const { todayStr, tasks, capacityMinutes, busyByDate, count = WEEK_LENGTH } = args
  const dates = weekDates(todayStr, count)

  const scheduled = new Map<string, Task[]>()
  for (const task of tasks) {
    if (!isActive(task) || task.scheduled_for == null) continue
    const list = scheduled.get(task.scheduled_for)
    if (list) list.push(task)
    else scheduled.set(task.scheduled_for, [task])
  }

  const overdue = tasks
    .filter((t) => isOpen(t) && t.scheduled_for != null && t.scheduled_for < todayStr)
    .sort(byPosition)

  return dates.map((date) => {
    const dayTasks = (scheduled.get(date) ?? []).sort(byPosition)
    // Only OPEN work consumes capacity — a finished day reads as clear, exactly
    // as Today does.
    const taskMinutes = sumEffort(dayTasks.filter(isOpen))
    const busyMinutes = busyFor(busyByDate, date)
    return {
      date,
      isToday: date === todayStr,
      weekday: weekdayLabel(date),
      dayOfMonth: dayOfMonth(date),
      tasks: dayTasks,
      taskMinutes,
      busyMinutes,
      capacity: withCalendar(taskMinutes, capacityMinutes, busyMinutes),
      overdue: date === todayStr ? overdue : [],
    }
  })
}

/** Total open-task effort planned across the whole week. */
export function weekPlannedMinutes(days: WeekDayView[]): number {
  return days.reduce((sum, d) => sum + d.taskMinutes, 0)
}
