import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { qk } from '@/lib/queryKeys'
import type {
  NewWellnessItemInput,
  WellnessItem,
  WellnessItemPatch,
  WellnessLog,
} from '@/types/database'

/**
 * Owner-scoped wellness mutations with optimistic updates against the
 * wellness-items / wellness-logs caches, mirroring useTaskMutations. The
 * `user_id` on every insert equals the signed-in user (RLS enforces it too).
 */
export function useWellnessMutations(userId: string) {
  const qc = useQueryClient()
  const itemsKey = qk.wellnessItems(userId)
  const logsKey = qk.wellnessLogs(userId)

  const setItems = (u: (p: WellnessItem[]) => WellnessItem[]) =>
    qc.setQueryData<WellnessItem[]>(itemsKey, (p) => u(p ?? []))
  const setLogs = (u: (p: WellnessLog[]) => WellnessLog[]) =>
    qc.setQueryData<WellnessLog[]>(logsKey, (p) => u(p ?? []))

  const createItem = useMutation({
    mutationFn: async (input: NewWellnessItemInput) => {
      const { data, error } = await supabase
        .from('wellness_items')
        .insert({ ...input, user_id: userId })
        .select('*')
        .single()
      if (error) throw error
      return data as WellnessItem
    },
    onMutate: async (input) => {
      await qc.cancelQueries({ queryKey: itemsKey })
      const prev = qc.getQueryData<WellnessItem[]>(itemsKey) ?? []
      const now = new Date().toISOString()
      const optimistic: WellnessItem = {
        id: `optimistic-${crypto.randomUUID()}`,
        user_id: userId,
        name: input.name,
        dose: input.dose ?? null,
        schedule: input.schedule ?? null,
        notes: input.notes ?? null,
        created_at: now,
        updated_at: now,
      }
      setItems((p) => [...p, optimistic])
      return { prev }
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(itemsKey, ctx.prev)
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: itemsKey }),
  })

  const updateItem = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: WellnessItemPatch }) => {
      const { data, error } = await supabase
        .from('wellness_items')
        .update(patch)
        .eq('id', id)
        .select('*')
        .single()
      if (error) throw error
      return data as WellnessItem
    },
    onMutate: async ({ id, patch }) => {
      await qc.cancelQueries({ queryKey: itemsKey })
      const prev = qc.getQueryData<WellnessItem[]>(itemsKey) ?? []
      setItems((p) => p.map((it) => (it.id === id ? { ...it, ...patch } : it)))
      return { prev }
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(itemsKey, ctx.prev)
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: itemsKey }),
  })

  const deleteItem = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('wellness_items').delete().eq('id', id)
      if (error) throw error
    },
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: itemsKey })
      await qc.cancelQueries({ queryKey: logsKey })
      const prevItems = qc.getQueryData<WellnessItem[]>(itemsKey) ?? []
      const prevLogs = qc.getQueryData<WellnessLog[]>(logsKey) ?? []
      setItems((p) => p.filter((it) => it.id !== id))
      setLogs((p) => p.filter((l) => l.item_id !== id)) // DB cascades; mirror in UI
      return { prevItems, prevLogs }
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prevItems) qc.setQueryData(itemsKey, ctx.prevItems)
      if (ctx?.prevLogs) qc.setQueryData(logsKey, ctx.prevLogs)
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: itemsKey })
      void qc.invalidateQueries({ queryKey: logsKey })
    },
  })

  const markTaken = useMutation({
    mutationFn: async (itemId: string) => {
      const { data, error } = await supabase
        .from('wellness_logs')
        .insert({ item_id: itemId, user_id: userId })
        .select('*')
        .single()
      if (error) throw error
      return data as WellnessLog
    },
    onMutate: async (itemId) => {
      await qc.cancelQueries({ queryKey: logsKey })
      const prev = qc.getQueryData<WellnessLog[]>(logsKey) ?? []
      const now = new Date().toISOString()
      const tempId = `optimistic-${crypto.randomUUID()}`
      const optimistic: WellnessLog = {
        id: tempId,
        user_id: userId,
        item_id: itemId,
        taken_at: now,
        created_at: now,
      }
      setLogs((p) => [optimistic, ...p])
      return { prev, tempId }
    },
    onSuccess: (real, _itemId, ctx) => {
      // Swap the optimistic row for the real one so its real id is available to
      // undo immediately (before the settle refetch) — closes a mark->undo race.
      setLogs((p) => p.map((l) => (l.id === ctx?.tempId ? real : l)))
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(logsKey, ctx.prev)
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: logsKey }),
  })

  /** Undo "taken" by removing today's log rows for an item. Keyed by itemId so
   *  the UI can scope the pending state and block a same-item re-toggle race. */
  const undoTaken = useMutation({
    mutationFn: async ({ logIds }: { itemId: string; logIds: string[] }) => {
      const realIds = logIds.filter((id) => !id.startsWith('optimistic-'))
      if (realIds.length === 0) return
      const { error } = await supabase.from('wellness_logs').delete().in('id', realIds)
      if (error) throw error
    },
    onMutate: async ({ logIds }) => {
      await qc.cancelQueries({ queryKey: logsKey })
      const prev = qc.getQueryData<WellnessLog[]>(logsKey) ?? []
      const remove = new Set(logIds)
      setLogs((p) => p.filter((l) => !remove.has(l.id)))
      return { prev }
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(logsKey, ctx.prev)
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: logsKey }),
  })

  return { createItem, updateItem, deleteItem, markTaken, undoTaken }
}
