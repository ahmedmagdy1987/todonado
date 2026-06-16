import { useAuth } from '@/features/auth/auth-context'
import { readPlanOverride, resolvePlan, type Plan } from './plan'

/**
 * The current user's effective plan. Today this is derived from the founding
 * email allowlist (plus a local preview override); swap `resolvePlan` for a
 * real subscription lookup when billing ships and every gate updates with it.
 */
export function usePlan(): { plan: Plan; isPro: boolean } {
  const { user } = useAuth()
  const plan = resolvePlan(user?.email ?? null, readPlanOverride())
  return { plan, isPro: plan === 'pro' }
}
