import { useEffect, useState, type FormEvent } from 'react'
import { Button, Input, Modal, Textarea } from '@/components/ui'
import { useAuth } from '@/features/auth/auth-context'
import type { WellnessItem } from '@/types/database'
import { useWellnessMutations } from '../api/useWellnessMutations'

const labelCls = 'flex flex-col gap-1.5 text-xs font-medium text-text-muted'

/**
 * Add / edit a tracked item. Free-text fields only — no drug lookup, no dosing
 * suggestions, no medical validation of any kind.
 */
export function ItemDialog({
  open,
  onClose,
  item,
}: {
  open: boolean
  onClose: () => void
  item?: WellnessItem | null
}) {
  const { user } = useAuth()
  const { createItem, updateItem } = useWellnessMutations(user?.id ?? '')
  const isEdit = !!item

  const [name, setName] = useState('')
  const [dose, setDose] = useState('')
  const [schedule, setSchedule] = useState('')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setError(null)
    if (item) {
      setName(item.name)
      setDose(item.dose ?? '')
      setSchedule(item.schedule ?? '')
      setNotes(item.notes ?? '')
    } else {
      setName('')
      setDose('')
      setSchedule('')
      setNotes('')
    }
  }, [open, item])

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) {
      setError('Name is required.')
      return
    }
    const payload = {
      name: trimmed,
      dose: dose.trim() || null,
      schedule: schedule.trim() || null,
      notes: notes.trim() || null,
    }
    if (isEdit && item) updateItem.mutate({ id: item.id, patch: payload })
    else createItem.mutate(payload)
    onClose()
  }

  return (
    <Modal open={open} onClose={onClose} title={isEdit ? 'Edit item' : 'Add item'}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4 p-5">
        <label className={labelCls}>
          Name
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Vitamin D"
            autoFocus
          />
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className={labelCls}>
            Dose (optional)
            <Input
              value={dose}
              onChange={(e) => setDose(e.target.value)}
              placeholder="e.g. 1000 IU"
            />
          </label>
          <label className={labelCls}>
            Schedule (optional)
            <Input
              value={schedule}
              onChange={(e) => setSchedule(e.target.value)}
              placeholder="e.g. daily, 8am"
            />
          </label>
        </div>

        <label className={labelCls}>
          Notes (optional)
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Anything you want to remember."
          />
        </label>

        {error && <p className="text-sm text-danger">{error}</p>}

        <div className="mt-1 flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit">{isEdit ? 'Save changes' : 'Add item'}</Button>
        </div>
      </form>
    </Modal>
  )
}
