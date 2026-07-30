import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { qk } from '@/lib/queryKeys'
import type { QuitCheckin, QuitHabit } from '@/types/database'

/** PostgREST / Postgres codes for "that table isn't there". */
const TABLE_MISSING = new Set(['PGRST205', '42P01'])

/**
 * Owner-only quit habits + their check-ins (RLS: user_id = auth.uid()).
 * Mirrors the wellness tracker's user-scoped query shape.
 *
 * DEGRADES GRACEFULLY WHEN THE TABLES ARE ABSENT. The tables are applied now, so
 * this path is DORMANT rather than dead — keep it. It is what makes a fresh
 * Supabase project, a half-applied push, or the next committed-but-unapplied
 * migration safe by default: the read returns [] and marks itself unavailable, so
 * the page shows an honest "not switched on yet" state instead of an Add button
 * that could only ever fail. Exactly the posture useUserTemplates takes.
 */
export function useQuitHabits(userId: string) {
  return useQuery({
    queryKey: qk.quitHabits(userId),
    enabled: !!userId,
    retry: false,
    queryFn: async (): Promise<{ rows: QuitHabit[]; available: boolean }> => {
      const { data, error } = await supabase
        .from('quit_habits')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: true })
      if (error) {
        // Migration not applied yet ⇒ unavailable. Any OTHER error is transient:
        // keep the feature available so a blip doesn't hide someone's streak.
        return { rows: [], available: !TABLE_MISSING.has(error.code) }
      }
      return { rows: (data ?? []) as QuitHabit[], available: true }
    },
  })
}

/** The user's "still clean today" affirmations (most recent day first). */
export function useQuitCheckins(userId: string) {
  return useQuery({
    queryKey: qk.quitCheckins(userId),
    enabled: !!userId,
    retry: false,
    queryFn: async (): Promise<QuitCheckin[]> => {
      const { data, error } = await supabase
        .from('quit_checkins')
        .select('*')
        .eq('user_id', userId)
        .order('checked_on', { ascending: false })
      if (error) {
        if (TABLE_MISSING.has(error.code)) return []
        throw error
      }
      return (data ?? []) as QuitCheckin[]
    },
  })
}
