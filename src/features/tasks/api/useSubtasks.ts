import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { qk } from '@/lib/queryKeys'
import { positionUpdates } from '@/lib/reorder'
import type { NewSubtaskInput, Subtask } from '@/types/database'

export function useSubtasks(taskId: string, enabled = true) {
  return useQuery({
    queryKey: qk.subtasks(taskId),
    enabled: enabled && !!taskId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('subtasks')
        .select('*')
        .eq('task_id', taskId)
        .order('position', { ascending: true })
      if (error) throw error
      return (data ?? []) as Subtask[]
    },
  })
}

export function useSubtaskMutations(taskId: string) {
  const qc = useQueryClient()
  const key = qk.subtasks(taskId)

  const setSubtasks = (updater: (prev: Subtask[]) => Subtask[]) => {
    qc.setQueryData<Subtask[]>(key, (prev) => updater(prev ?? []))
  }
  const rollback = (ctx: { prev?: Subtask[] } | undefined) => {
    if (ctx?.prev) qc.setQueryData(key, ctx.prev)
  }
  const settle = () => {
    void qc.invalidateQueries({ queryKey: key })
  }

  const addSubtask = useMutation({
    mutationFn: async (input: NewSubtaskInput) => {
      const { data, error } = await supabase.from('subtasks').insert(input).select('*').single()
      if (error) throw error
      return data as Subtask
    },
    onMutate: async (input) => {
      await qc.cancelQueries({ queryKey: key })
      const prev = qc.getQueryData<Subtask[]>(key) ?? []
      const now = new Date().toISOString()
      setSubtasks((p) => [
        ...p,
        {
          id: `optimistic-${crypto.randomUUID()}`,
          task_id: input.task_id,
          title: input.title,
          done: false,
          position: input.position ?? p.length,
          created_at: now,
          updated_at: now,
        },
      ])
      return { prev }
    },
    onError: (_e, _v, ctx) => rollback(ctx),
    onSettled: settle,
  })

  const toggleSubtask = useMutation({
    mutationFn: async ({ id, done }: { id: string; done: boolean }) => {
      const { error } = await supabase.from('subtasks').update({ done }).eq('id', id)
      if (error) throw error
    },
    onMutate: async ({ id, done }) => {
      await qc.cancelQueries({ queryKey: key })
      const prev = qc.getQueryData<Subtask[]>(key) ?? []
      setSubtasks((p) => p.map((s) => (s.id === id ? { ...s, done } : s)))
      return { prev }
    },
    onError: (_e, _v, ctx) => rollback(ctx),
    onSettled: settle,
  })

  const renameSubtask = useMutation({
    mutationFn: async ({ id, title }: { id: string; title: string }) => {
      const { error } = await supabase.from('subtasks').update({ title }).eq('id', id)
      if (error) throw error
    },
    onMutate: async ({ id, title }) => {
      await qc.cancelQueries({ queryKey: key })
      const prev = qc.getQueryData<Subtask[]>(key) ?? []
      setSubtasks((p) => p.map((s) => (s.id === id ? { ...s, title } : s)))
      return { prev }
    },
    onError: (_e, _v, ctx) => rollback(ctx),
    onSettled: settle,
  })

  const deleteSubtask = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('subtasks').delete().eq('id', id)
      if (error) throw error
    },
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: key })
      const prev = qc.getQueryData<Subtask[]>(key) ?? []
      setSubtasks((p) => p.filter((s) => s.id !== id))
      return { prev }
    },
    onError: (_e, _v, ctx) => rollback(ctx),
    onSettled: settle,
  })

  const reorderSubtasks = useMutation({
    mutationFn: async (orderedIds: string[]) => {
      const updates = positionUpdates(orderedIds)
      const results = await Promise.all(
        updates.map((u) =>
          supabase.from('subtasks').update({ position: u.position }).eq('id', u.id),
        ),
      )
      const failed = results.find((r) => r.error)
      if (failed?.error) throw failed.error
    },
    onMutate: async (orderedIds) => {
      await qc.cancelQueries({ queryKey: key })
      const prev = qc.getQueryData<Subtask[]>(key) ?? []
      const posById = new Map(positionUpdates(orderedIds).map((u) => [u.id, u.position]))
      setSubtasks((p) =>
        p.map((s) => (posById.has(s.id) ? { ...s, position: posById.get(s.id) ?? s.position } : s)),
      )
      return { prev }
    },
    onError: (_e, _v, ctx) => rollback(ctx),
    onSettled: settle,
  })

  return { addSubtask, toggleSubtask, renameSubtask, deleteSubtask, reorderSubtasks }
}
