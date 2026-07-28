import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { qk } from '@/lib/queryKeys'
import { useAuth } from '@/features/auth/auth-context'
import type { NewUserTemplateInput, UserTemplate, UserTemplatePatch } from '@/types/database'

/**
 * Owner-only personal templates (RLS: user_id = auth.uid()). Mirrors the
 * wellness tracker's user-scoped query/mutation shape.
 *
 * DEGRADES GRACEFULLY WHEN THE TABLE IS ABSENT. The migration ships committed
 * but unapplied, so until `supabase db push` runs, the read returns [] instead
 * of throwing — the "My templates" section simply doesn't render and the rest of
 * the app is untouched. (Same defensive posture usePlan takes for `billing`.)
 * Writes still surface a real error, because silently swallowing a failed save
 * would lose the user's work.
 */
export function useUserTemplates() {
  const { user } = useAuth()
  const userId = user?.id ?? ''
  const qc = useQueryClient()
  const key = qk.userTemplates(userId)

  /** PostgREST / Postgres codes for "that table isn't there". */
  const TABLE_MISSING = new Set(['PGRST205', '42P01'])

  const query = useQuery({
    queryKey: key,
    enabled: !!userId,
    retry: false,
    queryFn: async (): Promise<{ rows: UserTemplate[]; available: boolean }> => {
      const { data, error } = await supabase
        .from('user_templates')
        .select('*')
        .order('created_at', { ascending: false })
      if (error) {
        // Migration not applied yet ⇒ mark the feature unavailable so the UI can
        // hide its create affordances rather than offering a button that can
        // only fail. Any OTHER error is transient: keep the feature available.
        return { rows: [], available: !TABLE_MISSING.has(error.code) }
      }
      return { rows: (data ?? []) as UserTemplate[], available: true }
    },
  })

  const invalidate = () => void qc.invalidateQueries({ queryKey: key })

  const createTemplate = useMutation({
    mutationFn: async (input: NewUserTemplateInput): Promise<UserTemplate> => {
      const { data, error } = await supabase
        .from('user_templates')
        .insert({
          user_id: userId,
          title: input.title,
          description: input.description ?? null,
          icon: input.icon ?? null,
          color: input.color ?? null,
          tasks: input.tasks,
        })
        .select('*')
        .single()
      if (error) throw error
      return data as UserTemplate
    },
    onSuccess: invalidate,
    // Non-idempotent insert: no one-click retry (it could double-save).
    meta: { noRetry: true },
  })

  const updateTemplate = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: UserTemplatePatch }) => {
      const { error } = await supabase.from('user_templates').update(patch).eq('id', id)
      if (error) throw error
    },
    onSuccess: invalidate,
  })

  const deleteTemplate = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('user_templates').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: invalidate,
  })

  return {
    templates: query.data?.rows ?? [],
    /**
     * False ONLY when the table is absent (migration pending). Defaults to true
     * while loading so the create buttons don't flicker out and back in.
     */
    available: query.data?.available ?? true,
    isPending: query.isPending,
    createTemplate,
    updateTemplate,
    deleteTemplate,
  }
}
