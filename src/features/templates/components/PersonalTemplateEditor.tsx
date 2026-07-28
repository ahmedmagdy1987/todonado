import { useCallback, useMemo, useState } from 'react'
import { Plus, Sparkles, Trash2 } from 'lucide-react'
import { Button, Input, Modal, Select } from '@/components/ui'
import { formatMinutes } from '@/lib/format'
import { cn } from '@/lib/utils'
import { EFFORT_PRESETS } from '@/features/tasks/effort'
import { useEffortSuggester } from '@/features/tasks/api/useEffortSuggester'
import { TEMPLATE_ICONS } from '../icons'
import {
  CAPTURE_FALLBACK_EFFORT,
  MAX_TEMPLATE_TASKS,
  MAX_TEMPLATE_TITLE,
  validatePersonalTemplate,
  type PersonalTemplateDraft,
} from '../personal'
import type { TemplateTask } from '../types'

const ICON_NAMES = Object.keys(TEMPLATE_ICONS).sort()

interface PersonalTemplateEditorProps {
  open: boolean
  workspaceId: string
  /** Pre-filled when editing, or captured from a project. */
  initial?: PersonalTemplateDraft
  title: string
  saving?: boolean
  onCancel: () => void
  onSave: (draft: PersonalTemplateDraft) => void
  /** Present only when editing an existing template. Deletes after a confirm. */
  onDelete?: () => void
}

const emptyDraft = (): PersonalTemplateDraft => ({
  title: '',
  description: null,
  icon: null,
  color: null,
  tasks: [{ title: '', effortMinutes: CAPTURE_FALLBACK_EFFORT }],
})

/**
 * Create / edit a personal template. Fully keyboard-operable: every control is a
 * real button, input or select, and the task rows use the SAME one-tap effort
 * chips and auto-effort suggester as QuickAdd — so estimating here feels
 * identical to estimating anywhere else in the app.
 *
 * Sections aren't editable here on purpose: the "Save as template" capture path
 * preserves a project's sections faithfully, and asking someone to hand-build
 * groups in a modal would be a worse version of a feature they already have.
 */
