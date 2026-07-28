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

const MESSAGE: Record<CapacityStatus, string> = {
  empty: 'An empty day. Add work and watch the headroom shrink.',
  ok: 'Comfortable. There is still real room here.',
  near: 'Nearly full. Protect your focus and add only what truly matters.',
  over: 'This day does not fit. Something has to move to tomorrow.',
}

interface DemoMeterProps {
  summary: CapacitySummary
  /** Heading shown beside the gauge icon. */
  title?: string
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
  showMessage = true,
  className,
}: DemoMeterProps) {
  return (
    <div className={cn('space-y-3', className)}>
      <div className="flex items-center gap-2">
        <Gauge className="h-4 w-4 text-brand" aria-hidden />
        <h3 className="font-display text-sm font-semibold sm:text-base">{title}</h3>
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
