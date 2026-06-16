import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { Check, Info, Sparkles } from 'lucide-react'
import { Badge, Button, Card, CardContent } from '@/components/ui'
import { cn } from '@/lib/utils'
import { useAuth } from '@/features/auth/auth-context'
import { MarketingHeader } from './components/MarketingHeader'
import { MarketingFooter } from './components/MarketingFooter'
import { UpgradeIntentModal } from './components/UpgradeIntentModal'
import { PLANS, PRICING_DISCLAIMER, type Plan } from './plans'

const ROADMAP = [
  'Deeper Insights: estimation accuracy & weekly planned-vs-actual trends',
  'One-way calendar import: subtract real meetings from your daily capacity',
  'Shared workspaces & team capacity (Team plan)',
]

function priceLabel(plan: Plan): { big: string; small: string } {
  if (plan.priceMonthly === 0) return { big: 'Free', small: plan.priceNote }
  if (plan.priceMonthly == null) return { big: 'Soon', small: plan.priceNote }
  return { big: `$${plan.priceMonthly}`, small: `/mo · ${plan.priceNote}` }
}

interface PlanCardProps {
  plan: Plan
  onPaidCta: (plan: Plan) => void
  onFreeCta: () => void
}

function PlanCard({ plan, onPaidCta, onFreeCta }: PlanCardProps) {
  const { big, small } = priceLabel(plan)
  return (
    <Card
      className={cn(
        'flex h-full flex-col',
        plan.featured && 'ring-2 ring-brand shadow-brand-glow',
      )}
    >
      <CardContent className="flex h-full flex-col space-y-5">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h3 className="font-display text-lg font-semibold">{plan.name}</h3>
            {plan.featured && <Badge variant="brand">Most popular</Badge>}
            {plan.comingSoon && <Badge variant="outline">Coming soon</Badge>}
          </div>
          <p className="text-sm text-text-muted">{plan.tagline}</p>
        </div>

        <div className="flex items-end gap-1">
          <span className="font-display text-3xl font-bold">{big}</span>
          <span className="pb-1 text-xs text-text-muted">{small}</span>
        </div>

        <ul className="flex-1 space-y-2.5">
          {plan.features.map((f) => (
            <li key={f} className="flex items-start gap-2 text-sm">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden />
              <span className="text-text-primary/90">{f}</span>
            </li>
          ))}
        </ul>

        {plan.id === 'free' ? (
          <Button variant="outline" onClick={onFreeCta} className="w-full">
            {plan.cta}
          </Button>
        ) : (
          <Button
            variant={plan.featured ? 'primary' : 'secondary'}
            onClick={() => onPaidCta(plan)}
            className="w-full"
          >
            {plan.cta}
          </Button>
        )}
      </CardContent>
    </Card>
  )
}

export function PricingPage() {
  const { session } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [intentPlan, setIntentPlan] = useState<Plan | null>(null)

  const startFree = () =>
    session
      ? navigate('/')
      : navigate('/login', {
          state: { ...((location.state as object | null) ?? {}), mode: 'signup' },
        })

  return (
    <div className="flex min-h-screen flex-col bg-background text-text-primary">
      <MarketingHeader />

      <main className="flex-1">
        <section className="mx-auto max-w-6xl px-4 pt-16 text-center sm:px-6">
          <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
            Simple pricing for an honest day
          </h1>
          <p className="mx-auto mt-3 max-w-xl text-text-muted">
            Start free with full task management. Upgrade to Pro for the part that makes Todonado
            different: realistic-day planning that actually fits.
          </p>
          <p className="mx-auto mt-4 inline-flex max-w-xl items-start gap-2 rounded-xl border border-white/10 bg-surface-2/50 px-3 py-2 text-left text-xs text-text-muted">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent" aria-hidden />
            <span>{PRICING_DISCLAIMER}</span>
          </p>
        </section>

        <section className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
          <div className="grid items-stretch gap-4 md:grid-cols-3">
            {PLANS.map((plan) => (
              <PlanCard
                key={plan.id}
                plan={plan}
                onFreeCta={startFree}
                onPaidCta={setIntentPlan}
              />
            ))}
          </div>
        </section>

        {/* Why upgrade */}
        <section className="border-y border-white/5 bg-surface/40">
          <div className="mx-auto max-w-3xl px-4 py-14 text-center sm:px-6">
            <h2 className="font-display text-2xl font-bold">What you get with Pro</h2>
            <p className="mt-4 text-text-muted">
              Free keeps your tasks tidy. <strong className="text-text-primary">Pro</strong> is the
              daily ritual: the effort-aware capacity meter, the overbooking guard, focus sessions,
              recurring tasks, and the Insights that make your estimates sharper over time. It&rsquo;s
              the difference between a list you stare at and a day you actually finish.
            </p>
          </div>
        </section>

        {/* Vision / roadmap */}
        <section className="mx-auto max-w-3xl px-4 py-14 sm:px-6">
          <div className="mb-6 flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-brand" aria-hidden />
            <h2 className="font-display text-xl font-bold">Where Todonado is going</h2>
          </div>
          <ul className="space-y-3">
            {ROADMAP.map((item) => (
              <li key={item} className="flex items-start gap-3">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand" aria-hidden />
                <span className="text-sm text-text-muted">{item}</span>
              </li>
            ))}
          </ul>
          <div className="mt-8">
            <Button onClick={startFree}>
              {session ? 'Open your command center' : 'Start free'}
            </Button>
            <Link
              to="/welcome"
              className="focus-ring ml-3 rounded px-1 text-sm text-text-muted hover:text-text-primary"
            >
              Back to overview
            </Link>
          </div>
        </section>
      </main>

      <MarketingFooter />

      <UpgradeIntentModal plan={intentPlan} source="pricing" onClose={() => setIntentPlan(null)} />
    </div>
  )
}
