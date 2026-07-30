import { useEffect, useState, type FormEvent } from 'react'
import { Button, Input, Modal, Select, Textarea } from '@/components/ui'
import type { Project, VisionCard } from '@/types/database'
import { MAX_VISION_TITLE, MAX_VISION_WHY, validateVisionCard } from '../vision'

const labelCls = 'flex flex-col gap-1.5 text-xs font-medium text-text-muted'

/**
 * Add / edit a goal. Free text only — the app never interprets what is written
 * here, and nothing on this form is required except the name.
 *
 * The target date is optional and stays optional. A goal without a date is still
 * a goal, and forcing one would turn "what I'm working toward" into another
 * deadline list, which the app already has.
 */
export function VisionCardDialog({
  open,
  onClose,
  card,
  projects,
  onSave,
}: {
  open: boolean
  onClose: () => void
  /** Present when editing. */
  card?: VisionCard | null
  projects: Project[]
  onSave: (draft: {
    title: string
    why: string | null
    target_date: string | null
    project_id: string | null
  }) => void
}) {
  const isEdit = !!card
  const [title, setTitle] = useState('')
  const [why, setWhy] = useState('')
  const [targetDate, setTargetDate] = useState('')
  const [projectId, setProjectId] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setError(null)
    setTitle(card?.title ?? '')
    setWhy(card?.why ?? '')
    setTargetDate(card?.target_date ?? '')
    setProjectId(card?.project_id ?? '')
  }, [open, card])

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const draft = {
      title: title.trim(),
      why: why.trim() || null,
      target_date: targetDate || null,
      project_id: projectId || null,
    }
    const result = validateVisionCard(draft)
    if (!result.ok) {
      setError(result.error)
      return
    }
    setError(null)
    onSave(draft)
    onClose()
  }

  return (
    <Modal open={open} onClose={onClose} title={isEdit ? 'Edit goal' : 'Add a goal'}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4 p-5">
        <label className={labelCls}>
          What are you working toward?
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Run a half marathon"
            maxLength={MAX_VISION_TITLE}
            autoFocus
          />
        </label>

        <label className={labelCls}>
          Why does it matter? <span className="text-text-muted/60">(optional)</span>
          <Textarea
            value={why}
            onChange={(e) => setWhy(e.target.value)}
            placeholder="The reason you'll still want this in March."
            maxLength={MAX_VISION_WHY}
          />
        </label>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className={labelCls} htmlFor="vision-target">
            Target date <span className="text-text-muted/60">(optional)</span>
            <Input
              id="vision-target"
              type="date"
              value={targetDate}
              onChange={(e) => setTargetDate(e.target.value)}
            />
          </label>

          <label className={labelCls} htmlFor="vision-project">
            Served by a project <span className="text-text-muted/60">(optional)</span>
            <Select
              id="vision-project"
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
            >
              <option value="">Nothing yet</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </label>
        </div>

        {error && <p className="text-sm text-danger">{error}</p>}

        <div className="mt-1 flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit">{isEdit ? 'Save changes' : 'Add goal'}</Button>
        </div>
      </form>
    </Modal>
  )
}
