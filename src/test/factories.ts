import type { Task } from '@/types/database'

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
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    completed_at: null,
  }
  return { ...base, ...overrides }
}
