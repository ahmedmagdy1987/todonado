import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { qk } from '@/lib/queryKeys'
import { useAuth } from '@/features/auth/auth-context'
import type { BillingRow } from '@/types/database'
import { isFoundingEmail, readPlanOverride, resolveEffectivePlan, type Plan } from './plan'

/**
 * The current user's effective plan. Source of truth is the `billing` row
 * (SELECT own), then the founding allowlist, then the dev-only local preview —
 * see resolveEffectivePlan for precedence.
 *
 * The billing query degrades gracefully: if the `billing` table isn't applied
 * yet (migration pending) or a transient error occurs, it returns null and the
 * app falls back to founding/preview/free — nothing breaks pre-billing. It
 * refetches on window focus (retry: false) so the plan flips shortly after a
 * successful checkout returns.
 */
export function usePlan(): {
  plan: Plan
  isPro: boolean
  isFounding: boolean
  billing: BillingRow | null
  billingLoading: boolean
  refetchBilling: () => void
} {
  const { user } = useAuth()
  const email = user?.email ?? null
  const userId = user?.id ?? ''

  const billingQuery = useQuery({
    queryKey: qk.billing(userId),
    enabled: !!userId,
    staleTime: 30_000,
    retry: false,
    refetchOnWindowFocus: true,
    queryFn: async (): Promise<BillingRow | null> => {
      const { data, error } = await supabase
        .from('billing')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle()
      // Table may not exist yet (migration pending) or a transient hiccup — treat
      // as "no billing row" so the app degrades to founding/preview/free.
      if (error) return null
      return (data as BillingRow | null) ?? null
    },
  })

  const billing = billingQuery.data ?? null
  const plan = resolveEffectivePlan({
    billingPlan: billing?.plan ?? null,
    email,
    override: readPlanOverride(),
  })
  const isPro = plan === 'pro'

  return {
    plan,
    isPro,
    // Founding only counts when the effective plan is Pro (so a founder previewing
    // Free reads as Free), AND only when it's the founding grant driving it — not a
    // paid subscription (a paying founder should read as a normal Pro subscriber).
    isFounding: isPro && billing?.plan !== 'pro' && isFoundingEmail(email),
    billing,
    billingLoading: billingQuery.isPending,
    refetchBilling: () => void billingQuery.refetch(),
  }
}
