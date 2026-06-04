import { History, ArrowRight } from 'lucide-react'
import type { Task } from '@/types/database'
import { Button } from '@/components/ui'
import { formatMinutes, formatDateShort } from '@/lib/format'
import { todayISO } from '@/lib/date'
import { rolloverSpan } from '../rollover'

interface RolloverBannerProps {
  tasks: Task[]
  onRollOne: (task: Task) => void
  onRollAll: () => void
}

/** Calm, never guilt-y prompt to bring earlier leftovers into today. */
export function RolloverBanner({ tasks, onRollOne, onRollAll }: RolloverBannerProps) {
  if (tasks.length === 0) return null

  // Only say "Yesterday" when the leftovers are truly from yesterday; if any is
  // 2+ days old, the day spans "earlier days" (the per-row date stays exact).
  const headline =
    rolloverSpan(tasks, todayISO()) === 'earlier'
      ? 'Earlier days overflowed. Move what still matters to today.'
      : 'Yesterday overflowed. Move what still matters to today.'

  return (
    <div className="animate-fade-in rounded-2xl border border-accent/25 bg-accent/5 p-4">
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent/15 text-accent">
          <History className="h-4 w-4" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-text-primary">{headline}</p>
          <p className="mt-0.5 text-xs text-text-muted">
            {tasks.length} unfinished {tasks.length === 1 ? 'task' : 'tasks'} from earlier.
          </p>

          <ul className="mt-3 space-y-1">
            {tasks.slice(0, 5).map((t) => (
              <li
                key={t.id}
                className="flex items-center gap-2 rounded-lg px-2 py-1 text-sm hover:bg-surface-2/40"
              >
                <span className="min-w-0 flex-1 truncate text-text-primary">{t.title}</span>
                {t.effort_minutes ? (
                  <span className="font-mono text-xs text-text-muted">
                    {formatMinutes(t.effort_minutes)}
                  </span>
                ) : null}
                {t.scheduled_for && (
                  <span className="text-xs text-text-muted/70">{formatDateShort(t.scheduled_for)}</span>
                )}
                <button
                  type="button"
                  onClick={() => onRollOne(t)}
                  className="focus-ring inline-flex items-center gap-1 rounded-lg px-1.5 py-0.5 text-xs text-accent hover:bg-accent/10"
                >
                  Today <ArrowRight className="h-3 w-3" aria-hidden />
                </button>
              </li>
            ))}
            {tasks.length > 5 && (
              <li className="px-2 text-xs text-text-muted/70">+{tasks.length - 5} more</li>
            )}
          </ul>
        </div>
        <Button size="sm" variant="secondary" onClick={onRollAll} className="shrink-0">
          Roll over all
        </Button>
      </div>
    </div>
  )
}
