import { useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase, isSupabaseConfigured } from '@/lib/supabase'
import { setAnalyticsUser, trackDayReturnedOncePerDay } from '@/features/analytics/track'
import { AuthContext, type AuthContextValue } from './auth-context'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Without keys we cannot talk to Supabase — render unauthenticated state
    // so the login screen (with setup guidance) can appear.
    if (!isSupabaseConfigured) {
      setLoading(false)
      return
    }

    let active = true
    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (active) setSession(data.session)
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    const { data: listener } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next)
    })

    return () => {
      active = false
      listener.subscription.unsubscribe()
    }
  }, [])

  // Keep the analytics user id in sync and record the first session of each day.
  // trackDayReturnedOncePerDay dedupes per local day, so token refreshes are no-ops.
  useEffect(() => {
    const userId = session?.user?.id ?? null
    setAnalyticsUser(userId)
    if (userId) trackDayReturnedOncePerDay()
  }, [session])

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      user: session?.user ?? null,
      loading,
      isConfigured: isSupabaseConfigured,
      signOut: async () => {
        await supabase.auth.signOut()
      },
    }),
    [session, loading],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
