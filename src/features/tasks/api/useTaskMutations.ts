import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { qk } from '@/lib/queryKeys'
import { positionUpdates } from '@/lib/reorder'
import type { NewTaskInput, Task, TaskPatch } from '@/types/database'

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
    mutationFn: async ({ id, done }: { id: string; done: boolean }) => {
      const patch: TaskPatch = done
        ? { status: 'done', completed_at: new Date().toISOString() }
        : { status: 'todo', completed_at: null }
      const { data, error } = await supabase
        .from('tasks')
        .update(patch)
        .eq('id', id)
        .select('*')
        .single()
      if (error) throw error
      return data as Task
    },
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

  /** Persist a new ordering (array of task ids in their new order). */
  const reorderTasks = useMutation({
    mutationFn: async (orderedIds: string[]) => {
      const updates = positionUpdates(orderedIds)
      const results = await Promise.all(
        updates.map((u) =>
          supabase.from('tasks').update({ position: u.position }).eq('id', u.id),
        ),
      )
      const failed = results.find((r) => r.error)
      if (failed?.error) throw failed.error
    },
    onMutate: async (orderedIds) => {
      await qc.cancelQueries({ queryKey: key })
      const prev = qc.getQueryData<Task[]>(key) ?? []
      const posById = new Map(positionUpdates(orderedIds).map((u) => [u.id, u.position]))
      setTasks((p) =>
        p.map((t) => (posById.has(t.id) ? { ...t, position: posById.get(t.id) ?? t.position } : t)),
      )
      return { prev }
    },
    onError: (_e, _v, ctx) => rollback(ctx),
    onSettled: settle,
  })

  return { createTask, updateTask, toggleComplete, deleteTask, reorderTasks }
}
