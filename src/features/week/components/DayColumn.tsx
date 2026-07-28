import type { ReactNode } from 'react'
import { useDroppable } from '@dnd-kit/core'
import { AlertTriangle, CalendarClock } from 'lucide-react'
import { formatMinutes } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { CapacityStatus } from '@/features/today/capacity'
import { dayDroppableId, type WeekDayView } from '../week'

/** Same fill semantics as the product's CapacityMeter — one visual language. */
const FILL: Record<CapacityStatus, string> = {
  empty: 'bg-surface-2',
  ok: 'bg-brand-gradient',
  near: 'bg-warning',
  over: 'bg-danger',
}

interface DayColumnProps {
  day: WeekDayView
  /** Rendered task rows (draggable) for this day. */
  children: ReactNode
  /** Overdue rows, today only. */
  overdue?: ReactNode
  quickAdd?: ReactNode
  /** Disables droppable wiring for the static sample preview. */
  interactive?: boolean
}

/** One day of the week board: header, its own meter, its tasks, a quick-add. */
export function DayColumn({
  day,
  children,
  overdue,
  quickAdd,
  interactive = true,
}: DayColumnProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: dayDroppableId(day.date),
    disabled: !interactive,
  })
  const { summary } = day.capacity

  return (
    <section
      ref={interactive ? setNodeRef : undefined}
      aria-label={`${day.weekday} ${day.dayOfMonth}`}
      className={cn(
        'flex min-w-[85vw] snap-center flex-col rounded-2xl border bg-surface p-3 transition-colors sm:min-w-0',
        day.isToday ? 'border-brand/40' : 'border-white/5',
        isOver && 'border-brand bg-brand-gradient-soft',
      )}
    >
      <header className="mb-2 flex items-baseline gap-1.5">
        <h3
          className={cn(
            'font-display text-sm font-semibold',
            day.isToday ? 'text-brand' : 'text-text-primary',
          )}
        >
          {day.isToday ? 'Today' : day.weekday}
        </h3>
        <span className="font-mono text-xs text-text-muted">{day.dayOfMonth}</span>
        <span
          className={cn(
            'ml-auto font-mono text-[11px] tabular-nums',
            summary.status === 'over' ? 'text-danger' : 'text-text-muted',
          )}
        >
          {summary.pct}%
        </span>
      </header>

      <div
        className="h-1.5 w-full overflow-hidden rounded-full bg-surface-2"
        role="progressbar"
        aria-valuenow={summary.pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${day.weekday} ${day.dayOfMonth}: ${summary.pct}% of capacity planned`}
      >
        <div
          className={cn('h-full rounded-full transition-all', FILL[summary.status])}
          style={{ width: `${summary.barPct}%` }}
        />
      </div>

      <p className="mt-1.5 font-mono text-[11px] text-text-muted">
        {formatMinutes(day.taskMinutes)}
        {summary.status === 'over'
          ? ` · ${formatMinutes(summary.overMinutes)} over`
          : ` · ${formatMinutes(summary.freeMinutes)} free`}
      </p>

      {day.busyMinutes > 0 && (
        <p className="mt-1 flex items-center gap-1 text-[11px] text-accent">
          <CalendarClock className="h-3 w-3 shrink-0" aria-hidden />
          {formatMinutes(day.busyMinutes)} in meetings
        </p>
      )}

      {overdue && day.overdue.length > 0 && (
        <div className="mt-3">
          <p className="mb-1.5 flex items-center gap-1 text-[11px] font-medium text-warning">
            <AlertTriangle className="h-3 w-3 shrink-0" aria-hidden />
            Overdue ({day.overdue.length})
          </p>
          <div className="space-y-1.5">{overdue}</div>
        </div>
      )}

      <div className="mt-3 flex-1 space-y-1.5">{children}</div>

      {quickAdd && <div className="mt-2">{quickAdd}</div>}
    </section>
  )
}
