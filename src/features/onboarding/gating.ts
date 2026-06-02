import type { Profile } from '@/types/database'

/**
 * First-run onboarding shows only when the loaded profile has not completed it.
 * Null/undefined (still loading) => don't show, so the flow never flashes before
 * the profile resolves.
 */
export function shouldShowOnboarding(profile: Profile | null | undefined): boolean {
  return !!profile && !profile.onboarding_completed
}
