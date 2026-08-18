import { Link } from 'react-router-dom'
import { Check } from 'lucide-react'
import { Badge, Button } from '@/components/ui'
import { cn } from '@/lib/utils'
import { PRO_PRICE_COPY, PRO_YEARLY, usd } from '../pricing'
import { PLANS } from '../plans'
import { PRO_REASONS } from './WhyPro'

/**
 * THE CARDS CARRY THEIR OWN ARGUMENT, BECAUSE THE ONE ABOVE IS OFF SCREEN.
 *
 * This component originally had no bullets, on the reasoning that the Free/Pro
 * table sits directly above it. Measurement killed that reasoning: scrolled so
 * the $5 is centred, the four reasons to pay end 793px above the top of the
 * price cards, and NO common viewport spans that gap. At 1440x760 the only Pro
 * claims on screen with the number were "Written entries and voice notes" and
 * "No limits on any of them" — so the last argument a buyer read before the
 * price was the raised-cap row.
 *
 * Both columns now list what they are, at the moment of the decision. Neither
 * list is new copy: Pro reads the same `PRO_REASONS` the section above renders,
 * and Free reads the existing `PLANS` bullets that /pricing already shows, so
 * no surface can drift from another and no claim is invented here.
 */

/** The three Free bullets that matter at the point of choice. */
const FREE_HIGHLIGHTS = (PLANS.find((plan) => plan.id === 'free')?.features ?? []).slice(0, 3)

function Ticks({ items, pro = false }: { items: readonly string[]; pro?: boolean }) {
  return (
    <ul className="mt-4 space-y-1.5 text-sm">
      {items.map((item) => (
        <li key={item} className="flex items-start gap-2">
          <Check
            className={cn('mt-0.5 h-3.5 w-3.5 shrink-0', pro ? 'text-brand' : 'text-success')}
            aria-hidden
          />
          <span className="text-text-muted">{item}</span>
        </li>
      ))}
    </ul>
  )
}

/**
 * THE PRICE, AT THE END OF THE ARGUMENT THAT JUSTIFIES IT.
 *
 * ── WHY THIS IS NOT THE EXISTING `PricingTeaser` ───────────────────────────
 *
 * That component carries six feature bullets per plan, which is right when it
 * stands alone. Here the Free/Pro table is directly above it, so bullets would
 * be the third listing of the same facts on one screen. What is left is the
 * only thing a price card actually has to do: name the plan, state the number,
 * and offer the button.
 *
 * ── EVERY FIGURE IS DERIVED ────────────────────────────────────────────────
 *
 * `pricing.ts` writes down only the two amounts Stripe charges; the monthly
 * equivalent, the saving and the percentage are computed from them. So the card
 * cannot claim a discount that does not follow from the prices, and "$4/month"
 * is never shown without "billed annually" beside it.
 *
 * No urgency, no countdown, no invented guarantee, no crossed-out "was" price.
 */
export function PricingCards({
  onStartFree,
  className,
}: {
  onStartFree: () => void
  className?: string
}) {
  return (
    <div className={cn('grid items-stretch gap-3 sm:grid-cols-2 sm:gap-4', className)}>
      {/* ── Free ──────────────────────────────────────────────────────── */}
      <div className="flex flex-col rounded-2xl border border-white/10 bg-surface p-5 sm:p-6">
        <h3 className="font-display text-lg font-semibold text-text-primary">Free</h3>
        <p className="mt-1 text-sm text-text-muted">
          A complete day, permanently. Not a trial.
        </p>
        <div className="mt-5 flex items-end gap-1.5">
          <span className="font-display text-4xl font-bold text-text-primary">{usd(0)}</span>
          <span className="pb-1.5 text-sm text-text-muted">/month</span>
        </div>
        <p className="mt-2 text-xs text-text-muted">No card, no expiry.</p>
        <Ticks items={FREE_HIGHLIGHTS} />
        <div className="flex-1" />
        <Button variant="outline" className="mt-6 min-h-[44px] w-full" onClick={onStartFree}>
          Start free
        </Button>
      </div>

      {/* ── Pro ───────────────────────────────────────────────────────── */}
      <div className="flex flex-col rounded-2xl border border-brand/40 bg-surface p-5 shadow-brand-glow sm:p-6">
        <div className="flex items-center gap-2">
          <h3 className="font-display text-lg font-semibold text-text-primary">Pro</h3>
          <Badge variant="brand">The week, and the look back</Badge>
        </div>
        <p className="mt-1 text-sm text-text-muted">
          For the system you keep, not just the day you are in.
        </p>
        <div className="mt-5 flex items-end gap-1.5">
          <span className="font-display text-4xl font-bold text-text-primary">
            {PRO_PRICE_COPY.monthlyAmount}
          </span>
          <span className="pb-1.5 text-sm text-text-muted">{PRO_PRICE_COPY.monthlySuffix}</span>
        </div>
        <p className="mt-2 text-xs text-text-muted">
          or {PRO_PRICE_COPY.yearlyAmount}
          {PRO_PRICE_COPY.yearlySuffix} · {PRO_PRICE_COPY.yearlyPerMonth}
          <span className="ml-1.5 font-medium text-success">
            save {PRO_YEARLY.savingPercent}%
          </span>
        </p>
        <Ticks items={PRO_REASONS.map((reason) => reason.title)} pro />
        <div className="flex-1" />
        <Button className="mt-6 min-h-[44px] w-full" onClick={onStartFree}>
          Start free, upgrade anytime
        </Button>
        <p className="mt-3 text-center text-xs text-text-muted">Cancel whenever you like.</p>
      </div>

      <p className="text-center text-xs text-text-muted sm:col-span-2">
        {/* 44px: this is the only route from here to the full comparison, and
            it was a 15px-tall line of text. */}
        <Link
          to="/pricing"
          className="focus-ring inline-flex min-h-[44px] items-center rounded px-2 underline-offset-4 hover:underline"
        >
          See the full plan comparison
        </Link>
      </p>
    </div>
  )
}
