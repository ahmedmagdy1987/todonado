import { useState, type FormEvent } from 'react'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui'

export interface QuickAddValue {
  title: string
  effort_minutes: number | null
  due_date: string | null
}

interface QuickAddProps {
  onAdd: (value: QuickAddValue) => void
  placeholder?: string
  autoFocus?: boolean
}

/** Fast capture: type a title and press Enter. Effort + due are optional. */
export function QuickAdd({ onAdd, placeholder = 'Add a task…', autoFocus }: QuickAddProps) {
  const [title, setTitle] = useState('')
  const [effort, setEffort] = useState('')
  const [due, setDue] = useState('')

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const trimmed = title.trim()
    if (!trimmed) return
    const n = Number(effort)
    const effort_minutes =
      effort.trim() === '' || !Number.isFinite(n) ? null : Math.max(0, Math.round(n))
    onAdd({ title: trimmed, effort_minutes, due_date: due || null })
    setTitle('')
    setEffort('')
    setDue('')
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-wrap items-center gap-2 rounded-2xl border border-white/10 bg-surface p-2 shadow-elevation"
    >
      <Plus className="ml-1 h-4 w-4 shrink-0 text-text-muted" aria-hidden />
      <input
        autoFocus={autoFocus}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder={placeholder}
        aria-label="Task title"
        className="min-w-[10rem] flex-1 bg-transparent px-1 text-sm text-text-primary placeholder:text-text-muted/70 focus:outline-none"
      />
      <input
        value={effort}
        onChange={(e) => setEffort(e.target.value)}
        type="number"
        min={0}
        step={5}
        placeholder="min"
        aria-label="Effort in minutes"
        className="focus-ring w-16 rounded-lg border border-white/10 bg-surface-2/60 px-2 py-1 text-sm text-text-primary placeholder:text-text-muted/60"
      />
      <input
        value={due}
        onChange={(e) => setDue(e.target.value)}
        type="date"
        aria-label="Due date"
        className="focus-ring rounded-lg border border-white/10 bg-surface-2/60 px-2 py-1 text-sm text-text-muted"
      />
      <Button type="submit" size="sm" disabled={!title.trim()}>
        Add
      </Button>
    </form>
  )
}
