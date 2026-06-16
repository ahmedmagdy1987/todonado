import { useAuth } from '@/features/auth/auth-context'
import { isFoundingEmail, readPlanOverride, resolvePlan, type Plan } from './plan'

/**
 * The current user's effective plan. Today this is derived from the founding
 * email allowlist (plus a local preview override); swap `resolvePlan` for a
 * real subscription lookup when billing ships and every gate updates with it.
 *
 * `isFounding` distinguishes a founding/owner account (a permanent Pro grant)
 * from a regular Pro subscriber, so "My Plan" can label it.
 */
export function usePlan(): { plan: Plan; isPro: boolean; isFounding: boolean } {
  const { user } = useAuth()
  const email = user?.email ?? null
  const plan = resolvePlan(email, readPlanOverride())
  const isPro = plan === 'pro'
  // Founding only counts when the EFFECTIVE plan is Pro, so a founder previewing
  // the Free experience (override) reads as Free everywhere — no "Founding" badge
  // alongside an Upgrade CTA.
  return { plan, isPro, isFounding: isPro && isFoundingEmail(email) }
}
