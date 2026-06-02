import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { qk } from '@/lib/queryKeys'
import type { NewSectionInput, Section } from '@/types/database'

export function useSections(projectId: string) {
  return useQuery({
    queryKey: qk.sections(projectId),
    enabled: !!projectId,
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

  const createSection = useMutation({
    mutationFn: async (input: NewSectionInput) => {
      const { data, error } = await supabase.from('sections').insert(input).select('*').single()
      if (error) throw error
      return data as Section
    },
    onMutate: async (input) => {
      await qc.cancelQueries({ queryKey: key })
      const prev = qc.getQueryData<Section[]>(key) ?? []
      const now = new Date().toISOString()
      setSections((p) => [
        ...p,
        {
          id: `optimistic-${crypto.randomUUID()}`,
          project_id: input.project_id,
          name: input.name,
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

  const renameSection = useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
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
