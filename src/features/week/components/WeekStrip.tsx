import { cn } from '@/lib/utils'
import type { CapacityStatus } from '@/features/today/capacity'
import { dayAnchorId, type WeekDayView } from '../week'

const FILL: Record<CapacityStatus, string> = {
  empty: 'bg-surface-2',
  ok: 'bg-brand-gradient',
  near: 'bg-warning',
  over: 'bg-danger',
}

/**
 * Compact seven-day capacity strip for narrow screens: the whole week's load at
 * a glance above the scroller, and each bar jumps to its day. On mobile the
 * columns snap-scroll, so without this you'd have to swipe blindly to find the
 * day with room.
 */
export function WeekStrip({ days }: { days: WeekDayView[] }) {
  function jump(date: string) {
    document.getElementById(dayAnchorId(date))?.scrollIntoView({
      behavior: 'smooth',
      block: 'nearest',
      inline: 'center',
    })
  }

  return (
    <div className="flex gap-1.5 lg:hidden" aria-label="Week capacity overview">
      {days.map((day) => (
        <button
          key={day.date}
          type="button"
          onClick={() => jump(day.date)}
          aria-label={`${day.weekday} ${day.dayOfMonth}: ${day.capacity.summary.pct}% planned. Jump to this day.`}
          className="focus-ring flex min-w-0 flex-1 flex-col items-center gap-1 rounded-lg py-1"
        >
          <span
            className={cn(
              'text-[10px] font-medium uppercase',
              day.isToday ? 'text-brand' : 'text-text-muted',
            )}
          >
            {day.weekday.slice(0, 1)}
          </span>
          <span className="h-8 w-full overflow-hidden rounded-full bg-surface-2">
            {/* Fills upward, so a fuller day reads as a taller bar. */}
            <span className="flex h-full w-full flex-col justify-end">
              <span
                className={cn('block w-full rounded-full', FILL[day.capacity.summary.status])}
                style={{ height: `${Math.max(day.capacity.summary.barPct, 4)}%` }}
              />
            </span>
          </span>
          <span className="font-mono text-[10px] text-text-muted">{day.dayOfMonth}</span>
        </button>
      ))}
    </div>
  )
}
