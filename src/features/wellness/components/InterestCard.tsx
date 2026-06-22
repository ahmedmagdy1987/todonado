import { useState } from 'react'
import { CheckCircle2 } from 'lucide-react'
import { Badge, Button, Card, CardContent } from '@/components/ui'
import { useAuth } from '@/features/auth/auth-context'
import { captureFeatureIntent } from '../api/featureIntents'
import type { WellnessConcept } from '../concepts'

type Status = 'idle' | 'saving' | 'done' | 'error'

const STORAGE_PREFIX = 'todonado:feature-intent:'

/** Has this session already registered interest? (survives nav + remount). */
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
    // sessionStorage unavailable (e.g. private mode) — in-memory state still blocks
    // re-clicks for the life of this component instance.
  }
}

interface InterestCardProps {
  concept: WellnessConcept
  /** Where the click came from, e.g. 'wellness' or 'landing'. */
  source: string
}

/**
 * Fake-door interest card: ONE honest "Notify me" button per coming-soon concept.
 * A click records a feature_intent (signal only — nothing is built) and flips to a
 * "thanks" state. Re-clicks are disabled for the session via sessionStorage, so the
 * confirmation persists across navigation between the Wellness page and the landing
 * teaser. NO players, NO audio, NO tracking logic — just demand capture.
 */
export function InterestCard({ concept, source }: InterestCardProps) {
  const { icon: Icon, title, description, key: featureKey } = concept
  const { user } = useAuth()
  const [status, setStatus] = useState<Status>(() => (alreadyClaimed(featureKey) ? 'done' : 'idle'))

  async function notifyMe() {
    setStatus('saving')
    try {
      await captureFeatureIntent({ featureKey, userId: user?.id ?? null, source })
      markClaimed(featureKey)
      setStatus('done')
    } catch {
      setStatus('error')
    }
  }

  return (
    <Card className="h-full">
      <CardContent className="flex h-full flex-col gap-3">
        <div className="flex items-center gap-2">
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-brand-gradient-soft text-brand">
            <Icon className="h-4 w-4" aria-hidden />
          </span>
          <Badge variant="outline">Coming soon</Badge>
        </div>
        <h3 className="font-display text-base font-semibold">{title}</h3>
        <p className="text-sm text-text-muted">{description}</p>

        <div className="mt-auto pt-2">
          {status === 'done' ? (
            <p role="status" className="flex items-center gap-2 text-sm font-medium text-success">
              <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden />
              Thanks — we&rsquo;ll let you know.
            </p>
          ) : (
            <>
              <Button
                variant="secondary"
                size="sm"
                onClick={notifyMe}
                loading={status === 'saving'}
                aria-label={`Notify me about ${title}`}
              >
                Notify me
              </Button>
              {status === 'error' && (
                <p role="alert" className="mt-2 text-xs text-danger">
                  Couldn&rsquo;t save that — please try again.
                </p>
              )}
            </>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
