import { useState, type FormEvent } from 'react'
import { Plus } from 'lucide-react'
import { Input } from '@/components/ui'

/**
 * Column-scoped quick capture.
 *
 * The app's QuickAdd renders its full effort-chip row and date picker inline,
 * which is right for a full-width list and completely swamps a seventh-of-screen
 * column. This collapses to a single "+ Add" until used, then takes a title and
 * hands it up — the caller applies the auto-effort suggestion, so a task added
 * here still lands effort-tagged and the day's meter still moves.
 */
export function WeekQuickAdd({
  onAdd,
  dayLabel,
}: {
  onAdd: (title: string) => void
  dayLabel: string
}) {
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')

  function submit(e: FormEvent) {
    e.preventDefault()
    const trimmed = title.trim()
    if (!trimmed) return
    onAdd(trimmed)
    setTitle('')
    // Stay open: adding several tasks to one day is the common case.
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`Add a task to ${dayLabel}`}
        className="focus-ring flex min-h-[44px] w-full items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs text-text-muted transition-colors hover:bg-surface-2/60 hover:text-text-primary md:min-h-0"
      >
        <Plus className="h-3.5 w-3.5" aria-hidden />
        Add
      </button>
    )
  }

  return (
    <form onSubmit={submit}>
      <Input
        autoFocus
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onBlur={() => !title.trim() && setOpen(false)}
        placeholder="Task…"
        aria-label={`New task for ${dayLabel}`}
        className="h-8 text-xs"
      />
    </form>
  )
}
