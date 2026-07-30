import { Link } from 'react-router-dom'
import { Sparkles } from 'lucide-react'
import { useAuth } from '@/features/auth/auth-context'
import { captureUpgradeIntent } from '@/features/marketing/api/upgradeIntents'

/**
 * Shown when a Free user is at the quit-habit limit and tries to add another.
 * A card in the flow — not a modal, no countdown, no fake scarcity. Same shape
 * as PersonalLimitUpsell.
 *
 * It appears at CREATION only. The habit already being tracked keeps counting,
 * checking in and hitting milestones forever. Nothing about someone's clean
 * streak is ever held hostage, and the copy says so plainly rather than
 * implying it.
 */
export function QuitLimitUpsell({ limit }: { limit: number }) {
  const { user } = useAuth()

  function recordIntent() {
    void captureUpgradeIntent({
      tier: 'pro',
      userId: user?.id ?? null,
      email: user?.email ?? null,
      source: 'quit_habits_limit',
    }).catch(() => {
      /* signal only — never block the click */
    })
  }

  return (
    <div
      role="note"
      aria-label="Quit habit limit reached"
      className="rounded-2xl border border-brand/25 bg-brand-gradient-soft p-4"
    >
      <div className="flex items-start gap-3">
        <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-surface-2 text-brand">
          <Sparkles className="h-4 w-4" aria-hidden />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-medium text-text-primary">
            Tracking more than one — Pro keeps it unlimited
          </p>
          <p className="mt-1 text-xs leading-relaxed text-text-muted">
            Free tracks {limit === 1 ? 'one habit' : `${limit} habits`} at a time, and{' '}
            {limit === 1 ? "yours is already running" : "yours are already running"}. Your streak,
            check-ins and milestones keep going exactly as they are — this only limits adding
            another.{' '}
            <Link
              to="/settings/plan"
              onClick={recordIntent}
              className="focus-ring rounded text-accent underline-offset-4 hover:underline"
            >
              Upgrade
            </Link>{' '}
            to track as many as you need.
          </p>
        </div>
      </div>
    </div>
  )
}
