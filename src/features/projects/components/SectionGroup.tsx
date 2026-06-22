import { useState, type FormEvent } from 'react'
import { Pencil, Trash2 } from 'lucide-react'
import type { Task } from '@/types/database'
import { Input } from '@/components/ui'
import { TaskListView } from '@/features/tasks/components/TaskListView'
import { QuickAdd } from '@/features/tasks/components/QuickAdd'
import { useTaskMutations } from '@/features/tasks/api/useTaskMutations'
import { todayISO } from '@/lib/date'

interface SectionGroupProps {
  workspaceId: string
  projectId: string
  sectionId: string | null
  title: string
  tasks: Task[]
  onRename?: (name: string) => void
  onDelete?: () => void
}

export function SectionGroup({
  workspaceId,
  projectId,
  sectionId,
  title,
  tasks,
  onRename,
  onDelete,
}: SectionGroupProps) {
  const { createTask, updateTask } = useTaskMutations(workspaceId)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(title)

  function commit() {
    const trimmed = draft.trim()
    if (trimmed && onRename) onRename(trimmed)
    setEditing(false)
  }

  const openCount = tasks.filter((t) => t.status !== 'done').length

  return (
    <div className="rounded-2xl border border-white/5 bg-surface p-4">
      <div className="mb-2 flex items-center gap-2">
        {editing && onRename ? (
          <form
            onSubmit={(e: FormEvent) => {
              e.preventDefault()
              commit()
            }}
            className="flex-1"
          >
            <Input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={commit}
              autoFocus
              className="h-8"
              aria-label="Section name"
            />
          </form>
        ) : (
          <h3 className="font-display text-sm font-semibold text-text-primary">{title}</h3>
        )}
        <span className="font-mono text-xs text-text-muted">{openCount}</span>
        <div className="ml-auto flex items-center gap-0.5">
          {onRename && !editing && (
            <button
              type="button"
              onClick={() => {
                setDraft(title)
                setEditing(true)
              }}
              aria-label="Rename section"
              className="focus-ring rounded-lg p-1.5 text-text-muted hover:text-text-primary"
            >
              <Pencil className="h-3.5 w-3.5" aria-hidden />
            </button>
          )}
          {onDelete && (
            <button
              type="button"
              onClick={onDelete}
              aria-label="Delete section"
              className="focus-ring rounded-lg p-1.5 text-text-muted hover:text-danger"
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden />
            </button>
          )}
        </div>
      </div>

      <TaskListView
        workspaceId={workspaceId}
        tasks={tasks}
        viewKey={`project:${projectId}:section:${sectionId ?? 'none'}`}
        expandable
        nested
        showProjectBadge={false}
        onScheduleToday={(t) => updateTask.mutate({ id: t.id, patch: { scheduled_for: todayISO() } })}
      />

      <div className="mt-2">
        <QuickAdd
          placeholder="Add task…"
          onAdd={(v) =>
            createTask.mutate({
              workspace_id: workspaceId,
              title: v.title,
              effort_minutes: v.effort_minutes,
              due_date: v.due_date,
              project_id: projectId,
              section_id: sectionId,
              position: tasks.length,
            })
          }
        />
      </div>
    </div>
  )
}
