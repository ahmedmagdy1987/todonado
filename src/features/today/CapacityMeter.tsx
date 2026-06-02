import { Gauge } from 'lucide-react'
import { Badge, Card, CardContent } from '@/components/ui'

function formatMinutes(total: number): string {
  const hours = Math.floor(total / 60)
  const minutes = total % 60
  if (hours === 0) return `${minutes}m`
  if (minutes === 0) return `${hours}h`
  return `${hours}h ${minutes}m`
}

/**
 * Day capacity meter — the heart of Todonado's MVP differentiator.
 *
 * In the MVP this binds to the user's daily capacity and the summed
 * `effort_minutes` of tasks scheduled for today. For the foundation it
 * renders a faithful, clearly-labeled preview using static values.
 */
export function CapacityMeter() {
  // Placeholder values — replaced by real data (capacity vs Σ effort_minutes).
  const capacityMinutes = 360 // 6h default daily capacity
  const plannedMinutes = 0
  const pct = Math.min(100, Math.round((plannedMinutes / capacityMinutes) * 100))
  const freeMinutes = Math.max(0, capacityMinutes - plannedMinutes)

  return (
    <Card>
      <CardContent className="p-5">
        <div className="mb-4 flex items-center gap-2">
          <Gauge className="h-4 w-4 text-brand" aria-hidden />
          <h3 className="font-display text-base font-semibold">Day Capacity</h3>
          <Badge variant="brand" className="ml-2">
            Effort-aware
          </Badge>
          <span className="ml-auto font-mono text-xs text-text-muted">
            {pct}% planned
          </span>
        </div>

        {/* Meter */}
        <div
          className="h-3 w-full overflow-hidden rounded-full bg-surface-2"
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Planned share of today's capacity"
        >
          <div
            className="h-full rounded-full bg-brand-gradient transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>

        <div className="mt-3 flex items-center justify-between font-mono text-sm">
          <span className="text-text-primary">
            {formatMinutes(plannedMinutes)}{' '}
            <span className="text-text-muted">planned</span>
          </span>
          <span className="text-text-primary">
            {formatMinutes(freeMinutes)} <span className="text-text-muted">free</span>
          </span>
        </div>

        <p className="mt-3 text-xs text-text-muted">
          Plan a <span className="text-text-primary">realistic</span> day: Todonado sums the
          effort of what you schedule and warns before you overcommit.
        </p>
      </CardContent>
    </Card>
  )
}
