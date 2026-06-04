import { parseISO } from 'date-fns'
import type { Task } from '@/types/database'
import { selectOverdue } from '@/features/tasks/selectors'
import { isBeforeDay, isoDateOffset, todayISO } from '@/lib/date'

/**
 * Roll-over selection: open tasks whose `scheduled_for` is before today.
 * Pure & unit-tested. The UI offers a one-tap, undoable move to today.
 */
export function selectRolloverTasks(tasks: Task[], todayStr: string): Task[] {
  return selectOverdue(tasks, todayStr)
}

/** The oldest `scheduled_for` among `tasks` (ISO `yyyy-MM-dd`), or null if none. */
export function oldestScheduled(tasks: Task[]): string | null {
  return tasks.reduce<string | null>((min, t) => {
    const d = t.scheduled_for
    if (d == null) return min
    return min == null || isBeforeDay(d, min) ? d : min
  }, null)
}

/**
 * Whether the rolled-over leftovers are purely from yesterday or span earlier
 * days. Drives the banner headline so a 2-day-old task isn't mislabelled
 * "yesterday". `todayStr` flows through the same LOCAL date helpers as the rest
 * of the app, so the "yesterday" boundary is the user's local calendar day.
 */
export function rolloverSpan(
  tasks: Task[],
  todayStr: string = todayISO(),
): 'none' | 'yesterday' | 'earlier' {
  const oldest = oldestScheduled(tasks)
  if (oldest == null) return 'none'
  const yesterday = isoDateOffset(-1, parseISO(todayStr))
  return isBeforeDay(oldest, yesterday) ? 'earlier' : 'yesterday'
}
