import { useState, type FormEvent } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { Checkbox } from '@/components/ui'
import { SortableList } from '@/components/common/SortableList'
import { cn } from '@/lib/utils'
import { useSubtasks, useSubtaskMutations } from '../api/useSubtasks'

export function SubtaskList({ taskId }: { taskId: string }) {
  const { data: subtasks = [], isPending } = useSubtasks(taskId)
  const { addSubtask, toggleSubtask, deleteSubtask, reorderSubtasks } = useSubtaskMutations(taskId)
  const [title, setTitle] = useState('')

  function handleAdd(e: FormEvent) {
    e.preventDefault()
    const t = title.trim()
    if (!t) return
    addSubtask.mutate({ task_id: taskId, title: t, position: subtasks.length })
    setTitle('')
  }

  const ids = subtasks.map((s) => s.id)

  return (
    <div className="space-y-0.5 border-l border-white/5 pl-3">
      {!isPending && (
        <SortableList ids={ids} onReorder={(ordered) => reorderSubtasks.mutate(ordered)} className="space-y-0.5">
          {(id) => {
            const s = subtasks.find((x) => x.id === id)
            if (!s) return null
            return (
              <div className="group/row flex items-center gap-2 py-0.5">
                <Checkbox
                  checked={s.done}
                  onChange={(c) => toggleSubtask.mutate({ id: s.id, done: c })}
                  className="h-4 w-4"
                  aria-label={s.done ? 'Mark subtask incomplete' : 'Mark subtask complete'}
                />
                <span className={cn('flex-1 text-sm', s.done && 'text-text-muted line-through')}>
                  {s.title}
                </span>
                <button
                  type="button"
                  onClick={() => deleteSubtask.mutate(s.id)}
                  aria-label="Delete subtask"
                  className="focus-ring rounded p-1 text-text-muted opacity-0 transition-opacity hover:text-danger group-hover/row:opacity-100"
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden />
                </button>
              </div>
            )
          }}
        </SortableList>
      )}
      <form onSubmit={handleAdd} className="flex items-center gap-2 pt-1">
        <Plus className="h-3.5 w-3.5 text-text-muted" aria-hidden />
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Add subtask…"
          aria-label="Add subtask"
          className="flex-1 bg-transparent text-sm text-text-primary placeholder:text-text-muted/60 focus:outline-none"
        />
      </form>
    </div>
  )
}
