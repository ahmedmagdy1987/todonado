import { useState, type FormEvent } from 'react'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui'
import { cn } from '@/lib/utils'
import { formatMinutes } from '@/lib/format'
import { EFFORT_PRESETS, parseEffortInput, toggleEffortPreset } from '../effort'

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

const chipClass = (active: boolean) =>
  cn(
    'focus-ring rounded-lg px-2.5 py-1 text-xs font-medium transition-colors',
    active
      ? 'bg-brand-gradient text-white'
      : 'bg-surface-2/60 text-text-muted hover:text-text-primary',
  )

/**
 * Fast capture: type a title and press Enter. Effort is one tap via the chips
 * (15/30/60/90/120 or a custom value) — optional, but the low-friction default
 * path, because the capacity meter is only as good as the estimates it's fed.
 */
export function QuickAdd({ onAdd, placeholder = 'Add a task…', autoFocus }: QuickAddProps) {
  const [title, setTitle] = useState('')
  const [effort, setEffort] = useState<number | null>(null)
  const [customOpen, setCustomOpen] = useState(false)
  const [customValue, setCustomValue] = useState('')
  const [due, setDue] = useState('')

  function reset() {
    setTitle('')
    setEffort(null)
    setCustomOpen(false)
    setCustomValue('')
    setDue('')
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const trimmed = title.trim()
    if (!trimmed) return
    onAdd({ title: trimmed, effort_minutes: effort, due_date: due || null })
    reset()
  }

  function selectPreset(min: number) {
    setCustomOpen(false)
    setCustomValue('')
    setEffort((cur) => toggleEffortPreset(cur, min))
  }

  function changeCustom(v: string) {
    setCustomValue(v)
    setEffort(parseEffortInput(v))
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-2xl border border-white/10 bg-surface px-3 py-2.5 shadow-elevation"
    >
      <div className="flex items-center gap-2">
        <Plus className="ml-1 h-4 w-4 shrink-0 text-text-muted" aria-hidden />
        <input
          autoFocus={autoFocus}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={placeholder}
          aria-label="Task title"
          className="h-10 min-w-[8rem] flex-1 bg-transparent px-1 text-sm text-text-primary placeholder:text-text-muted/70 focus:outline-none"
        />
        <Button type="submit" size="sm" disabled={!title.trim()}>
          Add
        </Button>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-1.5 pl-7">
        <span className="text-xs text-text-muted">Effort</span>
        {EFFORT_PRESETS.map((min) => (
          <button
            key={min}
            type="button"
            onClick={() => selectPreset(min)}
            aria-pressed={effort === min && !customOpen}
            className={chipClass(effort === min && !customOpen)}
          >
            {formatMinutes(min)}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setCustomOpen((o) => !o)}
          aria-pressed={customOpen}
          className={chipClass(customOpen)}
        >
          Custom
        </button>
        {customOpen && (
          <input
            value={customValue}
            onChange={(e) => changeCustom(e.target.value)}
            type="number"
            min={0}
            step={5}
            placeholder="min"
            aria-label="Custom effort in minutes"
            autoFocus
            className="focus-ring h-7 w-16 rounded-lg border border-white/10 bg-surface-2/60 px-2 text-xs text-text-primary placeholder:text-text-muted/60"
          />
        )}
        <span className="mx-1 hidden h-4 w-px bg-white/10 sm:block" aria-hidden />
        <input
          value={due}
          onChange={(e) => setDue(e.target.value)}
          type="date"
          aria-label="Due date"
          className="focus-ring h-7 rounded-lg border border-white/10 bg-surface-2/60 px-2 text-xs text-text-muted"
        />
      </div>
    </form>
  )
}
