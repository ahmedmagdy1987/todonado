import type { Task } from '@/types/database'
import { selectOverdue } from '@/features/tasks/selectors'

/**
 * Roll-over selection: open tasks whose `scheduled_for` is before today.
 * Pure & unit-tested. The UI offers a one-tap, undoable move to today.
 */
export function selectRolloverTasks(tasks: Task[], todayStr: string): Task[] {
  return selectOverdue(tasks, todayStr)
}
