import { useState, type ReactNode } from 'react'
import {
  CalendarPlus,
  CalendarX,
  ChevronDown,
  ChevronRight,
  Clock,
  Pencil,
  Repeat,
  Target,
  Trash2,
} from 'lucide-react'
import type { Project, Task } from '@/types/database'
import { Badge, Checkbox } from '@/components/ui'
import { cn } from '@/lib/utils'
import { formatMinutes, formatDateShort } from '@/lib/format'
import { PRIORITY_META } from '../priority'
import { recurrenceLabel } from '../recurrence'
import { SubtaskList } from './SubtaskList'

interface TaskRowProps {
  task: Task
  onToggleComplete: (task: Task) => void
  onEdit: (task: Task) => void
  onDelete: (task: Task) => void
  onScheduleToday?: (task: Task) => void
  onUnschedule?: (task: Task) => void
  /** Start a focus session for this task. */
  onFocus?: (task: Task) => void
  /** Accumulated completed focus time for this task, in seconds. */
  focusSeconds?: number
  /** Show an expandable subtasks section (used in Project detail). */
  expandable?: boolean
  /** Show the scheduled-for badge (hidden on Today where it's implied). */
  showSchedule?: boolean
  /** The task's project — when set, render a project badge (Today / non-project views). */
  project?: Project
  /** Raised card tone for rows nested inside a surface panel (e.g. Projects
   *  sections) so the card still contrasts against the panel it sits on. */
  nested?: boolean
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
        // ≥44px touch target on mobile (row actions are tap targets); compact on desktop.
        'focus-ring inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg p-2 text-text-muted transition-colors hover:bg-surface-2/60 md:min-h-0 md:min-w-0 md:p-1.5',
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
  onFocus,
  focusSeconds = 0,
  expandable = false,
  showSchedule = true,
  project,
  nested = false,
}: TaskRowProps) {
  const [expanded, setExpanded] = useState(false)
  const done = task.status === 'done'
  const prio = PRIORITY_META[task.priority]
  const hasEffort = task.effort_minutes != null && task.effort_minutes > 0

  return (
    <div className="group/row">
      {/*
        THE ACTIONS TAKE THEIR OWN ROW ON MOBILE.

        Four IconButtons at `min-w-[44px]` are a hard 182px that never shrinks,
        and the title is the only `min-w-0 flex-1` child — so it absorbed the
        entire shortfall. At 390px "Client workshop prep" rendered as "Client ..."
        and "Review the launch copy" as "Revie...", on the Inbox, which is the
        app's capture surface. Wrapping is not enough on its own: a `flex-1`
        sibling has a hypothetical size of 0 and never forces a line break, so
        the action group needs `basis-full` to claim one.
      */}
      <div
        className={cn(
          'flex flex-wrap items-start gap-x-3 gap-y-1 rounded-xl border px-4 py-3 transition-colors',
          nested
            ? 'border-white/10 bg-surface-2/70 hover:border-white/20 hover:bg-surface-2'
            : 'border-white/5 bg-surface hover:border-white/10 hover:bg-surface-2',
        )}
      >
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
            className="tap-h-44 focus-ring block w-full truncate rounded text-left text-sm"
          >
            <span className={cn(done ? 'text-text-muted line-through' : 'text-text-primary')}>
              {task.title}
            </span>
          </button>

          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-text-muted">
            {project && (
              <Badge title={`Project: ${project.name}`} className="max-w-[10rem]">
                <span
                  className="h-1.5 w-1.5 shrink-0 rounded-full"
                  style={{ backgroundColor: project.color }}
                  aria-hidden
                />
                <span className="truncate">{project.name}</span>
              </Badge>
            )}
            {hasEffort && (
              <span className="inline-flex items-center gap-1 font-mono">
                <Clock className="h-3 w-3" aria-hidden />
                {formatMinutes(task.effort_minutes as number)}
              </span>
            )}
            {focusSeconds >= 60 && (
              <span className="inline-flex items-center gap-1 font-mono text-brand/80" title="Focused time">
                <Target className="h-3 w-3" aria-hidden />
                {formatMinutes(Math.round(focusSeconds / 60))}
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
            {task.recurrence_freq && (
              <span className="inline-flex items-center gap-1" title={recurrenceLabel(task)}>
                <Repeat className="h-3 w-3" aria-hidden />
              </span>
            )}
            {expandable && (
              <button
                type="button"
                onClick={() => setExpanded((v) => !v)}
                className="tap-44 focus-ring inline-flex items-center gap-1 rounded hover:text-text-primary"
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

        {/* Touch has no hover: show row actions by default on mobile, reveal on
            hover from md up. `basis-full` puts them on their own line below the
            title until there is room for both — see the note on the row. */}
        <div className="flex basis-full items-center justify-end gap-0.5 opacity-100 transition-opacity md:basis-auto md:justify-start md:opacity-0 md:group-hover/row:opacity-100">
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
          {onFocus && (
            <IconButton title="Focus on this task" onClick={() => onFocus(task)}>
              <Target className="h-4 w-4" aria-hidden />
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
