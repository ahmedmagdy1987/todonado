import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { qk } from '@/lib/queryKeys'
import type { WellnessItem, WellnessLog } from '@/types/database'

/** The signed-in user's tracked items. RLS restricts rows to the owner. */
export function useWellnessItems(userId: string) {
  return useQuery({
    queryKey: qk.wellnessItems(userId),
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('wellness_items')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: true })
      if (error) throw error
      return (data ?? []) as WellnessItem[]
    },
  })
}

/** The user's "taken" history (most recent first). */
export function useWellnessLogs(userId: string) {
  return useQuery({
    queryKey: qk.wellnessLogs(userId),
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('wellness_logs')
        .select('*')
        .eq('user_id', userId)
        .order('taken_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as WellnessLog[]
    },
  })
}
