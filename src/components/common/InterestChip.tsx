import { useState } from 'react'
import { Check, Plus } from 'lucide-react'
import { useAuth } from '@/features/auth/auth-context'
import { captureFeatureIntent } from '@/features/wellness/api/featureIntents'
import { cn } from '@/lib/utils'
import type { FeatureKey } from '@/types/database'

type Status = 'idle' | 'saving' | 'done' | 'error'

const STORAGE_PREFIX = 'todonado:feature-intent:'

function alreadyClaimed(key: string): boolean {
  try {
    return sessionStorage.getItem(STORAGE_PREFIX + key) === '1'
  } catch {
    return false
  }
}

function markClaimed(key: string): void {
  try {
    sessionStorage.setItem(STORAGE_PREFIX + key, '1')
  } catch {
    // sessionStorage unavailable (private mode) — in-memory state still blocks
  }
}

/**
 * A one-line fake door: an inline chip for a feature that is deliberately NOT
 * built, sitting next to the part of the app that IS. The card version
 * (`wellness/components/InterestCard`) is for a whole coming-soon concept; this
 * is for "and also, would you want X?" beside a shipped feature.
 *
 * IT NEVER LIES. A failed insert shows a failure, not a thank-you — the same
 * rule InterestCard follows. The CHECK that gates these keys is applied now, so
 * the failure path should be rare; it stays because the alternative is a UI that
 * claims a vote was counted when the database refused it, and because the next
 * new key will be one migration behind the code again.
 *
 * It shares InterestCard's sessionStorage key namespace on purpose, so a user
 * who registered interest on one surface isn't asked again on another.
 */
export function InterestChip({
  featureKey,
  source,
  label,
  doneLabel = 'Noted — thanks',
  className,
}: {
  featureKey: FeatureKey
  /** Where the click came from, e.g. 'vision' or 'settings'. */
  source: string
  label: string
  doneLabel?: string
  className?: string
}) {
  const { user } = useAuth()
  const [status, setStatus] = useState<Status>(() => (alreadyClaimed(featureKey) ? 'done' : 'idle'))

  async function register() {
    setStatus('saving')
    try {
      await captureFeatureIntent({ featureKey, userId: user?.id ?? null, source })
      markClaimed(featureKey)
      setStatus('done')
    } catch {
      setStatus('error')
    }
  }

  if (status === 'done') {
    return (
      <span
        className={cn(
          'inline-flex items-center gap-1.5 rounded-full bg-success/10 px-3 py-1.5 text-xs font-medium text-success',
          className,
        )}
      >
        <Check className="h-3.5 w-3.5" aria-hidden />
        {doneLabel}
      </span>
    )
  }

  return (
    <span className={cn('inline-flex flex-wrap items-center gap-2', className)}>
      <button
        type="button"
        onClick={register}
        disabled={status === 'saving'}
        className="focus-ring inline-flex min-h-[44px] items-center gap-1.5 rounded-full border border-white/10 px-3 py-1.5 text-xs font-medium text-text-muted transition-colors hover:bg-surface-2/60 hover:text-text-primary disabled:opacity-60 md-fine:min-h-0"
      >
        <Plus className="h-3.5 w-3.5" aria-hidden />
        {status === 'saving' ? 'Saving…' : label}
      </button>
      {status === 'error' && (
        <span className="text-xs text-text-muted">
          Couldn&rsquo;t record that just now — no harm done.
        </span>
      )}
    </span>
  )
}
