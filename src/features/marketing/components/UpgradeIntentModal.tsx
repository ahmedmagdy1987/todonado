import { useState, type FormEvent } from 'react'
import { CheckCircle2, Sparkles } from 'lucide-react'
import { Button, Input, Modal } from '@/components/ui'
import { useAuth } from '@/features/auth/auth-context'
import { captureUpgradeIntent, isValidEmail } from '../api/upgradeIntents'
import type { Plan } from '../plans'

interface UpgradeIntentModalProps {
  /** The paid plan whose CTA was clicked; null closes the modal. */
  plan: Plan | null
  source: string
  onClose: () => void
}

/**
 * Fake-door: clicking a paid plan opens this, captures an optional email, and
 * records the intent. NO billing is wired — it measures willingness-to-pay.
 */
export function UpgradeIntentModal({ plan, source, onClose }: UpgradeIntentModalProps) {
  const { user } = useAuth()
  const [email, setEmail] = useState(user?.email ?? '')
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Only paid plans open the fake-door (free goes straight to signup).
  if (!plan || plan.id === 'free') return null
  const tier = plan.id

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const trimmed = email.trim()
    if (!isValidEmail(trimmed)) {
      setError('Enter a valid email so we can reach you.')
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      await captureUpgradeIntent({ tier, userId: user?.id ?? null, email: trimmed, source })
      setDone(true)
    } catch {
      setError('Something went wrong — please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal open onClose={onClose} title={done ? undefined : `Be first to get ${plan.name}`}>
      {done ? (
        <div className="flex flex-col items-center gap-4 px-6 py-10 text-center">
          <CheckCircle2 className="h-12 w-12 text-success" aria-hidden />
          <div>
            <h3 className="font-display text-xl font-semibold">You’re on the list.</h3>
            <p className="mt-1 text-sm text-text-muted">
              We’ll email you the moment {plan.name} opens — thanks for helping shape it.
            </p>
          </div>
          <Button onClick={onClose} className="mt-1">
            Back to planning
          </Button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="flex flex-col gap-4 p-6">
          <p className="flex items-start gap-2 text-sm text-text-muted">
            <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-brand" aria-hidden />
            <span>
              {plan.name} isn’t live yet and nothing is charged. Leave your email and we’ll notify
              you at launch — your interest helps us decide it’s worth building.
            </span>
          </p>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-text-muted">Email</span>
            <Input
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoFocus={!user}
              required
            />
          </label>
          {error && <p className="text-xs text-danger">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>
              Maybe later
            </Button>
            <Button type="submit" loading={submitting}>
              Notify me at launch
            </Button>
          </div>
        </form>
      )}
    </Modal>
  )
}
