import type { FocusSession, Task } from '@/types/database'

let counter = 0

/** Build a Task with sensible defaults; override any field for a test case. */
export function makeTask(overrides: Partial<Task> = {}): Task {
  counter += 1
  const base: Task = {
    id: `task-${counter}`,
    workspace_id: 'ws-1',
    project_id: null,
    section_id: null,
    title: `Task ${counter}`,
    notes: null,
    status: 'todo',
    priority: 0,
    due_date: null,
    effort_minutes: null,
    scheduled_for: null,
    position: 0,
    recurrence_freq: null,
    recurrence_interval: 1,
    recurrence_weekdays: null,
    recurrence_until: null,
    recurrence_anchor: null,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    completed_at: null,
  }
  return { ...base, ...overrides }
}

let focusCounter = 0

/** Build a FocusSession with sensible defaults; override any field. */
export function makeFocusSession(overrides: Partial<FocusSession> = {}): FocusSession {
  focusCounter += 1
  const base: FocusSession = {
    id: `focus-${focusCounter}`,
    workspace_id: 'ws-1',
    task_id: null,
    planned_minutes: 50,
    started_at: '2026-06-02T09:00:00.000Z',
    ended_at: null,
    actual_seconds: 0,
    interruptions: 0,
    status: 'completed',
    paused_at: null,
    accumulated_paused_seconds: 0,
    created_at: '2026-06-02T09:00:00.000Z',
    updated_at: '2026-06-02T09:00:00.000Z',
  }
  return { ...base, ...overrides }
}
