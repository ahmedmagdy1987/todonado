import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { qk } from '@/lib/queryKeys'
import type { Profile } from '@/types/database'

/**
 * Mark onboarding complete for the signed-in user (finish OR skip). Optimistic
 * so the flow dismisses instantly and never re-shows.
 */
export function useCompleteOnboarding() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async () => {
      const { data: auth } = await supabase.auth.getUser()
      const id = auth.user?.id
      if (!id) throw new Error('Not authenticated')
      const { data, error } = await supabase
        .from('profiles')
        .update({ onboarding_completed: true })
        .eq('id', id)
        .select('*')
        .single()
      if (error) throw error
      return data as Profile
    },
    onMutate: async () => {
      await qc.cancelQueries({ queryKey: qk.profile })
      const prev = qc.getQueryData<Profile>(qk.profile)
      if (prev) {
        qc.setQueryData<Profile>(qk.profile, { ...prev, onboarding_completed: true })
      }
      return { prev }
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(qk.profile, ctx.prev)
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: qk.profile })
    },
  })
}
