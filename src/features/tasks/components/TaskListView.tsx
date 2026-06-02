import { useState, type ReactNode } from 'react'
import type { Task } from '@/types/database'
import { SortableList } from '@/components/common/SortableList'
import { newPositionForMove } from '@/lib/reorder'
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
 * Shared task list: drag-to-reorder + complete/edit/delete, with the edit
 * dialog wired in. Reordering persists `position` for the visible subset
 * (each view sorts within its own subset, so subset-local positions are fine).
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
  const { toggleComplete, deleteTask, reorderTask } = useTaskMutations(workspaceId)
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
        className="space-y-0.5"
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
