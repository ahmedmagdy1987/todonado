import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { qk } from '@/lib/queryKeys'
import { ENABLE_REALTIME } from '@/lib/config'

/**
 * Subscribe to Supabase realtime changes for the active workspace and refresh
 * the relevant TanStack Query caches. Correctness over flash: we invalidate
 * (refetch) rather than patch caches from payloads, so the source of truth
 * stays the database. Gated by ENABLE_REALTIME.
 *
 * Requires the tables to be in the `supabase_realtime` publication
 * (see supabase/migrations/20260603090100_realtime.sql).
 */
export function useRealtimeSync(workspaceId: string) {
  const qc = useQueryClient()

  useEffect(() => {
    if (!ENABLE_REALTIME || !workspaceId) return

    const invalidateTasks = () => void qc.invalidateQueries({ queryKey: qk.tasks(workspaceId) })
    const invalidateProjects = () =>
      void qc.invalidateQueries({ queryKey: qk.projects(workspaceId) })
    // sections/subtasks have no workspace_id column; invalidate the family.
    const invalidateSections = () => void qc.invalidateQueries({ queryKey: ['sections'] })
    const invalidateSubtasks = () => void qc.invalidateQueries({ queryKey: ['subtasks'] })

    const channel = supabase
      .channel(`workspace:${workspaceId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'tasks', filter: `workspace_id=eq.${workspaceId}` },
        invalidateTasks,
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'projects',
          filter: `workspace_id=eq.${workspaceId}`,
        },
        invalidateProjects,
      )
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sections' }, invalidateSections)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'subtasks' }, invalidateSubtasks)
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [qc, workspaceId])
}
