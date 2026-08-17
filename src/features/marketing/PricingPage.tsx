import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { Check, ChevronDown, Info, Sparkles } from 'lucide-react'
import { Badge, Button, Card, CardContent } from '@/components/ui'
import { cn } from '@/lib/utils'
import { useAuth } from '@/features/auth/auth-context'
import { SiteHeader } from './components/SiteHeader'
import { MarketingFooter } from './components/MarketingFooter'
import { UpgradeIntentModal } from './components/UpgradeIntentModal'
import { ALL_IN_ONE_CATEGORIES, PLANS, PRICING_DISCLAIMER, type Plan } from './plans'
import { PRO_PRICE_COPY, usd } from './pricing'
import { FAQ } from './faq'

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
 * exist, that WE ARE ACTUALLY GOING TO SHIP, and each has to name the real
 * blocker rather than say "soon".
 *
 * The second clause is new and it is the one that does the work. A list of
 * everything absent is not honesty, it is a wish-list with citations: the
 * reader cannot tell a commitment from a maybe. Two entries were removed
 * rather than reworded. AI (a coach, and review of your journal) is CANCELLED
 * as a product decision, not deferred, so it has no place on a page about what
 * is coming. Image vision boards were described as "a deliberate wait", which
 * is a fair description of a maybe and not something to promise anyone.
 */
const NOT_BUILT: { what: string; why: string }[] = [
  {
    // SPLIT when the noise tracks shipped. Sleep sounds is no longer on this
    // list at all: white, pink and brown noise are generated on the device, so
    // there was never a file to license. What is still missing is the recorded
    // half, and saying so precisely is the point of this list.
    what: 'Recorded nature sounds, and guided meditation',
    why: 'Rain, thunder and ocean are recordings, and the meditation sessions have to be spoken and recorded. None of that is licensed yet, and we would rather ship silence than something we do not have the rights to. The generated noise tracks work today.',
  },
  {
    what: 'Referral rewards & discount codes',
    why: 'Real discounts need billing switched on properly first. Until then there is a plain share link that actually works.',
  },
  {
    what: 'Shared workspaces & team capacity',
    why: 'The groundwork is done, but the screens for sharing and inviting people are not built yet. That is the Team plan above.',
  },
]

/** Small numbers read as words in a sentence. Counted, never typed: this line
 *  said "five" while the list below it had three entries. */
function countWord(n: number): string {
  return ['no', 'one', 'two', 'three', 'four', 'five'][n] ?? String(n)
}

/**
 * The headline amount and its period.
 *
 * `small` is now just the period. It used to be `/mo · ${plan.priceNote}`,
 * which rendered "/mo · per month, billed yearly" — the period stated twice
 * and then contradicted.
 */
