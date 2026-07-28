import { Check, Circle, Clock } from 'lucide-react'
import { formatMinutes } from '@/lib/format'
import { cn } from '@/lib/utils'
import { PRIORITY_META } from '@/features/tasks/priority'
import type { Task } from '@/types/database'

/**
 * A task on the week board.
 *
 * NOT TaskRow: that component is built for a full-width list — at a seventh of
 * the screen its title collapsed to nothing and its controls overflowed. This is
 * a compact presentation of the SAME data driven by the SAME mutations
 * (toggleComplete / TaskDialog), so nothing about behaviour forks — only layout.
 * Full editing still opens the shared task dialog.
 */
export function WeekTaskCard({
  task,
  onToggle,
  onOpen,
}: {
  task: Task
  onToggle: (task: Task) => void
  onOpen: (task: Task) => void
}) {
  const done = task.status === 'done'
  const meta = PRIORITY_META[task.priority]

  return (
    <div
      className={cn(
        'rounded-xl border border-white/5 bg-surface-2/40 px-2 py-1.5 transition-colors',
        done && 'opacity-60',
      )}
    >
      <div className="flex items-start gap-1.5">
        <button
          type="button"
          onClick={() => onToggle(task)}
          aria-label={done ? `Mark ${task.title} not done` : `Complete ${task.title}`}
          className="focus-ring mt-0.5 shrink-0 rounded-full text-text-muted transition-colors hover:text-success"
        >
          {done ? (
            <Check className="h-3.5 w-3.5 text-success" aria-hidden />
          ) : (
            <Circle className="h-3.5 w-3.5" aria-hidden />
          )}
        </button>
        <button
          type="button"
          onClick={() => onOpen(task)}
          className="focus-ring min-w-0 flex-1 rounded text-left"
        >
          <span
            className={cn(
              'line-clamp-2 break-words text-xs leading-snug',
              done ? 'text-text-muted line-through' : 'text-text-primary',
            )}
          >
            {task.title}
          </span>
        </button>
      </div>

      <div className="mt-1 flex items-center gap-1.5 pl-5">
        {meta.dot && (
          <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', meta.dot)} aria-hidden />
        )}
        {task.effort_minutes != null && (
          <span className="flex items-center gap-0.5 font-mono text-[11px] text-text-muted">
            <Clock className="h-3 w-3" aria-hidden />
            {formatMinutes(task.effort_minutes)}
          </span>
        )}
      </div>
    </div>
  )
}
