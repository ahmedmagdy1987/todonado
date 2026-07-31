import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { qk } from '@/lib/queryKeys'
import { assertRealId, assertRealIds, isOptimisticId } from '@/lib/optimistic'
import type { NewSectionInput, Section } from '@/types/database'

export function useSections(projectId: string) {
  return useQuery({
    queryKey: qk.sections(projectId),
    // A project id can still be a placeholder (useProjects mints one), and
    // `.eq('project_id', 'optimistic-…')` is a 22P02 PARSE error on a uuid
    // column, not an empty result. Don't ask until the project is real.
    enabled: !!projectId && !isOptimisticId(projectId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('sections')
        .select('*')
        .eq('project_id', projectId)
        .order('position', { ascending: true })
      if (error) throw error
      return (data ?? []) as Section[]
    },
  })
}

export function useSectionMutations(projectId: string) {
  const qc = useQueryClient()
  const key = qk.sections(projectId)

  const setSections = (updater: (prev: Section[]) => Section[]) => {
    qc.setQueryData<Section[]>(key, (prev) => updater(prev ?? []))
  }
  const rollback = (ctx: { prev?: Section[] } | undefined) => {
    if (ctx?.prev) qc.setQueryData(key, ctx.prev)
  }
  const settle = () => {
    void qc.invalidateQueries({ queryKey: key })
  }

  /**
   * Creating a section AWAITS the insert — it deliberately mints no placeholder.
   *
   * This is the exception `src/lib/optimistic.ts` names: await instead of
   * minting "when the caller needs the real id immediately … to reference it
   * from another table". `tasks.section_id` is precisely that, and the
   * referencing write is ONE KEYSTROKE away — `SectionGroup` renders a QuickAdd
   * directly beneath the section it has just drawn. Optimistically, that put a
   * placeholder uuid on screen with a text box under it, and the first task
   * typed into it reached PostgREST as `section_id: 'optimistic-…'` — a 22P02
   * PARSE error, after which the global handler offered a Retry that replayed
   * the same invalid id.
   *
   * The price is one round trip before the section appears. That is invisible
   * next to an error toast on a task the user has already finished typing.
   */
  const createSection = useMutation({
    mutationFn: async (input: NewSectionInput) => {
      assertRealIds(input)
      const { data, error } = await supabase.from('sections').insert(input).select('*').single()
      if (error) throw error
      return data as Section
    },
    onSuccess: (data) => {
      // Put the REAL row in the cache at once, so the section is usable without
      // waiting for the settle refetch to come back.
      setSections((p) => (p.some((s) => s.id === data.id) ? p : [...p, data]))
    },
    onSettled: settle,
    // Non-idempotent insert: don't offer a one-click Retry (could double-insert).
    meta: { noRetry: true },
  })

  const renameSection = useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      assertRealId(id)
      const { error } = await supabase.from('sections').update({ name }).eq('id', id)
      if (error) throw error
    },
    onMutate: async ({ id, name }) => {
      await qc.cancelQueries({ queryKey: key })
      const prev = qc.getQueryData<Section[]>(key) ?? []
      setSections((p) => p.map((s) => (s.id === id ? { ...s, name } : s)))
      return { prev }
    },
    onError: (_e, _v, ctx) => rollback(ctx),
    onSettled: settle,
  })

  const deleteSection = useMutation({
    mutationFn: async (id: string) => {
      assertRealId(id)
      const { error } = await supabase.from('sections').delete().eq('id', id)
      if (error) throw error
    },
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: key })
      const prev = qc.getQueryData<Section[]>(key) ?? []
      setSections((p) => p.filter((s) => s.id !== id))
      return { prev }
    },
    onError: (_e, _v, ctx) => rollback(ctx),
    onSettled: settle,
  })

  const reorderSection = useMutation({
    mutationFn: async ({ id, position }: { id: string; position: number }) => {
      assertRealId(id)
      const { error } = await supabase.from('sections').update({ position }).eq('id', id)
      if (error) throw error
    },
    onMutate: async ({ id, position }) => {
      await qc.cancelQueries({ queryKey: key })
      const prev = qc.getQueryData<Section[]>(key) ?? []
      setSections((p) => p.map((s) => (s.id === id ? { ...s, position } : s)))
      return { prev }
    },
    onError: (_e, _v, ctx) => rollback(ctx),
    onSettled: settle,
  })

  return { createSection, renameSection, deleteSection, reorderSection }
}
