import { format, parseISO } from 'date-fns'
import type { FocusSession } from '@/types/database'

/** The single running session, if any (used to re-enter focus on reload). */
export function activeSession(sessions: FocusSession[]): FocusSession | null {
  return sessions.find((s) => s.status === 'running') ?? null
}

/** Total completed focus seconds for a task. */
export function focusSecondsForTask(sessions: FocusSession[], taskId: string): number {
  return sessions
    .filter((s) => s.task_id === taskId && s.status === 'completed')
    .reduce((sum, s) => sum + s.actual_seconds, 0)
}

/** Map of task id -> total completed focus seconds (general sessions excluded). */
export function focusSecondsByTask(sessions: FocusSession[]): Map<string, number> {
  const map = new Map<string, number>()
  for (const s of sessions) {
    if (s.status !== 'completed' || s.task_id === null) continue
    map.set(s.task_id, (map.get(s.task_id) ?? 0) + s.actual_seconds)
  }
  return map
}

/** Sessions started on a given local day (`yyyy-MM-dd`). */
export function sessionsOn(sessions: FocusSession[], dayISO: string): FocusSession[] {
  return sessions.filter((s) => {
    try {
      return format(parseISO(s.started_at), 'yyyy-MM-dd') === dayISO
    } catch {
      return false
    }
  })
}
