import { CalendarClock, CalendarRange, LineChart, type LucideIcon } from 'lucide-react'
import { Reveal } from '../demo/Reveal'
import { WHY_PRO } from '../planMatrix'

/**
 * "WHY WOULD I PAY?", ANSWERED BEFORE THE PRICE IS SHOWN.
 *
 * ── THE GAP THIS FILLS ─────────────────────────────────────────────────────
 *
 * The page went from storytelling straight to a pricing teaser. A visitor
 * arrived at "$5/month" having never been told what the paid tier is FOR, so
 * the number had nothing to attach to. Price is only ever cheap or expensive
 * relative to a stated value, and no value had been stated.
 *
 * ── WHY EXACTLY THREE, AND WHY THESE THREE ─────────────────────────────────
 *
 * A full entitlement audit (docs/PRODUCT_VALUE_AUDIT.md) read every one of the
 * 146 shipped capabilities and found twelve Pro surfaces. Nine of them are
 * count caps and a history window: real, but nobody has ever upgraded on day
 * one because three saved templates was not enough. Leading with those would
 * make Pro sound like the same product with bigger numbers.
 *
 * The three below are the ones that change what the product DOES: a second
 * time horizon, a retrospective, and a calendar that maintains itself. They
 * are also, in that order, the three most likely to be the reason somebody
 * pays. The caps are still listed honestly in the table underneath, where they
 * belong: as detail, not as the pitch.
 *
 * ── AND WHY THE FLAGSHIP IS DEMONSTRATED, NOT DESCRIBED ────────────────────
 *
 * The week board is the whole argument for Pro, so it is the one place on the
 * page where an interactive demo genuinely earns its position: the claim is
 * "it spreads work across seven days without overloading one", and the demo
 * runs the REAL `planWeek` to do exactly that. A screenshot could not prove it
 * and a sentence would only assert it.
 */

const ICONS: LucideIcon[] = [CalendarRange, LineChart, CalendarClock]

export function WhyPro({ children }: { children?: React.ReactNode }) {
  return (
    <>
      <div className="mx-auto max-w-2xl text-center">
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-accent">Why Pro</p>
        <h2
          id="why-pro-title"
          className="mt-3 font-display text-2xl font-bold leading-[1.1] tracking-tight sm:text-3xl lg:text-4xl"
        >
          Free plans your day.
          <span className="mt-1 block text-gradient-brand">Pro plans your week, and remembers.</span>
        </h2>
        <p className="mt-4 text-base leading-relaxed text-text-muted">
          Everything that makes a single day work is free, forever. Pro is for when one day stops
          being the unit you think in.
        </p>
      </div>

      <ul className="mt-10 grid gap-5 sm:mt-14 lg:grid-cols-3 lg:gap-6">
        {WHY_PRO.map(({ title, body }, i) => {
          const Icon = ICONS[i]
          return (
            <li key={title}>
              <Reveal delay={i * 70}>
                <div className="flex h-full flex-col rounded-2xl border border-white/12 bg-background/45 p-6 backdrop-blur-sm lg:p-7">
                  <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-brand-gradient text-white">
                    <Icon className="h-5 w-5" aria-hidden />
                  </span>
                  <h3 className="mt-5 font-display text-lg font-semibold leading-snug">{title}</h3>
                  <p className="mt-3 text-sm leading-relaxed text-text-muted">{body}</p>
                </div>
              </Reveal>
            </li>
          )
        })}
      </ul>

      {/* The flagship, demonstrated. Passed in so this component stays free of
          the lazy-loading machinery the landing page owns. */}
      {children && <div className="mt-10 sm:mt-14">{children}</div>}
    </>
  )
}
