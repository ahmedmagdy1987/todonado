import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, Check, Crown, Sparkles } from 'lucide-react'
import { Badge, Button, Card } from '@/components/ui'
import { usePlan } from '@/features/billing/usePlan'
import { PLANS } from '@/features/marketing/plans'
import { UpgradeIntentModal } from '@/features/marketing/components/UpgradeIntentModal'

const PRO_PLAN = PLANS.find((p) => p.id === 'pro') ?? null
const PRO_FEATURES = PRO_PLAN?.features ?? []

export function PlanPage() {
  const { isPro, isFounding } = usePlan()
  const [open, setOpen] = useState(false)

  const label = isFounding ? 'Founding' : isPro ? 'Pro' : 'Free'
  const blurb = isFounding
    ? 'You have full access as a founding member — thank you for being here early.'
    : isPro
      ? 'You have full access to Insights and every Pro feature.'
      : 'You are on the Free plan. Everything you need to plan and run your day is included.'

  return (
    <div className="animate-fade-in space-y-6">
      <header className="flex items-center gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-brand-gradient-soft text-brand">
          <Crown className="h-5 w-5" aria-hidden />
        </span>
        <div className="min-w-0">
          <h2 className="font-display text-xl font-semibold">My Plan</h2>
          <p className="text-sm text-text-muted">Your current plan and what it includes.</p>
        </div>
      </header>

      <Card className="p-6">
        <div className="flex items-center gap-3">
          <h3 className="font-display text-lg font-semibold">Current plan</h3>
          <Badge variant={isPro ? 'brand' : 'outline'}>{label}</Badge>
        </div>
        <p className="mt-2 text-sm text-text-muted">{blurb}</p>

        <ul className="mt-5 space-y-2.5">
          {PRO_FEATURES.map((f) => (
            <li key={f} className="flex items-start gap-2 text-sm">
              {isPro ? (
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden />
              ) : (
                <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-brand" aria-hidden />
              )}
              <span className={isPro ? 'text-text-primary/90' : 'text-text-muted'}>{f}</span>
            </li>
          ))}
        </ul>

        {!isPro && (
          <div className="mt-6">
            <Button size="lg" onClick={() => setOpen(true)}>
              Upgrade to Pro
            </Button>
            <p className="mt-2 text-xs text-text-muted">
              Nothing is charged yet — this records your interest so we can build Pro for real.
            </p>
          </div>
        )}
      </Card>

      <Link
        to="/settings"
        className="focus-ring inline-flex items-center gap-1.5 rounded text-sm text-text-muted hover:text-text-primary"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden /> Back to Settings
      </Link>

      <UpgradeIntentModal plan={open ? PRO_PLAN : null} source="my-plan" onClose={() => setOpen(false)} />
    </div>
  )
}
