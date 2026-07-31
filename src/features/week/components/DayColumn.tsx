import type { ReactNode } from 'react'
import { useDroppable } from '@dnd-kit/core'
import { AlertTriangle, CalendarClock, MoveRight } from 'lucide-react'
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

/**
 * One day of the week board.
 *
 * ── WHY THIS LOOKS THE WAY IT DOES ───────────────────────────────────────────
 * `w-full` is load-bearing. The section used to size to its CONTENT inside a
 * flex wrapper, so a grid cell nominally 1fr rendered at 105px when the day was
 * empty and 145px when it was full — the board came out visibly ragged, with
 * uneven gutters, and nobody could tell it was meant to be seven equal columns.
 *
 * THE HEADER IS THREE TIERS, not one line of same-sized text: the weekday is the
 * thing you scan for, the date is context, and the percentage is a status you
 * check second. Previously all three sat on one baseline at roughly one size,
 * which is why the board read as dense rather than organised.
 *
 * THE TASK AREA SCROLLS INSIDE THE COLUMN on large screens. That is what lets
 * the board fill the viewport instead of leaving a few hundred pixels of dead
 * space beneath it, and it keeps every day's header and quick-add in view no
 * matter how loaded one day is.
 */
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
  const isEmpty = day.tasks.length === 0 && day.overdue.length === 0

  return (
    <section
      ref={interactive ? setNodeRef : undefined}
      aria-label={`${day.weekday} ${day.dayOfMonth}`}
      className={cn(
        'flex w-full min-w-0 snap-center flex-col overflow-hidden rounded-2xl border transition-colors lg:h-full',
        day.isToday
          ? 'border-brand/40 bg-brand-gradient-soft shadow-[inset_0_1px_0_0_rgba(255,255,255,0.04)]'
          : 'border-white/5 bg-surface',
        isOver && 'border-brand ring-2 ring-brand/40',
      )}
    >
      {/* ---- header ---------------------------------------------------- */}
      <header className="shrink-0 border-b border-white/5 px-3 pb-2.5 pt-3">
        <div className="flex items-baseline gap-2">
          <h3
            className={cn(
              'font-display text-base font-semibold leading-none',
              day.isToday ? 'text-brand' : 'text-text-primary',
            )}
          >
            {day.isToday ? 'Today' : day.weekday}
          </h3>
          <span className="font-mono text-xs text-text-muted/70">{day.dayOfMonth}</span>
          <span
            className={cn(
              'ml-auto rounded-full px-1.5 py-0.5 font-mono text-[11px] tabular-nums',
              summary.status === 'over'
                ? 'bg-danger/15 text-danger'
                : summary.status === 'near'
                  ? 'bg-warning/15 text-warning'
                  : 'text-text-muted',
            )}
          >
            {summary.pct}%
          </span>
        </div>

        <div
          className="mt-2 h-2 w-full overflow-hidden rounded-full bg-surface-2"
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

        {/* Planned vs remaining, on ONE line that cannot wrap into an orphan.
            The old version put "free" on a line of its own about half the time. */}
        <p className="mt-1.5 flex items-baseline justify-between gap-2 font-mono text-[11px] leading-none">
          <span className="text-text-muted">{formatMinutes(day.taskMinutes)}</span>
          <span className={summary.status === 'over' ? 'text-danger' : 'text-text-muted/70'}>
            {summary.status === 'over'
              ? `${formatMinutes(summary.overMinutes)} over`
              : `${formatMinutes(summary.freeMinutes)} free`}
          </span>
        </p>

        {day.busyMinutes > 0 && (
          <p className="mt-1.5 flex items-center gap-1 text-[11px] leading-none text-accent">
            <CalendarClock className="h-3 w-3 shrink-0" aria-hidden />
            {formatMinutes(day.busyMinutes)} in meetings
          </p>
        )}
      </header>

      {/* ---- tasks ------------------------------------------------------ */}
      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-2 py-2.5">
        {overdue && day.overdue.length > 0 && (
          <div className="rounded-xl border border-warning/20 bg-warning/[0.06] p-1.5">
            <p className="mb-1.5 flex items-center gap-1 px-1 text-[11px] font-medium text-warning">
              <AlertTriangle className="h-3 w-3 shrink-0" aria-hidden />
              Overdue ({day.overdue.length})
            </p>
            <div className="space-y-1.5">{overdue}</div>
          </div>
        )}

        <div className="space-y-1.5">{children}</div>

        {/* An empty day is a DROP TARGET, not a blank box. It also tells you what
            to do with it, which the previous blank space did not. */}
        {isEmpty && (
          <div
            className={cn(
              'flex flex-1 flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed px-2 py-6 text-center transition-colors',
              isOver ? 'border-brand/60 bg-brand/5' : 'border-white/10',
            )}
          >
            <MoveRight className="h-4 w-4 text-text-muted/40" aria-hidden />
            <p className="text-xs leading-snug text-text-muted">
              Nothing planned
              <br />
              <span className="text-text-muted/80">Drop a task here</span>
            </p>
          </div>
        )}
      </div>

      {/* ---- quick add --------------------------------------------------- */}
      {quickAdd && <div className="shrink-0 border-t border-white/5 p-2">{quickAdd}</div>}
    </section>
  )
}
