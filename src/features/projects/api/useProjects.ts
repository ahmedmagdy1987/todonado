import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { qk } from '@/lib/queryKeys'
import type { NewProjectInput, Project } from '@/types/database'

export function useProjects(workspaceId: string) {
  return useQuery({
    queryKey: qk.projects(workspaceId),
    enabled: !!workspaceId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('projects')
        .select('*')
        .eq('workspace_id', workspaceId)
        .order('created_at', { ascending: true })
      if (error) throw error
      return (data ?? []) as Project[]
    },
  })
}

export function useProjectMutations(workspaceId: string) {
  const qc = useQueryClient()
  const key = qk.projects(workspaceId)

  const setProjects = (updater: (prev: Project[]) => Project[]) => {
    qc.setQueryData<Project[]>(key, (prev) => updater(prev ?? []))
  }
  const rollback = (ctx: { prev?: Project[] } | undefined) => {
    if (ctx?.prev) qc.setQueryData(key, ctx.prev)
  }
  const settle = () => {
    void qc.invalidateQueries({ queryKey: key })
  }

  const createProject = useMutation({
    mutationFn: async (input: NewProjectInput) => {
      const { data, error } = await supabase.from('projects').insert(input).select('*').single()
      if (error) throw error
      return data as Project
    },
    onMutate: async (input) => {
      await qc.cancelQueries({ queryKey: key })
      const prev = qc.getQueryData<Project[]>(key) ?? []
      const now = new Date().toISOString()
      setProjects((p) => [
        ...p,
        {
          id: `optimistic-${crypto.randomUUID()}`,
          workspace_id: input.workspace_id,
          name: input.name,
          color: input.color ?? '#6C5CE7',
          status: 'active',
          created_at: now,
          updated_at: now,
        },
      ])
      return { prev }
    },
    onError: (_e, _v, ctx) => rollback(ctx),
    onSettled: settle,
  })

  const updateProject = useMutation({
    mutationFn: async ({
      id,
      patch,
    }: {
      id: string
      patch: Partial<Pick<Project, 'name' | 'color' | 'status'>>
    }) => {
      const { data, error } = await supabase
        .from('projects')
        .update(patch)
        .eq('id', id)
        .select('*')
        .single()
      if (error) throw error
      return data as Project
    },
    onMutate: async ({ id, patch }) => {
      await qc.cancelQueries({ queryKey: key })
      const prev = qc.getQueryData<Project[]>(key) ?? []
      setProjects((p) => p.map((proj) => (proj.id === id ? { ...proj, ...patch } : proj)))
      return { prev }
    },
    onError: (_e, _v, ctx) => rollback(ctx),
    onSettled: settle,
  })

  const archiveProject = useMutation({
    mutationFn: async ({ id, archived }: { id: string; archived: boolean }) => {
      const { error } = await supabase
        .from('projects')
        .update({ status: archived ? 'archived' : 'active' })
        .eq('id', id)
      if (error) throw error
    },
    onMutate: async ({ id, archived }) => {
      await qc.cancelQueries({ queryKey: key })
      const prev = qc.getQueryData<Project[]>(key) ?? []
      setProjects((p) =>
        p.map((proj) => (proj.id === id ? { ...proj, status: archived ? 'archived' : 'active' } : proj)),
      )
      return { prev }
    },
    onError: (_e, _v, ctx) => rollback(ctx),
    onSettled: settle,
  })

  return { createProject, updateProject, archiveProject }
}
