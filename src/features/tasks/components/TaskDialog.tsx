import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { z } from 'zod'
import { Sparkles } from 'lucide-react'
import { Button, Input, Modal, Select, Textarea } from '@/components/ui'
import { useWorkspace } from '@/features/workspace/workspace-context'
import { useProjects } from '@/features/projects/api/useProjects'
import { useSections } from '@/features/projects/api/useSections'
import { track } from '@/features/analytics/track'
import { todayISO, isoDateOffset } from '@/lib/date'
import { cn } from '@/lib/utils'
import { formatMinutes } from '@/lib/format'
import type { RecurrenceFreq, Task, TaskPriority } from '@/types/database'
import { PRIORITY_LABELS } from '../priority'
import { useTaskMutations } from '../api/useTaskMutations'
import { useEffortSuggester } from '../api/useEffortSuggester'
import { anchorForSave } from '../recurrence'
import { LIMITS } from '@/lib/limits'

const formSchema = z.object({
  title: z.string().trim().min(1, 'Title is required'),
  recurInterval: z.number().int().min(1, 'Repeat interval must be at least 1'),
})

const WEEKDAYS: { value: number; label: string }[] = [
  { value: 0, label: 'S' },
  { value: 1, label: 'M' },
  { value: 2, label: 'T' },
  { value: 3, label: 'W' },
  { value: 4, label: 'T' },
  { value: 5, label: 'F' },
  { value: 6, label: 'S' },
]

