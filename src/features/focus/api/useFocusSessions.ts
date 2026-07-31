import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { qk } from '@/lib/queryKeys'
import type { FocusSession, FocusSessionPatch, NewFocusSessionInput } from '@/types/database'
import { assertRealIds } from '@/lib/optimistic'

/** All focus sessions for the workspace (newest first). Drives the active
 *  session (re-entry on reload) and per-task focus stats from one cache. */
export function useFocusSessions(workspaceId: string) {
  return useQuery({
    queryKey: qk.focus(workspaceId),
    enabled: !!workspaceId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('focus_sessions')
        .select('*')
        .eq('workspace_id', workspaceId)
        .order('started_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as FocusSession[]
    },
  })
}

export function useFocusMutations(workspaceId: string) {
  const qc = useQueryClient()
  const key = qk.focus(workspaceId)

  const setSessions = (updater: (prev: FocusSession[]) => FocusSession[]) => {
    qc.setQueryData<FocusSession[]>(key, (prev) => updater(prev ?? []))
  }
  const rollback = (ctx: { prev?: FocusSession[] } | undefined) => {
    if (ctx?.prev) qc.setQueryData(key, ctx.prev)
  }
  const settle = () => {
    void qc.invalidateQueries({ queryKey: key })
  }

  // Insert is awaited (no temp id) so the running session has its real id
  // immediately — pause/interruption patches target the correct row.
  const startSession = useMutation({
    mutationFn: async (input: NewFocusSessionInput) => {
      // `focus_sessions.task_id` is a uuid FK to `tasks`, whose id CAN still be
      // a placeholder — creating a task and hitting Focus on it straight away
      // is a normal thing to do, and it sent `optimistic-…` to the database.
      assertRealIds(input)
      const { data, error } = await supabase
        .from('focus_sessions')
        .insert(input)
        .select('*')
        .single()
      if (error) throw error
      return data as FocusSession
    },
    onSuccess: (row) => {
      setSessions((p) => [row, ...p.filter((s) => s.id !== row.id)])
    },
    onSettled: settle,
    // Non-idempotent insert: don't offer a one-click Retry (could double-insert
    // if the row actually persisted before a network error surfaced).
    meta: { noRetry: true },
  })

  const patchSession = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: FocusSessionPatch }) => {
      // Guards the FKs a PATCH can carry, not just the row it addresses.
      assertRealIds(patch)
      const { data, error } = await supabase
        .from('focus_sessions')
        .update(patch)
        .eq('id', id)
        .select('*')
        .single()
      if (error) throw error
      return data as FocusSession
    },
    onMutate: async ({ id, patch }) => {
      await qc.cancelQueries({ queryKey: key })
      const prev = qc.getQueryData<FocusSession[]>(key) ?? []
      setSessions((p) => p.map((s) => (s.id === id ? { ...s, ...patch } : s)))
      return { prev }
    },
    onError: (_e, _v, ctx) => rollback(ctx),
    onSettled: settle,
  })

  return { startSession, patchSession }
}
