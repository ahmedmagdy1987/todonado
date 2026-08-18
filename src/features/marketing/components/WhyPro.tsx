import { BarChart3, CalendarRange, CalendarClock, History } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ENTITLEMENTS } from '@/features/billing/entitlements'

/**
 * THE FOUR REASONS TO PAY, BEFORE THE PRICE IS SHOWN.
 *
 * ── ORDERING IS THE POINT ──────────────────────────────────────────────────
 *
 * The page this replaces went from storytelling straight to "$5/month", so a
 * visitor met the number having never been told what the paid tier is FOR.
 * A price with no preceding argument is just a cost.
 *
 * ── WHAT LEADS, AND WHAT DELIBERATELY DOES NOT ─────────────────────────────
 *
 * The four here are the ones somebody would actually miss: the week, the
 * calendar staying current by itself, knowing how your estimates really run,
 * and keeping your finished work. Every one is a capability, not a quota.
 *
 * "Unlimited mind maps" and "more templates" are real and are NOT the argument.
 * Leading with a raised cap tells a reader the paid tier is the same product
 * with a bigger number, which is both unconvincing and, here, untrue. The caps
 * are stated once at the end, as the last line, where they belong.
 */

interface Reason {
  icon: typeof CalendarRange
  kicker: string
  title: string
  body: string
}

export const PRO_REASONS: readonly Reason[] = [
  {
    icon: CalendarRange,
    kicker: 'The week',
    title: 'Seven days, each with its own capacity',
    body: 'Plan past today. Drag work to the day that has room, and let Plan my week spread the rest across the days that can take it.',
  },
  {
    icon: CalendarClock,
    kicker: 'Your calendar',
    title: 'Meetings stay in your capacity by themselves',
    body: 'Paste a calendar link once. Meetings keep taking real time out of your day even when they move, with nothing to re-import.',
  },
  {
    icon: BarChart3,
    kicker: 'Your patterns',
    title: 'Find out how far off your estimates run',
    body: 'Planned time against actual time, week over week. This is the part that makes next month better than this one.',
  },
  {
    icon: History,
    kicker: 'Your history',
    title: 'Everything you have finished, kept',
    body: `Free shows the last ${ENTITLEMENTS.free.limits.historyDays} days of completed work. Pro shows all of it, for as long as you keep the account.`,
  },
] as const

export function WhyPro({ className }: { className?: string }) {
  return (
    <div className={cn('grid gap-3 sm:grid-cols-2 sm:gap-4', className)}>
      {PRO_REASONS.map(({ icon: Icon, ...reason }) => (
        <div
          key={reason.kicker}
          className="rounded-2xl border border-white/10 bg-surface/80 p-4 sm:p-6"
        >
          <div className="flex items-center gap-2.5">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-brand/15 text-brand">
              <Icon className="h-4 w-4" aria-hidden />
            </span>
            <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-brand">
              {reason.kicker}
            </p>
          </div>
          <h3 className="mt-3 font-display text-base font-semibold leading-snug text-text-primary">
            {reason.title}
          </h3>
          <p className="mt-2 text-sm leading-relaxed text-text-muted">{reason.body}</p>
        </div>
      ))}
    </div>
  )
}
