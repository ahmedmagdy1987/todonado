import { Link } from 'react-router-dom'
import { ArrowRight, Check } from 'lucide-react'
import { Badge, Button, Card, CardContent } from '@/components/ui'
import { cn } from '@/lib/utils'
import { Reveal } from '../demo/Reveal'
import { SECTION_RHYTHM } from '../sectionRhythm'
import { PLANS, PRICING_DISCLAIMER } from '../plans'

/** Free + Pro only — the Team tier lives on the full pricing page. */
const TEASER_IDS = ['free', 'pro'] as const

/**
 * How many bullets to show before deferring to /pricing. Seven keeps the whole
 * Free list plus every differentiating Pro line (history limit, live calendar
 * sync, Insights); only Pro's closing "Everything in Free" summary is deferred.
 */
const BULLET_LIMIT = 7

interface PricingTeaserProps {
  onStartFree: () => void
  ctaLabel: string
}

export function PricingTeaser({ onStartFree, ctaLabel }: PricingTeaserProps) {
  const plans = TEASER_IDS.map((id) => PLANS.find((p) => p.id === id)).filter(
    (p): p is NonNullable<typeof p> => p != null,
  )

  return (
    <section className={cn(SECTION_RHYTHM, 'max-w-5xl')} aria-labelledby="pricing-teaser">
      <Reveal className="mx-auto max-w-2xl text-center">
        <h2 id="pricing-teaser" className="font-display text-2xl font-bold sm:text-3xl">
          Free to start. Pro when the day matters.
        </h2>
        <p className="mt-3 text-text-muted">{PRICING_DISCLAIMER}</p>
      </Reveal>

      <div className="mt-10 grid items-stretch gap-4 sm:grid-cols-2">
        {plans.map((plan, i) => (
          <Reveal key={plan.id} delay={i * 90} className="h-full">
            <Card
              className={cn(
                'flex h-full flex-col',
                plan.featured && 'ring-2 ring-brand shadow-brand-glow',
              )}
            >
              <CardContent className="flex h-full flex-col gap-5">
                <div className="flex items-center gap-2">
                  <h3 className="font-display text-lg font-semibold">{plan.name}</h3>
                  {plan.featured && <Badge variant="brand">Most popular</Badge>}
                </div>

                <div className="flex items-end gap-1">
                  <span className="font-display text-3xl font-bold">
                    {plan.priceMonthly === 0 ? 'Free' : `$${plan.priceMonthly}`}
                  </span>
                  <span className="pb-1.5 text-xs text-text-muted">
                    {plan.priceMonthly === 0 ? plan.priceNote : `/mo · ${plan.priceNote}`}
                  </span>
                </div>

                <ul className="flex-1 space-y-2.5">
                  {plan.features.slice(0, BULLET_LIMIT).map((f) => (
                    <li key={f} className="flex items-start gap-2 text-sm">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden />
                      <span className="text-text-primary/90">{f}</span>
                    </li>
                  ))}
                </ul>

                {plan.id === 'free' ? (
                  <Button variant="outline" className="w-full" onClick={onStartFree}>
                    {ctaLabel}
                  </Button>
                ) : (
                  <Link to="/pricing" className="w-full">
                    <Button className="w-full">
                      See what Pro includes
                      <ArrowRight className="h-4 w-4" aria-hidden />
                    </Button>
                  </Link>
                )}
              </CardContent>
            </Card>
          </Reveal>
        ))}
      </div>

      <Reveal className="mt-8 text-center">
        <Link
          to="/pricing"
          className="focus-ring inline-flex min-h-[44px] items-center rounded px-3 text-sm text-text-muted underline-offset-4 transition-colors hover:text-text-primary hover:underline"
        >
          Compare all plans
        </Link>
      </Reveal>
    </section>
  )
}
