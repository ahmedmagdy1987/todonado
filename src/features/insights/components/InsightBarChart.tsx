import { cn } from '@/lib/utils'
import { TONE, type ChartTone } from './chartTones'

export interface BarPoint {
  /** Used for the hover title (e.g. a formatted date). */
  label: string
  primary: number
  /** Optional overlay drawn in front of `primary` (e.g. completed vs planned). */
  secondary?: number
  tone?: ChartTone
}

interface InsightBarChartProps {
  points: BarPoint[]
  /** Upper bound of the scale; defaults to the largest value present. */
  max?: number
  /** Draw a dashed reference line at this value (same units as `primary`). */
  reference?: number
  /** Format values for the hover title / reference label. */
  format?: (value: number) => string
  /** Tailwind height class for the plot area. */
  heightClass?: string
  ariaLabel: string
}

/**
 * Compact bar chart built from divs (no chart dependency, crisp on the dark
 * theme). When a point has `secondary`, `primary` renders as a faded track with
 * `secondary` filled in front (planned vs completed). Otherwise `primary` is a
 * solid toned bar (capacity %, focus minutes).
 */
export function InsightBarChart({
  points,
  max,
  reference,
  format = (v) => String(v),
  heightClass = 'h-40',
  ariaLabel,
}: InsightBarChartProps) {
  const scale = Math.max(
    1,
    max ?? Math.max(...points.map((p) => Math.max(p.primary, p.secondary ?? 0)), 0),
  )
  const pct = (v: number) => (v <= 0 ? 0 : Math.max(3, Math.min(100, (v / scale) * 100)))

  return (
    <div className="w-full" role="img" aria-label={ariaLabel}>
      <div className={cn('relative flex items-end gap-1', heightClass)}>
        {reference != null && reference <= scale && (
          <div
            className="pointer-events-none absolute inset-x-0 z-10 border-t border-dashed border-white/25"
            style={{ bottom: `${(reference / scale) * 100}%` }}
            aria-hidden
          />
        )}
        {points.map((p, i) => {
          const tone = TONE[p.tone ?? 'brand']
          const hasOverlay = p.secondary != null
          const title = hasOverlay
            ? `${p.label}: planned ${format(p.primary)}, done ${format(p.secondary ?? 0)}`
            : `${p.label}: ${format(p.primary)}`
          return (
            <div key={p.label || i} className="group relative h-full flex-1" title={title}>
              <div
                className={cn(
                  'absolute bottom-0 w-full rounded-t-sm transition-colors',
                  hasOverlay ? tone.track : tone.fill,
                )}
                style={{ height: `${pct(p.primary)}%` }}
              />
              {hasOverlay && (
                <div
                  className={cn('absolute bottom-0 w-full rounded-t-sm', tone.fill)}
                  style={{ height: `${pct(p.secondary ?? 0)}%` }}
                />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
