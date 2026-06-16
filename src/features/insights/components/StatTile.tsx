import type { LucideIcon } from 'lucide-react'

interface StatTileProps {
  icon: LucideIcon
  label: string
  value: string
  sub?: string
}

/** A single summary metric: icon + label, a big value, and an optional caption. */
export function StatTile({ icon: Icon, label, value, sub }: StatTileProps) {
  return (
    <div className="rounded-xl border border-white/5 bg-surface-2/40 p-4">
      <div className="flex items-center gap-2 text-text-muted">
        <Icon className="h-4 w-4" aria-hidden />
        <span className="text-xs font-medium uppercase tracking-wide">{label}</span>
      </div>
      <p className="mt-2 font-display text-2xl font-bold text-text-primary">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-text-muted">{sub}</p>}
    </div>
  )
}
