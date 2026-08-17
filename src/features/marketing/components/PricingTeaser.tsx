import { Link } from 'react-router-dom'
import { ArrowRight, Check } from 'lucide-react'
import { Badge, Button, Card, CardContent } from '@/components/ui'
import { cn } from '@/lib/utils'
import { Reveal } from '../demo/Reveal'
import { SECTION_RHYTHM } from '../sectionRhythm'
import { PLANS, PRICING_DISCLAIMER } from '../plans'
import { PRO_PRICE_COPY, usd } from '../pricing'

/** Free + Pro only — the Team tier lives on the full pricing page. */
const TEASER_IDS = ['free', 'pro'] as const

/**
 * How many bullets to show before deferring to /pricing.
 *
 * Was eight, which showed the whole Free list. Six on a teaser whose job is to
 * get the reader to /pricing, because sixteen bullets between the reader and
 * the closing ask is a specification sheet, not a teaser, and the two strongest
 * lines in each column do the deciding. "Compare all plans" sits directly
 * underneath and the full lists are one click away, unchanged.
 */
/*
 * THREE, NOT SIX, BECAUSE THE FULL TABLE IS NOW DIRECTLY ABOVE THIS.
 *
 * V3 added a complete Free-vs-Pro table one section up, so twelve more bullets
 * here were the same information a second time, immediately after the reader
 * had finished reading it. A price card still needs enough substance not to
 * look empty, so it keeps the three strongest true lines; deciding WHAT you get
 * is the table's job, and deciding whether to pay for it is this one's.
 */
const BULLET_LIMIT = 3

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
          Free for every day. Pro when you want the whole week.
        </h2>
        <p className="mt-3 text-text-muted">{PRICING_DISCLAIMER}</p>
      </Reveal>

      <div className="mt-8 grid items-stretch gap-4 sm:mt-10 sm:grid-cols-2">
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

                <div className="space-y-1">
                  <div className="flex items-end gap-1">
                    <span className="font-display text-3xl font-bold">
                      {plan.priceMonthly === 0 ? 'Free' : usd(plan.priceMonthly ?? 0)}
                    </span>
                    <span className="pb-1.5 text-xs text-text-muted">
                      {plan.priceMonthly === 0
                        ? plan.priceNote
                        : PRO_PRICE_COPY.monthlySuffix}
                    </span>
                  </div>
                  {/* Same derived annual line as the full pricing page, so the
                      teaser and the page cannot quote different numbers. */}
                  {plan.yearly && (
                    <p className="text-xs text-text-muted">
                      or{' '}
                      <span className="font-medium text-text-primary/90">
                        {usd(plan.yearly.totalUsd)}
                        {PRO_PRICE_COPY.yearlySuffix}
                      </span>{' '}
                      · {usd(plan.yearly.perMonthUsd)}/month billed annually
                    </p>
                  )}
                </div>

                <ul className="flex-1 space-y-2">
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
