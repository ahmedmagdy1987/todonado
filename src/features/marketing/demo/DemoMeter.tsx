import { Gauge } from 'lucide-react'
import { formatMinutes } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { CapacityStatus, CapacitySummary } from '@/features/today/capacity'

/** Identical fill semantics to the product's own CapacityMeter. */
const FILL: Record<CapacityStatus, string> = {
  empty: 'bg-surface-2',
  ok: 'bg-brand-gradient',
  near: 'bg-warning',
  over: 'bg-danger',
}

const PCT_TONE: Record<CapacityStatus, string> = {
  empty: 'text-text-muted',
  ok: 'text-text-muted',
  near: 'text-warning',
  over: 'text-danger',
}

/**
 * PLAIN ENGLISH, NOT PRODUCT VOCABULARY.
 *
 * The empty state used to read "An empty day. Add work and watch the headroom
 * shrink." — "headroom" is a word from inside the codebase (`capacity.ts` calls
 * it that) and it had leaked onto the page a visitor sees first. Every line here
 * now says what is true in words someone would actually use out loud.
 */
const MESSAGE: Record<CapacityStatus, string> = {
  empty: 'Nothing planned yet. Add a task to see how much of your day is left.',
  ok: 'Comfortable. You still have room for more.',
  near: 'Nearly full. Add only what really matters today.',
  over: 'This won’t all fit today. Something has to move to tomorrow.',
}

interface DemoMeterProps {
  summary: CapacitySummary
  /** Heading shown beside the gauge icon. */
  title?: string
  /**
   * What to render the title as.
   *
   * `h3` is right wherever the meter sits inside a section that already has an
   * `h2` — the capacity and recovery widgets both do. In the HERO it is wrong:
   * the nearest heading above is the page's `h1`, so an `h3` there skips a
   * level, which an outline reader hears as a missing section. The meter's
   * title is a label on a widget rather than a division of the document, so
   * `p` is both accessible and honest there.
   */
  titleAs?: 'h3' | 'p'
  /** Hide the explanatory sentence when the surrounding widget says it better. */
  showMessage?: boolean
  className?: string
}

/**
 * The signature capacity meter, rendered read-only for the landing demos. The
 * numbers come from the REAL `computeCapacity`; this component only draws them.
 */
export function DemoMeter({
  summary,
  title = 'Day Capacity',
  titleAs: TitleTag = 'h3',
  showMessage = true,
  className,
}: DemoMeterProps) {
  return (
    <div className={cn('space-y-3', className)}>
      <div className="flex items-center gap-2">
        <Gauge className="h-4 w-4 text-brand" aria-hidden />
        <TitleTag className="font-display text-sm font-semibold sm:text-base">{title}</TitleTag>
        <span
          className={cn(
            'ml-auto font-mono text-xs tabular-nums transition-colors sm:text-sm',
            PCT_TONE[summary.status],
          )}
        >
          {summary.pct}% planned
        </span>
      </div>

      <div
        className="h-3 w-full overflow-hidden rounded-full bg-surface-2"
        role="progressbar"
        aria-valuenow={summary.pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Share of the demo day's capacity that is planned"
      >
        <div
          className={cn(
            'h-full rounded-full transition-[width,background-color] duration-500 ease-out',
            FILL[summary.status],
          )}
          style={{ width: `${summary.barPct}%` }}
        />
      </div>

      <div className="flex items-center justify-between font-mono text-xs tabular-nums sm:text-sm">
        <span className="text-text-primary">
          {formatMinutes(summary.plannedMinutes)} <span className="text-text-muted">planned</span>
        </span>
        <span className={summary.status === 'over' ? 'text-danger' : 'text-text-muted'}>
          {summary.status === 'over'
            ? `${formatMinutes(summary.overMinutes)} over`
            : `${formatMinutes(summary.freeMinutes)} free`}
        </span>
      </div>

      {showMessage && (
        <p
          className={cn(
            'text-xs leading-relaxed transition-colors',
            summary.status === 'over'
              ? 'text-danger'
              : summary.status === 'near'
                ? 'text-warning'
                : 'text-text-muted',
          )}
          aria-live="polite"
        >
          {MESSAGE[summary.status]}
        </p>
      )}
    </div>
  )
}
