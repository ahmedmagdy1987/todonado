import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { qk } from '@/lib/queryKeys'
import { assertRealId, newOptimisticId } from '@/lib/optimistic'
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
      const tempId = newOptimisticId()
      setSubtasks((p) => [
        ...p,
        {
          id: tempId,
          task_id: input.task_id,
          title: input.title,
          done: false,
          position: input.position ?? p.length,
          created_at: now,
          updated_at: now,
        },
      ])
      return { prev, tempId }
    },
    onSuccess: (data, _input, ctx) => {
      // Swap the placeholder for the REAL row rather than waiting for the settle
      // refetch: until this lands the row is on screen, fully interactive, and
      // carrying an id no other write can use. See src/lib/optimistic.ts.
      if (ctx?.tempId) setSubtasks((p) => p.map((r) => (r.id === ctx.tempId ? data : r)))
    },
    onError: (_e, _v, ctx) => rollback(ctx),
    onSettled: settle,
    // Non-idempotent insert: don't offer a one-click Retry (could double-insert).
    meta: { noRetry: true },
  })

  const toggleSubtask = useMutation({
    mutationFn: async ({ id, done }: { id: string; done: boolean }) => {
      assertRealId(id)
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
      assertRealId(id)
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
      assertRealId(id)
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

  const reorderSubtask = useMutation({
    mutationFn: async ({ id, position }: { id: string; position: number }) => {
      assertRealId(id)
      const { error } = await supabase.from('subtasks').update({ position }).eq('id', id)
      if (error) throw error
    },
    onMutate: async ({ id, position }) => {
      await qc.cancelQueries({ queryKey: key })
      const prev = qc.getQueryData<Subtask[]>(key) ?? []
      setSubtasks((p) => p.map((s) => (s.id === id ? { ...s, position } : s)))
      return { prev }
    },
    onError: (_e, _v, ctx) => rollback(ctx),
    onSettled: settle,
  })

  return { addSubtask, toggleSubtask, renameSubtask, deleteSubtask, reorderSubtask }
}
