import { useEffect, useState, type FormEvent } from 'react'
import { Button, Input, Modal, Textarea } from '@/components/ui'
import { useAuth } from '@/features/auth/auth-context'
import { cn } from '@/lib/utils'
import type { QuitHabit } from '@/types/database'
import { useQuitMutations } from '../api/useQuitMutations'
import { MAX_QUIT_NAME, MAX_QUIT_NOTES, MAX_QUIT_REPLACEMENT } from '../caps'
import { QUIT_PRESETS, REPLACEMENT_SUGGESTIONS } from '../presets'

const labelCls = 'flex flex-col gap-1.5 text-xs font-medium text-text-muted'

/**
 * Add / edit a habit being broken. Free-text fields only — the app never
 * interprets what is typed here.
 *
 * DAY ZERO IS NOT EDITABLE ON CREATE. A new habit starts now (the DB default
 * decides, so a skewed client clock can't hand out a head start). Editing an
 * existing one deliberately does not expose it either: the two legitimate ways
 * to move day zero are "I slipped" and the explicit reset, both of which bank
 * the completed run into the longest-streak record first. A free date field
 * would be a silent way to lose that record.
 */
export function QuitHabitDialog({
  open,
  onClose,
  habit,
}: {
  open: boolean
  onClose: () => void
  habit?: QuitHabit | null
}) {
  const { user } = useAuth()
  const { createHabit, updateHabit } = useQuitMutations(user?.id ?? '')
  const isEdit = !!habit

  const [presetKey, setPresetKey] = useState('custom')
  const [name, setName] = useState('')
  const [replacement, setReplacement] = useState('')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setError(null)
    if (habit) {
      setPresetKey(habit.preset_key)
      setName(habit.name)
      setReplacement(habit.replacement_action ?? '')
      setNotes(habit.notes ?? '')
    } else {
      setPresetKey('custom')
      setName('')
      setReplacement('')
      setNotes('')
    }
  }, [open, habit])

  /** Picking a preset fills the name only while it is still untouched/default. */
  function choosePreset(key: string, label: string) {
    setPresetKey(key)
    const current = name.trim()
    const isDefaulted = current === '' || QUIT_PRESETS.some((p) => p.label === current)
    if (isDefaulted) setName(key === 'custom' ? '' : label)
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) {
      setError('Give it a name so you can recognise it later.')
      return
    }
    const payload = {
      name: trimmed,
      preset_key: presetKey,
      replacement_action: replacement.trim() || null,
      notes: notes.trim() || null,
    }
    if (isEdit && habit) updateHabit.mutate({ id: habit.id, patch: payload })
    else createHabit.mutate(payload)
    onClose()
  }

  return (
    <Modal open={open} onClose={onClose} title={isEdit ? 'Edit habit' : 'Track a habit you’re quitting'}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4 p-5">
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-xs font-medium text-text-muted">What are you quitting?</legend>
          <div className="flex flex-wrap gap-2">
            {QUIT_PRESETS.map((p) => {
              const Icon = p.icon
              const active = presetKey === p.key
              return (
                <button
                  key={p.key}
                  type="button"
                  onClick={() => choosePreset(p.key, p.label)}
                  aria-pressed={active}
                  className={cn(
                    'focus-ring inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-medium transition-colors',
                    active
                      ? 'border-brand/40 bg-brand-gradient-soft text-brand'
                      : 'border-white/10 text-text-muted hover:bg-surface-2/60 hover:text-text-primary',
                  )}
                >
                  <Icon className="h-3.5 w-3.5" aria-hidden />
                  {p.label}
                </button>
              )
            })}
          </div>
        </fieldset>

        <label className={labelCls}>
          Name
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Call it whatever makes sense to you"
            maxLength={MAX_QUIT_NAME}
            autoFocus
          />
        </label>

        <div className="flex flex-col gap-2">
          <label className={labelCls} htmlFor="quit-replacement">
            Do this instead (optional)
          </label>
          <Input
            id="quit-replacement"
            value={replacement}
            onChange={(e) => setReplacement(e.target.value)}
            placeholder="Something small you can actually do in the moment"
            maxLength={MAX_QUIT_REPLACEMENT}
          />
          <div className="flex flex-wrap gap-1.5">
            {REPLACEMENT_SUGGESTIONS.map((s) => (
              <button
                key={s.text}
                type="button"
                onClick={() => setReplacement(s.text)}
                className="focus-ring rounded-lg border border-white/10 px-2 py-1 text-[11px] text-text-muted transition-colors hover:bg-surface-2/60 hover:text-text-primary"
              >
                {s.text}
              </button>
            ))}
          </div>
          <p className="text-[11px] leading-relaxed text-text-muted">
            Swapping in a specific, easy action tends to work better than willpower alone. This one
            gets shown right when you need it.
          </p>
        </div>

        <label className={labelCls}>
          Notes (optional)
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Your reason, your triggers, anything you want to remember."
            maxLength={MAX_QUIT_NOTES}
          />
        </label>

        {error && <p className="text-sm text-danger">{error}</p>}

        <div className="mt-1 flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit">{isEdit ? 'Save changes' : 'Start tracking'}</Button>
        </div>
      </form>
    </Modal>
  )
}
