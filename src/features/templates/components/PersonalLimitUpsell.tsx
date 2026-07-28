import { Link } from 'react-router-dom'
import { Sparkles } from 'lucide-react'
import { useAuth } from '@/features/auth/auth-context'
import { captureUpgradeIntent } from '@/features/marketing/api/upgradeIntents'

/**
 * Shown when a Free user is at the personal-template limit and tries to create
 * another. A card in the flow — not a modal, no countdown, no fake scarcity.
 *
 * Crucially it appears at CREATION only: every template already saved keeps
 * working and applying forever, so nothing a user made is ever held hostage.
 */
export function PersonalLimitUpsell({ limit }: { limit: number }) {
  const { user } = useAuth()

  function recordIntent() {
    void captureUpgradeIntent({
      tier: 'pro',
      userId: user?.id ?? null,
      email: user?.email ?? null,
      source: 'personal_templates_limit',
    }).catch(() => {
      /* signal only — never block the click */
    })
  }

  return (
    <div
      role="note"
      aria-label="Personal template limit reached"
      className="rounded-2xl border border-brand/25 bg-brand-gradient-soft p-4"
    >
      <div className="flex items-start gap-3">
        <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-surface-2 text-brand">
          <Sparkles className="h-4 w-4" aria-hidden />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-medium text-text-primary">
            Your template library — Pro keeps it unlimited
          </p>
          <p className="mt-1 text-xs leading-relaxed text-text-muted">
            Free includes {limit} personal templates, and you’re using all {limit}. The ones you’ve
            saved keep working exactly as they are — this only limits creating new ones.{' '}
            <Link
              to="/settings/plan"
              onClick={recordIntent}
              className="focus-ring rounded text-accent underline-offset-4 hover:underline"
            >
              Upgrade
            </Link>{' '}
            for as many as you like.
          </p>
        </div>
      </div>
    </div>
  )
}
