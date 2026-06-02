import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { qk } from '@/lib/queryKeys'
import type { Profile } from '@/types/database'

/** Update the signed-in user's daily capacity (minutes), with optimistic UI. */
export function useUpdateCapacity() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (minutes: number) => {
      const { data: auth } = await supabase.auth.getUser()
      const id = auth.user?.id
      if (!id) throw new Error('Not authenticated')
      const { data, error } = await supabase
        .from('profiles')
        .update({ daily_capacity_minutes: minutes })
        .eq('id', id)
        .select('*')
        .single()
      if (error) throw error
      return data as Profile
    },
    onMutate: async (minutes) => {
      await qc.cancelQueries({ queryKey: qk.profile })
      const prev = qc.getQueryData<Profile>(qk.profile)
      if (prev) {
        qc.setQueryData<Profile>(qk.profile, { ...prev, daily_capacity_minutes: minutes })
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
