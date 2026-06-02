import { useState, type ReactNode } from 'react'
import {
  CalendarPlus,
  CalendarX,
  ChevronDown,
  ChevronRight,
  Clock,
  Pencil,
  Trash2,
} from 'lucide-react'
import type { Task } from '@/types/database'
import { Checkbox } from '@/components/ui'
import { cn } from '@/lib/utils'
import { formatMinutes, formatDateShort } from '@/lib/format'
import { PRIORITY_META } from '../priority'
import { SubtaskList } from './SubtaskList'

interface TaskRowProps {
  task: Task
  onToggleComplete: (task: Task) => void
  onEdit: (task: Task) => void
  onDelete: (task: Task) => void
  onScheduleToday?: (task: Task) => void
  onUnschedule?: (task: Task) => void
  /** Show an expandable subtasks section (used in Project detail). */
  expandable?: boolean
  /** Show the scheduled-for badge (hidden on Today where it's implied). */
  showSchedule?: boolean
}

function IconButton({
  title,
  onClick,
  danger,
  children,
}: {
  title: string
  onClick: () => void
  danger?: boolean
  children: ReactNode
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      className={cn(
        'focus-ring rounded-lg p-1.5 text-text-muted transition-colors hover:bg-surface-2/60',
        danger ? 'hover:text-danger' : 'hover:text-text-primary',
      )}
    >
      {children}
    </button>
  )
}

export function TaskRow({
  task,
  onToggleComplete,
  onEdit,
  onDelete,
  onScheduleToday,
  onUnschedule,
  expandable = false,
  showSchedule = true,
}: TaskRowProps) {
  const [expanded, setExpanded] = useState(false)
  const done = task.status === 'done'
  const prio = PRIORITY_META[task.priority]
  const hasEffort = task.effort_minutes != null && task.effort_minutes > 0

  return (
    <div className="group/row">
      <div className="flex items-start gap-3 rounded-xl border border-transparent px-4 py-3 transition-colors hover:border-white/5 hover:bg-surface-2/50">
        <Checkbox
          checked={done}
          onChange={() => onToggleComplete(task)}
          aria-label={done ? 'Mark incomplete' : 'Mark complete'}
          className="mt-0.5"
        />

        <div className="min-w-0 flex-1">
          <button
            type="button"
            onClick={() => onEdit(task)}
            className="focus-ring block w-full truncate rounded text-left text-sm"
          >
            <span className={cn(done ? 'text-text-muted line-through' : 'text-text-primary')}>
              {task.title}
            </span>
          </button>

          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-text-muted">
            {hasEffort && (
              <span className="inline-flex items-center gap-1 font-mono">
                <Clock className="h-3 w-3" aria-hidden />
                {formatMinutes(task.effort_minutes as number)}
              </span>
            )}
            {prio.dot && (
              <span className={cn('inline-flex items-center gap-1', prio.text)}>
                <span className={cn('h-1.5 w-1.5 rounded-full', prio.dot)} />
                {prio.label}
              </span>
            )}
            {showSchedule && task.scheduled_for && (
              <span className="inline-flex items-center gap-1">{formatDateShort(task.scheduled_for)}</span>
            )}
            {task.due_date && (
              <span className="inline-flex items-center gap-1 text-warning/90">
                due {formatDateShort(task.due_date)}
              </span>
            )}
            {expandable && (
              <button
                type="button"
                onClick={() => setExpanded((v) => !v)}
                className="focus-ring inline-flex items-center gap-1 rounded hover:text-text-primary"
              >
                {expanded ? (
                  <ChevronDown className="h-3 w-3" aria-hidden />
                ) : (
                  <ChevronRight className="h-3 w-3" aria-hidden />
                )}
                Subtasks
              </button>
            )}
          </div>
        </div>

        <div className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover/row:opacity-100">
          {onScheduleToday && (
            <IconButton title="Schedule for today" onClick={() => onScheduleToday(task)}>
              <CalendarPlus className="h-4 w-4" aria-hidden />
            </IconButton>
          )}
          {onUnschedule && (
            <IconButton title="Remove from today" onClick={() => onUnschedule(task)}>
              <CalendarX className="h-4 w-4" aria-hidden />
            </IconButton>
          )}
          <IconButton title="Edit task" onClick={() => onEdit(task)}>
            <Pencil className="h-4 w-4" aria-hidden />
          </IconButton>
          <IconButton title="Delete task" onClick={() => onDelete(task)} danger>
            <Trash2 className="h-4 w-4" aria-hidden />
          </IconButton>
        </div>
      </div>

      {expandable && expanded && (
        <div className="ml-9 mt-1 pb-2">
          <SubtaskList taskId={task.id} />
        </div>
      )}
    </div>
  )
}
