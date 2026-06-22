import { HeartPulse } from 'lucide-react'
import { Badge } from '@/components/ui'
import { FocusCalmCards } from './components/FocusCalmCards'

/**
 * "Focus & Calm" — an in-app fake-door for the wellness / self-help angle.
 * Shows three coming-soon concepts, each with one honest "Notify me" button that
 * records interest. NOTHING here is built — no meditation, sleep audio, or
 * supplement logic. It exists only to measure demand before we commit to it.
 */
export function WellnessPage() {
  return (
    <div className="animate-fade-in space-y-8">
      <header className="flex items-center gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-brand-gradient-soft text-brand">
          <HeartPulse className="h-5 w-5" aria-hidden />
        </span>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="font-display text-xl font-semibold">Focus &amp; Calm</h2>
            <Badge variant="outline">Coming soon</Badge>
          </div>
          <p className="text-sm text-text-muted">
            A calmer, wellness-minded side to Todonado we&rsquo;re exploring. None of these are
            built yet — tap <span className="text-text-primary">Notify me</span> on anything
            you&rsquo;d want and we&rsquo;ll reach out if we ship it.
          </p>
        </div>
      </header>

      <FocusCalmCards source="wellness" />
    </div>
  )
}
