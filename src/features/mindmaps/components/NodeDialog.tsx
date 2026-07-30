import { useEffect, useState, type FormEvent } from 'react'
import { Button, Input, Modal, Select, Textarea } from '@/components/ui'
import { cn } from '@/lib/utils'
import type { MindMapNode, MindMapNodeColor, Project, Task } from '@/types/database'
import { MAX_NODE_NOTE, MAX_NODE_TITLE, NODE_COLORS, validateNode } from '../graph'

const labelCls = 'flex flex-col gap-1.5 text-xs font-medium text-text-muted'

/** Design tokens, never raw hex. */
const SWATCH: Record<MindMapNodeColor, string> = {
  brand: 'bg-brand',
  accent: 'bg-accent',
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-danger',
}
const COLOR_NAME: Record<MindMapNodeColor, string> = {
  brand: 'Violet',
  accent: 'Blue',
  success: 'Mint',
  warning: 'Amber',
  danger: 'Coral',
}

export interface NodeDraft {
  title: string
  note: string | null
  color: MindMapNodeColor
  projectId: string | null
  taskId: string | null
}

/**
 * Add / edit one idea.
 *
 * THE LINK IS THE POINT OF THIS DIALOG. A map of loose thoughts is a drawing;
 * "this idea IS that project" is the bit that connects it to the work. Both
 * links are optional and mutually exclusive — a node that claimed to be a
 * project AND a task would have two different places to navigate to, and the
 * badge could only show one.
 *
 * Only open tasks are offered. Linking an idea to something already finished is
 * almost always a mis-tap, and the list would otherwise fill up with history.
 */
export function NodeDialog({
  open,
  onClose,
  node,
  projects,
  tasks,
  onSave,
}: {
  open: boolean
  onClose: () => void
  /** Present when editing. */
  node?: MindMapNode | null
  projects: Project[]
  tasks: Task[]
  onSave: (draft: NodeDraft) => void
}) {
  const isEdit = !!node
  const [title, setTitle] = useState('')
  const [note, setNote] = useState('')
  const [color, setColor] = useState<MindMapNodeColor>('brand')
  /** One control for both link kinds: "project:<id>" | "task:<id>" | ''. */
  const [link, setLink] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setError(null)
    setTitle(node?.title ?? '')
    setNote(node?.note ?? '')
    setColor(node?.color ?? 'brand')
    setLink(
      node?.projectId ? `project:${node.projectId}` : node?.taskId ? `task:${node.taskId}` : '',
    )
  }, [open, node])

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const draft: NodeDraft = {
      title: title.trim(),
      note: note.trim() || null,
      color,
      projectId: link.startsWith('project:') ? link.slice(8) : null,
      taskId: link.startsWith('task:') ? link.slice(5) : null,
    }
    const result = validateNode(draft)
    if (!result.ok) {
      setError(result.error)
      return
    }
    setError(null)
    onSave(draft)
    onClose()
  }

  return (
    <Modal open={open} onClose={onClose} title={isEdit ? 'Edit idea' : 'Add an idea'}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4 p-5">
        <label className={labelCls}>
          The idea
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Launch the beta"
            maxLength={MAX_NODE_TITLE}
            autoFocus
          />
        </label>

        <label className={labelCls}>
          A note <span className="text-text-muted/60">(optional)</span>
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Anything you'd forget by next week."
            maxLength={MAX_NODE_NOTE}
          />
        </label>

        <fieldset className="flex flex-col gap-2">
          <legend className="text-xs font-medium text-text-muted">Colour</legend>
          <div className="flex flex-wrap gap-2">
            {NODE_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                aria-pressed={color === c}
                aria-label={COLOR_NAME[c]}
                className={cn(
                  'focus-ring h-9 w-9 rounded-xl border-2 transition-colors',
                  SWATCH[c],
                  color === c ? 'border-text-primary' : 'border-transparent opacity-70',
                )}
              />
            ))}
          </div>
        </fieldset>

        <label className={labelCls} htmlFor="node-link">
          This idea is… <span className="text-text-muted/60">(optional)</span>
          <Select id="node-link" value={link} onChange={(e) => setLink(e.target.value)}>
            <option value="">Just an idea</option>
            {projects.length > 0 && (
              <optgroup label="A project">
                {projects.map((p) => (
                  <option key={p.id} value={`project:${p.id}`}>
                    {p.name}
                  </option>
                ))}
              </optgroup>
            )}
            {tasks.length > 0 && (
              <optgroup label="A task">
                {tasks.map((t) => (
                  <option key={t.id} value={`task:${t.id}`}>
                    {t.title}
                  </option>
                ))}
              </optgroup>
            )}
          </Select>
          <span className="text-[11px] leading-relaxed text-text-muted/70">
            Linked ideas get a badge you can tap to open the real thing.
          </span>
        </label>

        {error && <p className="text-sm text-danger">{error}</p>}

        <div className="mt-1 flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit">{isEdit ? 'Save changes' : 'Add idea'}</Button>
        </div>
      </form>
    </Modal>
  )
}
