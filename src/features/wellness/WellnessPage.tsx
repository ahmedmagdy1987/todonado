import { HeartPulse } from 'lucide-react'
import { WELLNESS_MODULES } from './modules'
import { ModuleCard } from './components/ModuleCard'

/**
 * "Focus & Calm" hub — the in-app entry point for the wellness suite. Each
 * module renders as a live card (linking to its real page) or, until built, the
 * insert-only fake-door "Notify me" card. Gated by FEATURES.wellness.
 */
export function WellnessPage() {
  return (
    <div className="animate-fade-in space-y-8">
      <header className="flex items-center gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-brand-gradient-soft text-brand">
          <HeartPulse className="h-5 w-5" aria-hidden />
        </span>
        <div className="min-w-0">
          <h2 className="font-display text-xl font-semibold">Focus &amp; Calm</h2>
          <p className="text-sm text-text-muted">
            A calmer, wellness-minded side to Todonado. Open what&rsquo;s ready, and tell us what
            you&rsquo;d want next.
          </p>
        </div>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {WELLNESS_MODULES.map((m) => (
          <ModuleCard key={m.id} module={m} />
        ))}
      </div>
    </div>
  )
}
