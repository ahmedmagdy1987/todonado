import { useState } from 'react'
import { CalendarClock, CheckCircle2, Gauge, Lock, Sparkles, Timer } from 'lucide-react'
import { Button, Card } from '@/components/ui'
import { PLANS } from '@/features/marketing/plans'
import { UpgradeIntentModal } from '@/features/marketing/components/UpgradeIntentModal'
import { InsightBarChart, type BarPoint } from './InsightBarChart'
import { StatTile } from './StatTile'

const PRO_PLAN = PLANS.find((p) => p.id === 'pro') ?? null

// Representative (clearly-a-preview) data behind the blur, so even brand-new
// free users see a rich teaser rather than empty charts. Not the user's data.
const PLANNED = [240, 300, 180, 360, 420, 300, 270, 330, 390, 300, 360, 300, 330, 270]
const COMPLETED = [210, 260, 170, 300, 300, 270, 230, 300, 330, 270, 300, 260, 300, 240]
const effortSample: BarPoint[] = PLANNED.map((p, i) => ({
  label: '',
  primary: p,
  secondary: COMPLETED[i],
  tone: 'brand',
}))
const capacitySample: BarPoint[] = PLANNED.map((p) => {
  const pct = Math.round((p / 360) * 100)
  return { label: '', primary: pct, tone: pct > 100 ? 'danger' : pct >= 80 ? 'warning' : 'success' }
})

const FEATURES = [
  'Planned vs completed effort trends',
  'Daily capacity & overcommitment patterns',
  'Focus analytics: sessions, time, interruptions, completion',
  'Roll-over & overdue patterns',
]

/** Free-tier view: a blurred preview of the real dashboard plus the existing
 *  fake-door upgrade CTA. Pro/founding accounts get the full dashboard. */
export function InsightsTeaser() {
  const [open, setOpen] = useState(false)

  return (
    <div className="relative">
      {/* Blurred preview of the real thing */}
      <div className="pointer-events-none select-none space-y-6 blur-[3px] opacity-50" aria-hidden>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatTile icon={CalendarClock} label="Planned" value="32h 30m" />
          <StatTile icon={CheckCircle2} label="Completed" value="26h 10m" sub="41 tasks done" />
          <StatTile icon={Timer} label="Focus time" value="11h 45m" />
          <StatTile icon={Gauge} label="Avg capacity" value="92%" sub="3/12 days over" />
        </div>
        <Card className="p-5">
          <h3 className="mb-4 font-display text-base font-semibold">Planned vs completed effort</h3>
          <InsightBarChart points={effortSample} ariaLabel="Sample effort chart" />
        </Card>
        <Card className="p-5">
          <h3 className="mb-4 font-display text-base font-semibold">Daily capacity</h3>
          <InsightBarChart points={capacitySample} max={130} reference={100} ariaLabel="Sample capacity chart" />
        </Card>
      </div>

      {/* Upgrade overlay */}
      <div className="absolute inset-0 flex items-start justify-center p-4 pt-10 sm:items-center sm:pt-4">
        <Card className="w-full max-w-md p-6 text-center shadow-elevation-lg">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-gradient-soft text-brand">
            <Lock className="h-5 w-5" aria-hidden />
          </span>
          <h3 className="mt-4 font-display text-xl font-bold">Insights is a Pro feature</h3>
          <p className="mt-2 text-sm text-text-muted">
            See where your time and effort actually go, so you can plan a more honest day.
          </p>
          <ul className="mx-auto mt-4 max-w-xs space-y-2 text-left">
            {FEATURES.map((f) => (
              <li key={f} className="flex items-start gap-2 text-sm text-text-primary/90">
                <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-brand" aria-hidden />
                <span>{f}</span>
              </li>
            ))}
          </ul>
          <Button size="lg" className="mt-6 w-full" onClick={() => setOpen(true)}>
            Upgrade to Pro
          </Button>
          <p className="mt-3 text-xs text-text-muted">
            Your daily planning, tasks, projects, and focus stay free.
          </p>
        </Card>
      </div>

      <UpgradeIntentModal
        plan={open ? PRO_PLAN : null}
        source="insights"
        onClose={() => setOpen(false)}
      />
    </div>
  )
}
