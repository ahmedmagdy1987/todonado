import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { qk } from '@/lib/queryKeys'
import { track } from '@/features/analytics/track'
import { useAuth } from '@/features/auth/auth-context'
import type { CalendarSource, NewCalendarSourceInput } from '@/types/database'

/**
 * Owner-only calendar sources (RLS: user_id = auth.uid()). Mirrors the wellness
 * tracker's user-scoped query/mutation shape. Adding a source records an
 * adoption event; removing/adding invalidates the derived busy-minutes.
 */
export function useCalendarSources() {
  const { user } = useAuth()
  const userId = user?.id ?? ''
  const qc = useQueryClient()
  const key = qk.calendarSources(userId)

  const query = useQuery({
    queryKey: key,
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('calendar_sources')
        .select('*')
        .order('created_at', { ascending: true })
      if (error) throw error
      return (data ?? []) as CalendarSource[]
    },
  })

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: key })
    void qc.invalidateQueries({ queryKey: ['calendar-busy', userId] }) // prefix: all days
  }

  const addSource = useMutation({
    mutationFn: async (input: NewCalendarSourceInput) => {
      const { data, error } = await supabase
        .from('calendar_sources')
        .insert({
          user_id: userId,
          kind: input.kind,
          label: input.label,
          url: input.url ?? null,
          ics_text: input.ics_text ?? null,
        })
        .select('*')
        .single()
      if (error) throw error
      return data as CalendarSource
    },
    onSuccess: (_data, input) => {
      track('calendar_source_added', { source: input.kind })
      invalidate()
    },
    // Non-idempotent insert: don't offer a one-click Retry (could double-add).
    meta: { noRetry: true },
  })

  const removeSource = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('calendar_sources').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: invalidate,
  })

  return {
    sources: query.data ?? [],
    isPending: query.isPending,
    isError: query.isError,
    addSource,
    removeSource,
  }
}
