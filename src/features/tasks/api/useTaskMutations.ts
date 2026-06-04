import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { qk } from '@/lib/queryKeys'
import type { NewTaskInput, Task, TaskPatch } from '@/types/database'
import { completeTask } from './completeTask'

function optimisticTask(input: NewTaskInput): Task {
  const now = new Date().toISOString()
  return {
    id: `optimistic-${crypto.randomUUID()}`,
    workspace_id: input.workspace_id,
    project_id: input.project_id ?? null,
    section_id: input.section_id ?? null,
    title: input.title,
    notes: input.notes ?? null,
    status: input.status ?? 'todo',
    priority: input.priority ?? 0,
    due_date: input.due_date ?? null,
    effort_minutes: input.effort_minutes ?? null,
    scheduled_for: input.scheduled_for ?? null,
    position: input.position ?? 0,
    recurrence_freq: input.recurrence_freq ?? null,
    recurrence_interval: input.recurrence_interval ?? 1,
    recurrence_weekdays: input.recurrence_weekdays ?? null,
    recurrence_until: input.recurrence_until ?? null,
    created_at: now,
    updated_at: now,
    completed_at: null,
  }
}

/**
 * All task mutations for a workspace, each with optimistic updates against the
 * single `qk.tasks(workspaceId)` cache and rollback on error.
 *
 * `updateTask` is the general-purpose patch (covers reschedule, set-effort,
 * move-to-project, edit). `toggleComplete` and `reorderTasks` are specialized.
 */
export function useTaskMutations(workspaceId: string) {
  const qc = useQueryClient()
  const key = qk.tasks(workspaceId)

  const setTasks = (updater: (prev: Task[]) => Task[]) => {
    qc.setQueryData<Task[]>(key, (prev) => updater(prev ?? []))
  }
  const rollback = (ctx: { prev?: Task[] } | undefined) => {
    if (ctx?.prev) qc.setQueryData(key, ctx.prev)
  }
  const settle = () => {
    void qc.invalidateQueries({ queryKey: key })
  }

  const createTask = useMutation({
    mutationFn: async (input: NewTaskInput) => {
      const { data, error } = await supabase.from('tasks').insert(input).select('*').single()
      if (error) throw error
      return data as Task
    },
    onMutate: async (input) => {
      await qc.cancelQueries({ queryKey: key })
      const prev = qc.getQueryData<Task[]>(key) ?? []
      setTasks((p) => [...p, optimisticTask(input)])
      return { prev }
    },
    onError: (_e, _v, ctx) => rollback(ctx),
    onSettled: settle,
  })

  const updateTask = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: TaskPatch }) => {
      const { data, error } = await supabase
        .from('tasks')
        .update(patch)
        .eq('id', id)
        .select('*')
        .single()
      if (error) throw error
      return data as Task
    },
    onMutate: async ({ id, patch }) => {
      await qc.cancelQueries({ queryKey: key })
      const prev = qc.getQueryData<Task[]>(key) ?? []
      setTasks((p) => p.map((t) => (t.id === id ? { ...t, ...patch } : t)))
      return { prev }
    },
    onError: (_e, _v, ctx) => rollback(ctx),
    onSettled: settle,
  })

  const toggleComplete = useMutation({
    // Atomic compare-and-swap on status (see completeTask): only the call that
    // genuinely transitions a task to done spawns its next recurrence, so
    // concurrent / double completes create the next occurrence exactly once.
    mutationFn: ({ id, done }: { id: string; done: boolean }) =>
      completeTask(supabase, { id, done }).then((r) => r.task),
    onMutate: async ({ id, done }) => {
      await qc.cancelQueries({ queryKey: key })
      const prev = qc.getQueryData<Task[]>(key) ?? []
      setTasks((p) =>
        p.map((t) =>
          t.id === id
            ? {
                ...t,
                status: done ? 'done' : 'todo',
                completed_at: done ? new Date().toISOString() : null,
              }
            : t,
        ),
      )
      return { prev }
    },
    onError: (_e, _v, ctx) => rollback(ctx),
    onSettled: settle,
  })

  const deleteTask = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('tasks').delete().eq('id', id)
      if (error) throw error
    },
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: key })
      const prev = qc.getQueryData<Task[]>(key) ?? []
      setTasks((p) => p.filter((t) => t.id !== id))
      return { prev }
    },
    onError: (_e, _v, ctx) => rollback(ctx),
    onSettled: settle,
  })

  /**
   * Persist a single task's new fractional position (atomic single-row update).
   * Only the dragged task changes, so sibling views that share the same task
   * are not reshuffled.
   */
  const reorderTask = useMutation({
    mutationFn: async ({ id, position }: { id: string; position: number }) => {
      const { error } = await supabase.from('tasks').update({ position }).eq('id', id)
      if (error) throw error
    },
    onMutate: async ({ id, position }) => {
      await qc.cancelQueries({ queryKey: key })
      const prev = qc.getQueryData<Task[]>(key) ?? []
      setTasks((p) => p.map((t) => (t.id === id ? { ...t, position } : t)))
      return { prev }
    },
    onError: (_e, _v, ctx) => rollback(ctx),
    onSettled: settle,
  })

  return { createTask, updateTask, toggleComplete, deleteTask, reorderTask }
}
