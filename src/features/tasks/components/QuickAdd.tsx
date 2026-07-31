import { useMemo, useState, type FormEvent } from 'react'
import { Plus, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui'
import { cn } from '@/lib/utils'
import { formatMinutes } from '@/lib/format'
import { track } from '@/features/analytics/track'
import { EFFORT_PRESETS, parseEffortInput, toggleEffortPreset } from '../effort'
import { isEffortPreset } from '../autoEffort'
import type { EffortSuggester } from '../api/useEffortSuggester'
import { LIMITS } from '@/lib/limits'

export interface QuickAddValue {
  title: string
  effort_minutes: number | null
  due_date: string | null
}

interface QuickAddProps {
  onAdd: (value: QuickAddValue) => void
  placeholder?: string
  autoFocus?: boolean
  /** Optional effort suggester; when set, shows a one-tap "Suggest Xm" chip while
   *  no estimate has been entered. Tapping it fills (never silently sets) effort. */
  suggest?: EffortSuggester
}

const chipClass = (active: boolean) =>
  cn(
    // ≥44px tap target on mobile (effort chips are frequent taps); compact on desktop.
    'focus-ring inline-flex min-h-[44px] items-center rounded-lg px-2.5 py-1 text-xs font-medium transition-colors md-fine:min-h-0',
    active
      ? 'bg-brand-gradient text-white'
      : 'bg-surface-2/60 text-text-muted hover:text-text-primary',
  )

/**
 * Fast capture: type a title and press Enter. Effort is one tap via the chips
 * (15/30/60/90/120 or a custom value) — optional, but the low-friction default
 * path, because the capacity meter is only as good as the estimates it's fed.
 */
export function QuickAdd({ onAdd, placeholder = 'Add a task…', autoFocus, suggest }: QuickAddProps) {
  const [title, setTitle] = useState('')
  const [effort, setEffort] = useState<number | null>(null)
  const [customOpen, setCustomOpen] = useState(false)
  const [customValue, setCustomValue] = useState('')
  const [due, setDue] = useState('')

  // Only suggest while no estimate is set yet (the chip disappears once chosen).
  const suggestion = useMemo(
    () => (suggest && effort === null ? suggest(title) : null),
    [suggest, title, effort],
  )

  function acceptSuggestion(minutes: number) {
    track('effort_entered', { source: 'suggestion', flag: true })
    if (isEffortPreset(minutes)) {
      setCustomOpen(false)
      setCustomValue('')
      setEffort(minutes)
    } else {
      // Non-preset value: open the custom field so the number stays visible/editable.
      setCustomOpen(true)
      setCustomValue(String(minutes))
      setEffort(minutes)
    }
  }

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
          maxLength={LIMITS.taskTitle}
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
            className="focus-ring inline-flex min-h-[44px] items-center gap-1 rounded-lg border border-dashed border-brand/50 px-2.5 py-1 text-xs font-medium text-brand transition-colors hover:bg-brand/10 md-fine:min-h-0"
          >
            <Sparkles className="h-3 w-3" aria-hidden /> Suggest {formatMinutes(suggestion.minutes)}
          </button>
        )}
        <span className="mx-1 hidden h-4 w-px bg-white/10 sm:block" aria-hidden />
        <input
          value={due}
          onChange={(e) => setDue(e.target.value)}
          type="date"
          aria-label="Due date"
          className="min-h-[44px] md-fine:min-h-0 focus-ring h-7 rounded-lg border border-white/10 bg-surface-2/60 px-2 text-xs text-text-muted"
        />
      </div>
    </form>
  )
}
