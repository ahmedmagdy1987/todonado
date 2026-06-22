import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { qk } from '@/lib/queryKeys'
import type { Profile } from '@/types/database'

/** Thrown when the chosen username collides with the case-insensitive unique index. */
export class UsernameTakenError extends Error {
  constructor() {
    super('That username is already taken.')
    this.name = 'UsernameTakenError'
  }
}

export interface ProfileUpdate {
  full_name?: string | null
  username?: string | null
}

/** Update the signed-in user's profile (name / username). */
export function useUpdateProfile() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (patch: ProfileUpdate) => {
      const { data: auth } = await supabase.auth.getUser()
      const id = auth.user?.id
      if (!id) throw new Error('Not authenticated')

      // Keep the legacy display_name in sync with full_name for older reads.
      const row: Record<string, unknown> = { ...patch }
      if (patch.full_name !== undefined) row.display_name = patch.full_name

      const { data, error } = await supabase
        .from('profiles')
        .update(row)
        .eq('id', id)
        .select('*')
        .single()
      if (error) {
        if (error.code === '23505') throw new UsernameTakenError() // unique_violation
        throw error
      }
      return data as Profile
    },
    onSuccess: (profile) => {
      qc.setQueryData(qk.profile, profile)
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: qk.profile })
    },
    // SettingsPage renders its own inline error (incl. the username-taken case),
    // so suppress the global mutation-error toast for this one.
    meta: { skipErrorToast: true },
  })
}
