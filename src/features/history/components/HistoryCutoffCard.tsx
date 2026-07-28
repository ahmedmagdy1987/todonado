import { Link } from 'react-router-dom'
import { History } from 'lucide-react'
import { useAuth } from '@/features/auth/auth-context'
import { captureUpgradeIntent } from '@/features/marketing/api/upgradeIntents'

interface HistoryCutoffCardProps {
  /** Completed items withheld by the window. Nothing renders when this is 0. */
  hiddenCount: number
  /** Window length, for honest copy. */
  days: number
}

/**
 * The quiet end-of-history marker. Shown ONLY at the bottom of a windowed
 * history list, and ONLY when something was actually withheld — so a user in
 * their first two weeks (or any user with no older history) never sees it.
 *
 * Deliberately a calm inline card: not a modal, not a popup, no lock icons
 * sprinkled through the list, no countdown, no guilt. It states a fact and
 * offers one small link.
 *
 * The click records a willingness-to-pay signal in `upgrade_intents` with
 * `source: 'history_cutoff'` — reusing the existing fake-door table rather than
 * adding an `events` name, which would have required a migration to widen that
 * table's CHECK constraint. Fire-and-forget: a failed signal must never block
 * the navigation the user asked for.
 */
export function HistoryCutoffCard({ hiddenCount, days }: HistoryCutoffCardProps) {
  const { user } = useAuth()
  if (hiddenCount <= 0) return null

  function recordIntent() {
    void captureUpgradeIntent({
      tier: 'pro',
      userId: user?.id ?? null,
      email: user?.email ?? null,
      source: 'history_cutoff',
    }).catch(() => {
      // Signal only — never surface or block on it.
    })
  }

  return (
    <div className="rounded-2xl border border-white/5 bg-surface/60 px-5 py-4">
      <div className="flex items-start gap-3">
        <span
          className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-surface-2 text-text-muted"
          aria-hidden
        >
          <History className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-medium text-text-primary">
            Your history continues — Pro keeps it forever
          </p>
          <p className="mt-1 text-xs leading-relaxed text-text-muted">
            {hiddenCount} completed {hiddenCount === 1 ? 'task is' : 'tasks are'} older than your{' '}
            {days}-day history. {hiddenCount === 1 ? 'It is' : 'They are'} still saved — nothing has
            been deleted.{' '}
            <Link
              to="/settings/plan"
              onClick={recordIntent}
              className="focus-ring rounded text-accent underline-offset-4 hover:underline"
            >
              Upgrade
            </Link>{' '}
            to see everything.
          </p>
        </div>
      </div>
    </div>
  )
}
