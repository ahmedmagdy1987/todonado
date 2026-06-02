import { useState } from 'react'
import { Gauge, Pencil } from 'lucide-react'
import { Badge, Button, Card, CardContent, Input } from '@/components/ui'
import { formatMinutes } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { CapacityStatus, CapacitySummary } from './capacity'

const FILL: Record<CapacityStatus, string> = {
  empty: 'bg-surface-2',
  ok: 'bg-brand-gradient',
  near: 'bg-warning',
  over: 'bg-danger',
}

const PRESETS = [
  { label: '4h', minutes: 240 },
  { label: '6h', minutes: 360 },
  { label: '8h', minutes: 480 },
]

interface CapacityMeterProps {
  summary: CapacitySummary
  onCapacityChange: (minutes: number) => void
}

export function CapacityMeter({ summary, onCapacityChange }: CapacityMeterProps) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(String(summary.capacityMinutes))

  function save(minutes: number) {
    const m = Math.max(1, Math.round(minutes))
    onCapacityChange(m)
    setEditing(false)
  }

  return (
    <Card>
      <CardContent className="p-5">
        <div className="mb-4 flex items-center gap-2">
          <Gauge className="h-4 w-4 text-brand" aria-hidden />
          <h3 className="font-display text-base font-semibold">Day Capacity</h3>
          <Badge variant="brand" className="ml-1">
            Effort-aware
          </Badge>
          <span
            className={cn(
              'ml-auto font-mono text-xs',
              summary.status === 'over' ? 'text-danger' : 'text-text-muted',
            )}
          >
            {summary.pct}% planned
          </span>
        </div>

        <div
          className="h-3 w-full overflow-hidden rounded-full bg-surface-2"
          role="progressbar"
          aria-valuenow={summary.barPct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Planned share of today's capacity"
        >
          <div
            className={cn('h-full rounded-full transition-all', FILL[summary.status])}
            style={{ width: `${summary.barPct}%` }}
          />
        </div>

        <div className="mt-3 flex items-center justify-between font-mono text-sm">
          <span className="text-text-primary">
            {formatMinutes(summary.plannedMinutes)}{' '}
            <span className="text-text-muted">planned</span>
          </span>
          {!editing ? (
            <button
              type="button"
              onClick={() => {
                setDraft(String(summary.capacityMinutes))
                setEditing(true)
              }}
              className="focus-ring inline-flex items-center gap-1.5 rounded text-text-muted hover:text-text-primary"
              title="Edit daily capacity"
            >
              of {formatMinutes(summary.capacityMinutes)}
              <Pencil className="h-3 w-3" aria-hidden />
            </button>
          ) : (
            <span className="text-text-muted">
              {summary.status === 'over'
                ? `${formatMinutes(summary.overMinutes)} over`
                : `${formatMinutes(summary.freeMinutes)} free`}
            </span>
          )}
        </div>

        {editing && (
          <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-white/5 pt-3">
            {PRESETS.map((p) => (
              <Button key={p.minutes} type="button" variant="secondary" size="sm" onClick={() => save(p.minutes)}>
                {p.label}
              </Button>
            ))}
            <Input
              type="number"
              min={15}
              step={15}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              className="h-8 w-24"
              aria-label="Custom capacity in minutes"
            />
            <Button type="button" size="sm" onClick={() => save(Number(draft) || summary.capacityMinutes)}>
              Save
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </div>
        )}

        {!editing && (
          <p className="mt-3 text-xs text-text-muted">
            {summary.status === 'over'
              ? 'Overbooked — Todonado suggests moving the lowest-priority work to tomorrow.'
              : summary.status === 'near'
                ? 'Nearly full. Protect your focus — add only what truly matters.'
                : 'Plan a realistic day: schedule work and watch your remaining headroom.'}
          </p>
        )}
      </CardContent>
    </Card>
  )
}