const FREQ_UNIT: Record<RecurrenceFreq, string> = {
  daily: 'days',
  weekly: 'weeks',
  monthly: 'months',
  yearly: 'years',
}

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
  const suggester = useEffortSuggester(workspaceId)
  const isEdit = !!task

  const [title, setTitle] = useState('')
  const [notes, setNotes] = useState('')
  const [effort, setEffort] = useState('')
  const [priority, setPriority] = useState<TaskPriority>(0)
  const [due, setDue] = useState('')
  const [scheduled, setScheduled] = useState('')
  const [projectId, setProjectId] = useState('')
  const [sectionId, setSectionId] = useState('')
  const [recurFreq, setRecurFreq] = useState<'' | RecurrenceFreq>('')
  const [recurInterval, setRecurInterval] = useState('1')
  const [recurWeekdays, setRecurWeekdays] = useState<number[]>([])
  const [recurUntil, setRecurUntil] = useState('')
  /**
   * The series' stable anchor, carried through an edit rather than recomputed.
   * See the write below — this is what keeps a 31st-of-the-month task on the
   * 31st after February has clamped one occurrence to the 28th.
   */
  const [recurAnchor, setRecurAnchor] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const { data: sections = [] } = useSections(projectId)

  // Suggest an effort estimate only while the field is empty (history → heuristic);
  // it's always a one-tap chip the user accepts/overrides — never set silently.
  const suggestion = useMemo(
    () => (effort.trim() === '' ? suggester(title, projectId || null) : null),
    [suggester, title, projectId, effort],
  )

  function acceptSuggestion(minutes: number) {
    setEffort(String(minutes))
    track('effort_entered', { source: 'suggestion', flag: true })
  }

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
      setRecurFreq(task.recurrence_freq ?? '')
      setRecurInterval(String(task.recurrence_interval || 1))
      setRecurWeekdays(task.recurrence_weekdays ?? [])
      setRecurUntil(task.recurrence_until ?? '')
      setRecurAnchor(task.recurrence_anchor ?? null)
    } else {
      setRecurAnchor(null)
      setTitle('')
      setNotes('')
      setEffort('')
      setPriority(0)
      setDue('')
      setScheduled(defaults?.scheduled_for ?? '')
      setProjectId(defaults?.project_id ?? '')
      setSectionId(defaults?.section_id ?? '')
      setRecurFreq('')
      setRecurInterval('1')
      setRecurWeekdays([])
      setRecurUntil('')
    }
    // Depend on primitive default fields (not the `defaults` object identity) so
    // an inline-literal `defaults` prop can't reset the form on every render.
  }, [open, task, defaults?.scheduled_for, defaults?.project_id, defaults?.section_id])

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const intervalNum = Math.max(1, Math.floor(Number(recurInterval) || 1))
    const parsed = formSchema.safeParse({ title, recurInterval: recurFreq ? intervalNum : 1 })
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Invalid input')
      return
    }
    if (recurFreq === 'weekly' && recurWeekdays.length === 0) {
      setError('Pick at least one weekday for a weekly repeat.')
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
      recurrence_freq: recurFreq || null,
      recurrence_interval: recurFreq ? intervalNum : 1,
      recurrence_weekdays:
        recurFreq === 'weekly' && recurWeekdays.length > 0
          ? [...recurWeekdays].sort((a, b) => a - b)
          : null,
      recurrence_until: recurFreq && recurUntil ? recurUntil : null,
      // Anchor monthly/yearly to the chosen start date so the day-of-month is
      // preserved across occurrences (see recurrence.ts). Null when non-recurring.
      // See `anchorForSave` — the decision is pure and unit-tested there,
      // because getting it wrong walks a monthly series backwards for ever.
      recurrence_anchor: anchorForSave({
        recurring: !!recurFreq,
        existingAnchor: recurAnchor,
        previous: task
          ? { scheduled: task.scheduled_for ?? null, due: task.due_date ?? null }
          : null,
        next: { scheduled: scheduled || null, due: due || null },
      }),
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
            maxLength={LIMITS.taskTitle}
            autoFocus
          />
        </label>

        <label className={labelCls}>
          Notes
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Details, links, context…"
            maxLength={LIMITS.taskNotes}
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
            {suggestion && (
              <button
                type="button"
                onClick={() => acceptSuggestion(suggestion.minutes)}
                title={
                  suggestion.basis === 'history'
                    ? `Based on ${suggestion.sampleCount} similar ${suggestion.sampleCount === 1 ? 'task' : 'tasks'} you've completed`
                    : 'A quick starting estimate'
                }
                aria-label={`Suggest ${suggestion.minutes} minutes${
                  suggestion.basis === 'history' ? ', based on your similar tasks' : ', a quick estimate'
                }`}
                className="focus-ring mt-1 inline-flex w-fit items-center gap-1 rounded-lg border border-dashed border-brand/50 px-2.5 py-1 text-xs font-medium text-brand transition-colors hover:bg-brand/10"
              >
                <Sparkles className="h-3 w-3" aria-hidden /> Suggest {formatMinutes(suggestion.minutes)}
              </button>
            )}
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

        <div className="space-y-3 rounded-xl border border-white/5 bg-surface-2/30 p-3">
          <label className={labelCls}>
            Repeat
            <Select
              value={recurFreq}
              onChange={(e) => setRecurFreq(e.target.value as '' | RecurrenceFreq)}
            >
              <option value="">Doesn&rsquo;t repeat</option>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
              <option value="yearly">Yearly</option>
            </Select>
          </label>

          {recurFreq && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <label className={labelCls}>
                  Every
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      min={1}
                      value={recurInterval}
                      onChange={(e) => setRecurInterval(e.target.value)}
                      className="w-20"
                      aria-label="Repeat interval"
                    />
                    <span className="text-sm text-text-muted">{FREQ_UNIT[recurFreq]}</span>
                  </div>
                </label>
                <label className={labelCls}>
                  Until (optional)
                  <Input
                    type="date"
                    value={recurUntil}
                    onChange={(e) => setRecurUntil(e.target.value)}
                  />
                </label>
              </div>

              {recurFreq === 'weekly' && (
                <div className="space-y-1.5">
                  <span className="text-xs font-medium text-text-muted">On days</span>
                  <div className="flex flex-wrap gap-1.5">
                    {WEEKDAYS.map((wd, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() =>
                          setRecurWeekdays((prev) =>
                            prev.includes(wd.value)
                              ? prev.filter((d) => d !== wd.value)
                              : [...prev, wd.value],
                          )
                        }
                        aria-pressed={recurWeekdays.includes(wd.value)}
                        className={cn(
                          'focus-ring h-8 w-8 rounded-lg text-xs font-medium transition-colors',
                          recurWeekdays.includes(wd.value)
                            ? 'bg-brand-gradient text-white'
                            : 'bg-surface-2 text-text-muted hover:text-text-primary',
                        )}
                      >
                        {wd.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </>
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