function priceLabel(plan: Plan): { big: string; small: string } {
  if (plan.priceMonthly === 0) return { big: 'Free', small: plan.priceNote }
  if (plan.priceMonthly == null) return { big: 'Soon', small: plan.priceNote }
  return { big: usd(plan.priceMonthly), small: PRO_PRICE_COPY.monthlySuffix }
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

        <div className="space-y-1">
          <div className="flex items-end gap-1">
            <span className="font-display text-3xl font-bold">{big}</span>
            <span className="pb-1 text-xs text-text-muted">{small}</span>
          </div>
          {/*
            The annual alternative, rendered from derived values so it cannot
            drift from the monthly figure above it. "billed annually" is part
            of the same sentence as the per-month equivalent, never separated
            from it: "$4/month" on its own would be a price we do not offer.
          */}
          {plan.yearly && (
            <p className="text-xs text-text-muted">
              or{' '}
              <span className="font-medium text-text-primary/90">
                {usd(plan.yearly.totalUsd)}
                {PRO_PRICE_COPY.yearlySuffix}
              </span>{' '}
              · {usd(plan.yearly.perMonthUsd)}/month billed annually, save{' '}
              {plan.yearly.savingPercent}%
            </p>
          )}
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
      <SiteHeader />

      <main className="flex-1">
        <section className="mx-auto max-w-6xl px-4 pt-16 text-center sm:px-6">
          <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
            Simple, honest pricing
          </h1>
          <p className="mx-auto mt-3 max-w-xl text-text-muted">
            Planning your day is free: the capacity meter, the overbooking warning, “Plan my day”,
            focus and roll-over included. Pro adds the week ahead and the record of how your days actually
            went.
          </p>
          {/* The same all-in-one framing as the landing, in the same terms:
              CATEGORIES, never brand names, and no "replaces N apps". The list
              is deliberately identical to OnePlaceStrip's — two surfaces saying
              slightly different things is how a claim stops being checkable. */}
          <ul className="mx-auto mt-6 flex max-w-2xl flex-wrap justify-center gap-2">
            {ALL_IN_ONE_CATEGORIES.map((c) => (
              <li
                key={c}
                className="rounded-full border border-white/10 bg-surface-2/50 px-3 py-1 text-xs text-text-muted"
              >
                {c}
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-text-muted/80">
            One app instead of several. One price, not one per category.
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
              Free is not a trial. The capacity meter, the overbooking warning,{' '}
              <strong className="text-text-primary">Plan my day</strong>, focus sessions with
              Pomodoro, roll-over and recurring tasks are all free, permanently. That is everything you need to
              plan and finish a day.
            </p>
            <p className="mt-4 text-text-muted">
              <strong className="text-text-primary">Pro</strong> adds what comes next: the whole week
              on one board, each day with its own capacity meter, a morning briefing with your day
              already planned, live calendar sync, and Insights that compare what you planned with
              what you actually did. Planning your day is free. The week ahead, and the look back,
              are paid.
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
            {/* COUNTED FROM THE LIST, not typed. It said "five" while the list
                below had three entries, so the first thing a reader did was
                count and find the page wrong. */}
            Everything else on this page works today. These {countWord(NOT_BUILT.length)}{' '}
            don&rsquo;t, and here&rsquo;s the actual reason for each, rather than
            &ldquo;coming soon&rdquo;.
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
              Back to home
            </Link>
          </div>
        </section>

        {/*
          THE CANONICAL FAQ.

          It used to live only on the homepage, where five open questions cost
          real length this far down a long page, and where two of the answers
          were the only copy on the public site that carried them. Moving the
          full set here — rather than deleting two of them — is what made
          trimming the homepage to three a compression instead of a deletion.
          Both surfaces render from `./faq.ts`, so they cannot drift apart.

          `#faq` is the anchor the homepage links to.
        */}
        <section
          id="faq"
          className="mx-auto max-w-3xl scroll-mt-24 px-4 pb-16 sm:px-6"
          aria-labelledby="pricing-faq-heading"
        >
          <h2 id="pricing-faq-heading" className="font-display text-xl font-bold">
            Questions, answered
          </h2>
          <div className="mt-6 divide-y divide-white/5 border-y border-white/5">
            {FAQ.map((item) => (
              <details key={item.q} className="group">
                <summary className="focus-ring flex min-h-[56px] cursor-pointer list-none items-center gap-3 py-4 text-left font-display text-base font-semibold text-text-primary marker:content-['']">
                  <span className="flex-1">{item.q}</span>
                  <ChevronDown
                    aria-hidden
                    className="h-4 w-4 shrink-0 text-text-muted transition-transform duration-200 group-open:rotate-180"
                  />
                </summary>
                <p className="pb-5 pr-7 text-sm leading-relaxed text-text-muted">{item.a}</p>
              </details>
            ))}
          </div>
        </section>
      </main>

      <MarketingFooter />

      <UpgradeIntentModal plan={intentPlan} source="pricing" onClose={() => setIntentPlan(null)} />
    </div>
  )
}