export function PersonalTemplateEditor({
  open,
  workspaceId,
  initial,
  title,
  saving = false,
  onCancel,
  onSave,
  onDelete,
}: PersonalTemplateEditorProps) {
  const [draft, setDraft] = useState<PersonalTemplateDraft>(() => initial ?? emptyDraft())
  const [error, setError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const suggester = useEffortSuggester(workspaceId)

  // Re-seed when the modal is opened for a different template.
  const seed = initial ? JSON.stringify(initial) : 'new'
  const [seenSeed, setSeenSeed] = useState(seed)
  if (seed !== seenSeed) {
    setSeenSeed(seed)
    setDraft(initial ?? emptyDraft())
    setError(null)
  }

  const set = useCallback(
    (patch: Partial<PersonalTemplateDraft>) => setDraft((d) => ({ ...d, ...patch })),
    [],
  )

  const setTask = (index: number, patch: Partial<TemplateTask>) =>
    setDraft((d) => ({
      ...d,
      tasks: d.tasks.map((t, i) => (i === index ? { ...t, ...patch } : t)),
    }))

  const addTask = () =>
    setDraft((d) => ({
      ...d,
      tasks: [...d.tasks, { title: '', effortMinutes: CAPTURE_FALLBACK_EFFORT }],
    }))

  const removeTask = (index: number) =>
    setDraft((d) => ({ ...d, tasks: d.tasks.filter((_, i) => i !== index) }))

  const totalMinutes = useMemo(
    () => draft.tasks.reduce((sum, t) => sum + (t.title.trim() ? t.effortMinutes : 0), 0),
    [draft.tasks],
  )

  function save() {
    const result = validatePersonalTemplate(draft)
    if (!result.ok) {
      setError(result.error)
      return
    }
    setError(null)
    onSave({ ...draft, tasks: draft.tasks.filter((t) => t.title.trim().length > 0) })
  }

  return (
    <Modal open={open} onClose={onCancel} title={title}>
      <div className="space-y-4 p-5">
        <div className="space-y-3">
          <div>
            <label htmlFor="tpl-title" className="mb-1 block text-xs font-medium text-text-muted">
              Name
            </label>
            <Input
              id="tpl-title"
              value={draft.title}
              maxLength={MAX_TEMPLATE_TITLE}
              placeholder="Monday routine"
              onChange={(e) => set({ title: e.target.value })}
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="tpl-desc" className="mb-1 block text-xs font-medium text-text-muted">
                Description <span className="text-text-muted/60">(optional)</span>
              </label>
              <Input
                id="tpl-desc"
                value={draft.description ?? ''}
                placeholder="How I start the week"
                onChange={(e) => set({ description: e.target.value || null })}
              />
            </div>
            <div>
              <label htmlFor="tpl-icon" className="mb-1 block text-xs font-medium text-text-muted">
                Icon <span className="text-text-muted/60">(optional)</span>
              </label>
              <Select
                id="tpl-icon"
                value={draft.icon ?? ''}
                onChange={(e) => set({ icon: e.target.value || null })}
              >
                <option value="">Default</option>
                {ICON_NAMES.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </Select>
            </div>
          </div>
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-medium text-text-muted">
              Tasks{' '}
              <span className="font-mono">
                ({draft.tasks.length}/{MAX_TEMPLATE_TASKS})
              </span>
            </p>
            <span className="font-mono text-xs text-text-muted">~{formatMinutes(totalMinutes)}</span>
          </div>

          <ul className="max-h-72 space-y-2 overflow-y-auto pr-1">
            {draft.tasks.map((task, i) => {
              const suggestion = task.title.trim() ? suggester(task.title, null) : null
              return (
                <li key={i} className="rounded-xl border border-white/5 bg-surface-2/40 p-2.5">
                  <div className="flex items-center gap-2">
                    <Input
                      value={task.title}
                      placeholder={`Task ${i + 1}`}
                      aria-label={`Task ${i + 1} title`}
                      onChange={(e) => setTask(i, { title: e.target.value })}
                    />
                    <button
                      type="button"
                      onClick={() => removeTask(i)}
                      aria-label={`Remove task ${i + 1}`}
                      className="focus-ring shrink-0 rounded-lg p-1.5 text-text-muted hover:bg-danger/10 hover:text-danger"
                    >
                      <Trash2 className="h-4 w-4" aria-hidden />
                    </button>
                  </div>
                  <div
                    className="mt-2 flex flex-wrap items-center gap-1.5"
                    role="group"
                    aria-label={`Effort for task ${i + 1}`}
                  >
                    {EFFORT_PRESETS.map((minutes) => (
                      <button
                        key={minutes}
                        type="button"
                        onClick={() => setTask(i, { effortMinutes: minutes })}
                        aria-pressed={task.effortMinutes === minutes}
                        className={cn(
                          'focus-ring rounded-lg border px-2 py-1 font-mono text-xs transition-colors',
                          task.effortMinutes === minutes
                            ? 'border-brand/50 bg-brand-gradient-soft text-text-primary'
                            : 'border-white/10 text-text-muted hover:text-text-primary',
                        )}
                      >
                        {formatMinutes(minutes)}
                      </button>
                    ))}
                    {suggestion && suggestion.minutes !== task.effortMinutes && (
                      <button
                        type="button"
                        onClick={() => setTask(i, { effortMinutes: suggestion.minutes })}
                        className="focus-ring inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-brand hover:underline"
                        title={`Based on ${suggestion.sampleCount} similar ${suggestion.sampleCount === 1 ? 'task' : 'tasks'} you've completed`}
                      >
                        <Sparkles className="h-3 w-3" aria-hidden />
                        Suggest {formatMinutes(suggestion.minutes)}
                      </button>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>

          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="mt-2"
            onClick={addTask}
            disabled={draft.tasks.length >= MAX_TEMPLATE_TASKS}
          >
            <Plus className="h-4 w-4" aria-hidden /> Add task
          </Button>
        </div>

        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}

        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-white/5 pt-4">
          {onDelete &&
            (confirmDelete ? (
              <div className="mr-auto flex items-center gap-2">
                <span className="text-xs text-text-muted">Delete this template?</span>
                <Button type="button" variant="danger" size="sm" onClick={onDelete}>
                  Delete
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setConfirmDelete(false)}
                >
                  Keep
                </Button>
              </div>
            ) : (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="mr-auto text-danger"
                onClick={() => setConfirmDelete(true)}
              >
                <Trash2 className="h-4 w-4" aria-hidden /> Delete
              </Button>
            ))}
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="button" onClick={save} loading={saving}>
            Save template
          </Button>
        </div>
      </div>
    </Modal>
  )
}
