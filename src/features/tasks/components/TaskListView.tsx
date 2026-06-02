import { useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Task } from '@/types/database'
import { SortableList } from '@/components/common/SortableList'
import { newPositionForMove } from '@/lib/reorder'
import { useFocusSessions } from '@/features/focus/api/useFocusSessions'
import { focusSecondsByTask } from '@/features/focus/selectors'
import { TaskRow } from './TaskRow'
import { TaskDialog } from './TaskDialog'
import { useTaskMutations } from '../api/useTaskMutations'

interface TaskListViewProps {
  workspaceId: string
  /** Already filtered + sorted tasks for this view. */
  tasks: Task[]
  onScheduleToday?: (task: Task) => void
  onUnschedule?: (task: Task) => void
  expandable?: boolean
  showSchedule?: boolean
  emptyState?: ReactNode
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
  emptyState,
}: TaskListViewProps) {
  const navigate = useNavigate()
  const { toggleComplete, deleteTask, reorderTask } = useTaskMutations(workspaceId)
  const { data: focusSessions = [] } = useFocusSessions(workspaceId)
  const focusByTask = focusSecondsByTask(focusSessions)
  const [editing, setEditing] = useState<Task | null>(null)

  if (tasks.length === 0) {
    return emptyState ? <>{emptyState}</> : null
  }

  const ids = tasks.map((t) => t.id)

  return (
    <>
      <SortableList
        ids={ids}
        onReorder={(ordered, activeId) => {
          const positionById = new Map(tasks.map((t) => [t.id, t.position]))
          reorderTask.mutate({ id: activeId, position: newPositionForMove(ordered, activeId, positionById) })
        }}
        className="space-y-1"
      >
        {(id) => {
          const task = tasks.find((t) => t.id === id)
          if (!task) return null
          return (
            <TaskRow
              task={task}
              onToggleComplete={(t) =>
                toggleComplete.mutate({ id: t.id, done: t.status !== 'done' })
              }
              onEdit={setEditing}
              onDelete={(t) => deleteTask.mutate(t.id)}
              onScheduleToday={onScheduleToday}
              onUnschedule={onUnschedule}
              onFocus={(t) => navigate(`/focus?task=${t.id}`)}
              focusSeconds={focusByTask.get(task.id) ?? 0}
              expandable={expandable}
              showSchedule={showSchedule}
            />
          )
        }}
      </SortableList>

      <TaskDialog open={!!editing} onClose={() => setEditing(null)} task={editing} />
    </>
  )
}
