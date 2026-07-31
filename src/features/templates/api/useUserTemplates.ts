import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { qk } from '@/lib/queryKeys'
import { useAuth } from '@/features/auth/auth-context'
import type { NewUserTemplateInput, UserTemplate, UserTemplatePatch } from '@/types/database'
import { assertRealIds } from '@/lib/optimistic'

/**
 * What a write reports back. `styleDropped` is true when a checklist style was
 * asked for but the `style` column does not exist yet — the template itself was
 * still saved. Callers use it to say so instead of implying the style stuck.
 */
export interface WriteResult {
  styleDropped: boolean
}

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
  /**
   * PostgREST / Postgres codes for "that COLUMN isn't there".
   *
   * A missing column is a DIFFERENT failure from a missing table, and it is the
   * one that bites on deploy order: `style` ships in a migration that may not be
   * applied yet, and naming an unknown column in an insert fails outright. So
   * `style` is only ever named when it carries a non-default value, and a
   * missing column falls back to saving WITHOUT it — the template is kept and
   * the caller is told the style was dropped, rather than the user losing work
   * or being told a lie.
   */
  const COLUMN_MISSING = new Set(['PGRST204', '42703'])

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
    mutationFn: async (input: NewUserTemplateInput): Promise<WriteResult> => {
      assertRealIds(input)
      const base = {
        user_id: userId,
        title: input.title,
        description: input.description ?? null,
        icon: input.icon ?? null,
        color: input.color ?? null,
        tasks: input.tasks,
      }
      const wantsStyle = input.style === 'checklist'

      if (wantsStyle) {
        const withStyle = await supabase
          .from('user_templates')
          .insert({ ...base, style: 'checklist' })
          .select('*')
          .single()
        if (!withStyle.error) return { styleDropped: false }
        if (!COLUMN_MISSING.has(withStyle.error.code)) throw withStyle.error
        // Column not there yet — fall through and save the template anyway.
      }

      const { error } = await supabase.from('user_templates').insert(base).select('*').single()
      if (error) throw error
      return { styleDropped: wantsStyle }
    },
    onSuccess: invalidate,
    // Non-idempotent insert: no one-click retry (it could double-save).
    meta: { noRetry: true },
  })

  const updateTemplate = useMutation({
    mutationFn: async ({
      id,
      patch,
    }: {
      id: string
      patch: UserTemplatePatch
    }): Promise<WriteResult> => {
      // Two DIFFERENT questions, deliberately answered separately:
      //  • should the column be written?  Whenever the patch carries it — so
      //    switching a checklist back to a plan persists once the column exists.
      //  • should we TELL the user the style was dropped?  Only when a checklist
      //    was actually asked for. The editor always sends `style`, so keying the
      //    message off key-presence made every plain edit claim "checklist mode
      //    isn't switched on yet", which was simply untrue.
      assertRealIds(patch)
      const wantsChecklist = patch.style === 'checklist'
      if ('style' in patch) {
        const withStyle = await supabase.from('user_templates').update(patch).eq('id', id)
        if (!withStyle.error) return { styleDropped: false }
        if (!COLUMN_MISSING.has(withStyle.error.code)) throw withStyle.error
      }
      // Same fallback as the insert: keep the edit, drop only the style.
      const rest = { ...patch }
      delete rest.style
      const { error } = await supabase.from('user_templates').update(rest).eq('id', id)
      if (error) throw error
      return { styleDropped: wantsChecklist }
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
