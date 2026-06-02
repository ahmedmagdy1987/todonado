import { useEffect, useState, type FormEvent } from 'react'
import { z } from 'zod'
import { Button, Input, Modal, Select, Textarea } from '@/components/ui'
import { useWorkspace } from '@/features/workspace/workspace-context'
import { useProjects } from '@/features/projects/api/useProjects'
import { useSections } from '@/features/projects/api/useSections'
import { todayISO, isoDateOffset } from '@/lib/date'
import type { Task, TaskPriority } from '@/types/database'
import { PRIORITY_LABELS } from '../priority'
import { useTaskMutations } from '../api/useTaskMutations'

const formSchema = z.object({
  title: z.string().trim().min(1, 'Title is required'),
})

interface TaskDialogProps {
  open: boolean
  onClose: () => void
  /** When provided, the dialog edits this task; otherwise it creates a new one. */
  task?: Task | null
  /** Field defaults for creation (e.g. scheduled_for today, or a project/section). */
  defaults?: { scheduled_for?: string | null; project_id?: string | null; section_id?: string | null }
}

const labelCls = 'flex flex-col gap-1.5 text-xs font-medium text-text-muted'

export function TaskDialog({ open, onClose, task, defaults }: TaskDialogProps) {
  const { workspaceId } = useWorkspace()
  const { createTask, updateTask } = useTaskMutations(workspaceId)
  const { data: projects = [] } = useProjects(workspaceId)
  const isEdit = !!task

  const [title, setTitle] = useState('')
  const [notes, setNotes] = useState('')
  const [effort, setEffort] = useState('')
  const [priority, setPriority] = useState<TaskPriority>(0)
  const [due, setDue] = useState('')
  const [scheduled, setScheduled] = useState('')
  const [projectId, setProjectId] = useState('')
  const [sectionId, setSectionId] = useState('')
  const [error, setError] = useState<string | null>(null)

  const { data: sections = [] } = useSections(projectId)

  useEffect(() => {
    if (!open) return
    setError(null)
    if (task) {
      setTitle(task.title)
      setNotes(task.notes ?? '')
      setEffort(task.effort_minutes != null ? String(task.effort_minutes) : '')
      setPriority(task.priority)
      setDue(task.due_date ?? '')
      setScheduled(task.scheduled_for ?? '')
      setProjectId(task.project_id ?? '')
      setSectionId(task.section_id ?? '')
    } else {
      setTitle('')
      setNotes('')
      setEffort('')
      setPriority(0)
      setDue('')
      setScheduled(defaults?.scheduled_for ?? '')
      setProjectId(defaults?.project_id ?? '')
      setSectionId(defaults?.section_id ?? '')
    }
    // Depend on primitive default fields (not the `defaults` object identity) so
    // an inline-literal `defaults` prop can't reset the form on every render.
  }, [open, task, defaults?.scheduled_for, defaults?.project_id, defaults?.section_id])

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const parsed = formSchema.safeParse({ title })
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Invalid input')
      return
    }
    const n = Number(effort)
    const effort_minutes =
      effort.trim() === '' || !Number.isFinite(n) ? null : Math.max(0, Math.round(n))

    const payload = {
      title: title.trim(),
      notes: notes.trim() ? notes.trim() : null,
      effort_minutes,
      priority,
      due_date: due || null,
      scheduled_for: scheduled || null,
      project_id: projectId || null,
      section_id: projectId ? sectionId || null : null,
    }

    if (isEdit && task) {
      updateTask.mutate({ id: task.id, patch: payload })
    } else {
      createTask.mutate({ workspace_id: workspaceId, ...payload })
    }
    onClose()
  }

  return (
    <Modal open={open} onClose={onClose} title={isEdit ? 'Edit task' : 'New task'}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4 p-5">
        <label className={labelCls}>
          Title
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="What needs doing?"
            autoFocus
          />
        </label>

        <label className={labelCls}>
          Notes
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Details, links, context…"
          />
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className={labelCls}>
            Effort (minutes)
            <Input
              type="number"
              min={0}
              step={5}
              value={effort}
              onChange={(e) => setEffort(e.target.value)}
              placeholder="e.g. 30"
            />
          </label>
          <label className={labelCls}>
            Priority
            <Select
              value={priority}
              onChange={(e) => setPriority(Number(e.target.value) as TaskPriority)}
            >
              {([0, 1, 2, 3] as const).map((p) => (
                <option key={p} value={p}>
                  {PRIORITY_LABELS[p]}
                </option>
              ))}
            </Select>
          </label>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className={labelCls}>
            Due date
            <Input type="date" value={due} onChange={(e) => setDue(e.target.value)} />
          </label>
          <label className={labelCls}>
            Scheduled for
            <Input type="date" value={scheduled} onChange={(e) => setScheduled(e.target.value)} />
          </label>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={() => setScheduled(todayISO())}>
            Today
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setScheduled(isoDateOffset(1))}
          >
            Tomorrow
          </Button>
          {scheduled && (
            <Button type="button" variant="ghost" size="sm" onClick={() => setScheduled('')}>
              Clear schedule
            </Button>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className={labelCls}>
            Project
            <Select
              value={projectId}
              onChange={(e) => {
                setProjectId(e.target.value)
                setSectionId('')
              }}
            >
              <option value="">Inbox (no project)</option>
              {projects
                .filter((p) => p.status === 'active')
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
            </Select>
          </label>
          {projectId && (
            <label className={labelCls}>
              Section
              <Select value={sectionId} onChange={(e) => setSectionId(e.target.value)}>
                <option value="">No section</option>
                {sections.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </label>
          )}
        </div>

        {error && <p className="text-sm text-danger">{error}</p>}

        <div className="mt-1 flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit">{isEdit ? 'Save changes' : 'Add task'}</Button>
        </div>
      </form>
    </Modal>
  )
}
