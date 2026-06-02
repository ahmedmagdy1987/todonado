import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { qk } from '@/lib/queryKeys'
import type { Task } from '@/types/database'

/**
 * Single source of truth for the workspace's tasks. Every view (Inbox, Today,
 * Projects) is derived from this one cache via pure selectors, which keeps
 * optimistic updates simple and consistent.
 */
export function useTasks(workspaceId: string) {
  return useQuery({
    queryKey: qk.tasks(workspaceId),
    enabled: !!workspaceId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tasks')
        .select('*')
        .eq('workspace_id', workspaceId)
        .order('position', { ascending: true })
        .order('created_at', { ascending: true })
      if (error) throw error
      return (data ?? []) as Task[]
    },
  })
}
