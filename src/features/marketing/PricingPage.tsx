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

/**
 * NOT BUILT — and each line says WHY.
 *
 * This replaced a "roadmap" that listed three things, two of which had already
 * shipped: deeper Insights (estimation accuracy and the weekly review are live)
 * and calendar import (live, with .ics on Free and URL sync on Pro). Promising
 * something a user can already use is a small lie that makes every other claim
 * on the page worth less.
 *
 * The rule for this list: it may only contain things that genuinely do not
 * exist, and each has to name the real blocker rather than say "soon".
 */
const NOT_BUILT: { what: string; why: string }[] = [
  {
    what: 'Sleep sounds & guided meditation',
    why: 'The players are built. No audio is licensed yet, and we would rather ship silence than something we do not have the rights to.',
  },
  {
    // CORRECTED when the journal shipped. This used to say "an AI coach and a
    // voice journal", which stopped being true the day voice notes landed —
    // exactly the drift this whole list exists to prevent. The journal is real;
    // the layer that READS it back is what does not exist.
    what: 'An AI coach, and AI review of your journal',
    why: 'The journal itself ships — write it or say it. Reading a fortnight back and naming the pattern would need an AI provider this app is not wired to, so there is no summary rather than a made-up one.',
  },
  {
    what: 'Referral rewards & discount codes',
    why: 'Real discounts need billing switched on properly first. Until then there is a plain share link that actually works.',
  },
  {
    what: 'Image vision boards',
    why: 'Pictures need storage, upload limits and a bill. The Vision page ships text-first while we find out whether the images are wanted.',
  },
  {
    what: 'Shared workspaces & team capacity',
    why: 'The data model is collaboration-ready, but none of the sharing UI exists. That is the Team plan below.',
  },
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
            The day is free — the capacity meter, the overbooking guard, auto-planning, focus and
            roll-over included. Pro adds the week ahead and the record of how your days actually
            went.
          </p>
          {/* The same all-in-one framing as the landing, in the same terms:
              CATEGORIES, never brand names, and no "replaces N apps". The list
              is deliberately identical to OnePlaceStrip's — two surfaces saying
              slightly different things is how a claim stops being checkable. */}
          <ul className="mx-auto mt-6 flex max-w-2xl flex-wrap justify-center gap-2">
            {['A day planner', 'A focus & pomodoro timer', 'A habit & quit tracker', 'A breathing coach'].map(
              (c) => (
                <li
                  key={c}
                  className="rounded-full border border-white/10 bg-surface-2/50 px-3 py-1 text-xs text-text-muted"
                >
                  {c}
                </li>
              ),
            )}
          </ul>
          <p className="mt-3 text-xs text-text-muted/80">
            One app instead of several — and one price, not one per category.
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
              Free is not a trial. The capacity meter, the overbooking guard,{' '}
              <strong className="text-text-primary">Plan my day</strong>, focus sessions with
              Pomodoro, roll-over and recurring tasks are all free, permanently — that is the daily
              loop, complete.
            </p>
            <p className="mt-4 text-text-muted">
              <strong className="text-text-primary">Pro</strong> is what comes after a good day: the
              whole week on one board with its own capacity per day, a briefing that arrives already
              planned, live calendar sync, and Insights that show planned-vs-actual and how accurate
              your estimates are getting. The day is free; the week and the retrospective are paid.
            </p>
          </div>
        </section>

        {/* Vision / roadmap */}
        <section className="mx-auto max-w-3xl px-4 py-14 sm:px-6">
          <div className="mb-6 flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-brand" aria-hidden />
            <h2 className="font-display text-xl font-bold">What isn&rsquo;t built yet</h2>
          </div>
          <p className="mb-6 text-sm text-text-muted">
            Everything else on this page works today. These five don&rsquo;t — and here&rsquo;s the
            actual reason for each, rather than &ldquo;coming soon&rdquo;.
          </p>
          <ul className="space-y-4">
            {NOT_BUILT.map((item) => (
              <li key={item.what} className="flex items-start gap-3">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand" aria-hidden />
                <div>
                  <p className="text-sm font-medium text-text-primary">{item.what}</p>
                  <p className="mt-0.5 text-sm text-text-muted">{item.why}</p>
                </div>
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
