import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { qk } from '@/lib/queryKeys'
import type { NewVisionCardInput, VisionCard, VisionCardPatch } from '@/types/database'

/** PostgREST / Postgres codes for "that table isn't there". */
const TABLE_MISSING = new Set(['PGRST205', '42P01'])

/**
 * Owner-only vision cards (RLS: user_id = auth.uid()), with optimistic
 * mutations mirroring `useQuitMutations` / `useWellnessMutations`.
 *
 * DEGRADES GRACEFULLY WHEN THE TABLE IS ABSENT. The migration ships committed
 * but unapplied, so until `supabase db push` runs the read returns [] and marks
 * itself unavailable — the page then shows an honest "not switched on yet" state
 * instead of an Add button that could only ever fail, and switches itself on the
 * moment the table exists. Same posture as `useUserTemplates` and `useQuitHabits`.
 */
export function useVisionCards(userId: string) {
  return useQuery({
    queryKey: qk.visionCards(userId),
    enabled: !!userId,
    retry: false,
    queryFn: async (): Promise<{ rows: VisionCard[]; available: boolean }> => {
      const { data, error } = await supabase
        .from('vision_cards')
        .select('*')
        .eq('user_id', userId)
        .order('position', { ascending: true })
      if (error) {
        // Migration not applied yet ⇒ unavailable. Any OTHER error is transient:
        // keep the feature available so a blip doesn't hide someone's goals.
        return { rows: [], available: !TABLE_MISSING.has(error.code) }
      }
      return { rows: (data ?? []) as VisionCard[], available: true }
    },
  })
}

export function useVisionMutations(userId: string) {
  const qc = useQueryClient()
  const key = qk.visionCards(userId)

  type Cache = { rows: VisionCard[]; available: boolean }

  const setCards = (u: (p: VisionCard[]) => VisionCard[]) =>
    qc.setQueryData<Cache>(key, (p) => ({
      available: p?.available ?? true,
      rows: u(p?.rows ?? []),
    }))

  const snapshot = () => qc.getQueryData<Cache>(key)
  const restore = (prev: Cache | undefined) => {
    if (prev) qc.setQueryData(key, prev)
  }
  const settle = () => void qc.invalidateQueries({ queryKey: key })

  const createCard = useMutation({
    mutationFn: async (input: NewVisionCardInput) => {
      const { data, error } = await supabase
        .from('vision_cards')
        .insert({
          user_id: userId,
          title: input.title,
          why: input.why ?? null,
          target_date: input.target_date ?? null,
          position: input.position ?? 0,
          project_id: input.project_id ?? null,
        })
        .select('*')
        .single()
      if (error) throw error
      return data as VisionCard
    },
    onMutate: async (input) => {
      await qc.cancelQueries({ queryKey: key })
      const prev = snapshot()
      const now = new Date().toISOString()
      const optimistic: VisionCard = {
        id: `optimistic-${crypto.randomUUID()}`,
        user_id: userId,
        title: input.title,
        why: input.why ?? null,
        target_date: input.target_date ?? null,
        position: input.position ?? 0,
        project_id: input.project_id ?? null,
        created_at: now,
        updated_at: now,
      }
      setCards((p) => [...p, optimistic])
      return { prev }
    },
    onError: (_e, _v, ctx) => restore(ctx?.prev),
    onSettled: settle,
    // Non-idempotent insert: don't offer a one-click Retry (could double-insert).
    meta: { noRetry: true },
  })

  const updateCard = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: VisionCardPatch }) => {
      const { data, error } = await supabase
        .from('vision_cards')
        .update(patch)
        .eq('id', id)
        .select('*')
        .single()
      if (error) throw error
      return data as VisionCard
    },
    onMutate: async ({ id, patch }) => {
      await qc.cancelQueries({ queryKey: key })
      const prev = snapshot()
      setCards((p) => p.map((c) => (c.id === id ? { ...c, ...patch } : c)))
      return { prev }
    },
    onError: (_e, _v, ctx) => restore(ctx?.prev),
    onSettled: settle,
  })

  /**
   * Reorder: ONE row, ONE fractional position — the same contract every other
   * sortable list in the app uses (`newPositionForMove` + `positionBetween`).
   * No reindex, no batch write.
   */
  const reorderCard = useMutation({
    mutationFn: async ({ id, position }: { id: string; position: number }) => {
      const { error } = await supabase.from('vision_cards').update({ position }).eq('id', id)
      if (error) throw error
    },
    onMutate: async ({ id, position }) => {
      await qc.cancelQueries({ queryKey: key })
      const prev = snapshot()
      setCards((p) => p.map((c) => (c.id === id ? { ...c, position } : c)))
      return { prev }
    },
    onError: (_e, _v, ctx) => restore(ctx?.prev),
    onSettled: settle,
  })

  const deleteCard = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('vision_cards').delete().eq('id', id)
      if (error) throw error
    },
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: key })
      const prev = snapshot()
      setCards((p) => p.filter((c) => c.id !== id))
      return { prev }
    },
    onError: (_e, _v, ctx) => restore(ctx?.prev),
    onSettled: settle,
  })

  return { createCard, updateCard, reorderCard, deleteCard }
}
