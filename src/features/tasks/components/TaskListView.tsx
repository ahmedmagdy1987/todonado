import { useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Task } from '@/types/database'
import { SortableList } from '@/components/common/SortableList'
import { newPositionForMove } from '@/lib/reorder'
import { useFocusSessions } from '@/features/focus/api/useFocusSessions'
import { focusSecondsByTask } from '@/features/focus/selectors'
import { useProjects } from '@/features/projects/api/useProjects'
import { useToast } from '@/components/common/toast-context'
import { formatDateShort } from '@/lib/format'
import { TaskRow } from './TaskRow'
import { TaskDialog } from './TaskDialog'
import { TaskListToolbar } from './TaskListToolbar'
import { useTaskMutations } from '../api/useTaskMutations'
import { useTaskViewPrefs } from '../useTaskViewPrefs'
import { applyTaskView } from '../sort'
import { nextOccurrenceDate } from '../recurrence'

interface TaskListViewProps {
  workspaceId: string
  /** Already filtered + sorted tasks for this view. */
  tasks: Task[]
  onScheduleToday?: (task: Task) => void
  onUnschedule?: (task: Task) => void
  expandable?: boolean
  showSchedule?: boolean
  /** Show each task's project badge (Today / non-project views); off in project views where it's redundant. */
  showProjectBadge?: boolean
  /** Raised card tone for lists rendered inside a surface panel (e.g. Projects sections). */
  nested?: boolean
  emptyState?: ReactNode
  /**
   * Enables the per-view sort + priority-filter toolbar and remembers the choice
   * under this key (e.g. 'today', 'inbox', 'section:<id>'). Omit to render a plain
   * manual-order list with no toolbar (backward compatible).
   */
  viewKey?: string
}

/**
 * Shared task list: drag-to-reorder + complete/edit/delete/focus, with the edit
 * dialog wired in. Reordering updates only the dragged task's fractional
 * position, so sibling views that share a task are never reshuffled.
 */
export function TaskListView({
  workspaceId,
  tasks,
  onScheduleToday,
  onUnschedule,
  expandable = false,
  showSchedule = true,
  showProjectBadge = true,
  nested = false,
  emptyState,
  viewKey,
}: TaskListViewProps) {
  const navigate = useNavigate()
  const toast = useToast()
  const { toggleComplete, deleteTask, reorderTask } = useTaskMutations(workspaceId)
  const { data: focusSessions = [] } = useFocusSessions(workspaceId)
  const focusByTask = focusSecondsByTask(focusSessions)
  const { data: projects = [] } = useProjects(workspaceId)
  const projectsById = new Map(projects.map((p) => [p.id, p]))
  const [editing, setEditing] = useState<Task | null>(null)
  const { sortMode, priorityFilter, setSortMode, setPriorityFilter } = useTaskViewPrefs(viewKey)

  if (tasks.length === 0) {
    return emptyState ? <>{emptyState}</> : null
  }

  // Apply the per-view sort + filter (manual order when no viewKey). Manual mode
  // keeps drag-to-reorder; any computed sort disables it (you can't hand-order a
  // sorted list).
  const view = viewKey ? applyTaskView(tasks, { sortMode, priorityFilter }) : tasks
  const dragEnabled = !viewKey || sortMode === 'manual'
  const showToolbar = !!viewKey && tasks.length >= 2
  const ids = view.map((t) => t.id)

  const toolbar = showToolbar ? (
    <div className="mb-3">
      <TaskListToolbar
        sortMode={sortMode}
        onSortMode={setSortMode}
        priorityFilter={priorityFilter}
        onPriorityFilter={setPriorityFilter}
      />
    </div>
  ) : null

  // Tasks exist but the priority filter hides them all — not the same as "empty".
  if (view.length === 0) {
    return (
      <>
        {toolbar}
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-white/5 bg-surface/50 py-10 text-center">
          <p className="text-sm text-text-muted">No tasks match this filter.</p>
          <button
            type="button"
            onClick={() => setPriorityFilter('all')}
            className="focus-ring rounded text-xs text-accent hover:underline"
          >
            Clear filter
          </button>
        </div>
        <TaskDialog open={!!editing} onClose={() => setEditing(null)} task={editing} />
      </>
    )
  }

  return (
    <>
      {toolbar}
      <SortableList
        ids={ids}
        disabled={!dragEnabled}
        onReorder={(ordered, activeId) => {
          const positionById = new Map(tasks.map((t) => [t.id, t.position]))
          reorderTask.mutate({ id: activeId, position: newPositionForMove(ordered, activeId, positionById) })
        }}
        className="space-y-2"
      >
        {(id) => {
          const task = view.find((t) => t.id === id)
          if (!task) return null
          return (
            <TaskRow
              task={task}
              onToggleComplete={(t) => {
                const willComplete = t.status !== 'done'
                toggleComplete.mutate(
                  { task: t, done: willComplete },
                  {
                    onSuccess: (result) => {
                      if (!willComplete || !t.recurrence_freq) return
                      const next = nextOccurrenceDate(t)
                      if (result.spawnedNext && next) {
                        toast.show(`↻ Next occurrence scheduled for ${formatDateShort(next)}`)
                      } else if (!result.spawnedNext && next === null) {
                        toast.show('↻ Recurrence finished: no more occurrences')
                      }
                    },
                  },
                )
              }}
              onEdit={setEditing}
              onDelete={(t) => deleteTask.mutate(t.id)}
              onScheduleToday={onScheduleToday}
              onUnschedule={onUnschedule}
              onFocus={(t) => navigate(`/focus?task=${t.id}`)}
              focusSeconds={focusByTask.get(task.id) ?? 0}
              expandable={expandable}
              showSchedule={showSchedule}
              nested={nested}
              project={
                showProjectBadge && task.project_id
                  ? projectsById.get(task.project_id)
                  : undefined
              }
            />
          )
        }}
      </SortableList>

      <TaskDialog open={!!editing} onClose={() => setEditing(null)} task={editing} />
    </>
  )
}
