import { useState } from 'react'
import { Link } from 'react-router-dom'
import { format } from 'date-fns'
import { ArrowLeft, Flame, Pencil, Pill, Plus, Trash2 } from 'lucide-react'
import { Badge, Button, Card, CardContent, Checkbox, Modal } from '@/components/ui'
import { useAuth } from '@/features/auth/auth-context'
import { todayISO } from '@/lib/date'
import { cn } from '@/lib/utils'
import type { WellnessItem, WellnessLog } from '@/types/database'
import { useWellnessItems, useWellnessLogs } from './api/useWellness'
import { useWellnessMutations } from './api/useWellnessMutations'
import { computeStreak, isTakenOn, logDay, shiftDay, takenDaysForItem } from './tracking'
import { DisclaimerBanner } from './components/DisclaimerBanner'
import { ItemDialog } from './components/ItemDialog'

function relativeDay(taken_at: string): string {
  const day = logDay(taken_at)
  const today = todayISO()
  if (day === today) return 'Today'
  if (day === shiftDay(today, -1)) return 'Yesterday'
  return format(new Date(taken_at), 'MMM d')
}

function ItemRow({
  item,
  takenToday,
  streak,
  pending,
  onEdit,
  onMark,
  onUndo,
  onDelete,
}: {
  item: WellnessItem
  takenToday: boolean
  streak: number
  pending: boolean
  onEdit: () => void
  onMark: () => void
  onUndo: () => void
  onDelete: () => void
}) {
  const [confirm, setConfirm] = useState(false)
  const meta = [item.dose, item.schedule].filter(Boolean).join(' · ')

  return (
    <Card>
      <CardContent className="flex items-start gap-3">
        <span className={cn('pt-0.5', pending && 'pointer-events-none opacity-50')}>
          <Checkbox
            checked={takenToday}
            onChange={(next) => {
              // Ignore toggles while a mark/undo for this item is in flight, to
              // avoid a same-item insert-vs-delete race.
              if (pending) return
              if (next) onMark()
              else onUndo()
            }}
            aria-label={takenToday ? `Mark ${item.name} not taken today` : `Mark ${item.name} taken today`}
          />
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-display text-base font-semibold">{item.name}</h3>
            {streak > 0 && (
              <Badge variant="success">
                <Flame className="h-3 w-3" aria-hidden />
                {streak}-day streak
              </Badge>
            )}
          </div>
          {meta && <p className="text-sm text-text-muted">{meta}</p>}
          {item.notes && <p className="mt-1 text-xs text-text-muted">{item.notes}</p>}
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={onEdit}
            aria-label={`Edit ${item.name}`}
            className="focus-ring rounded-lg p-2 text-text-muted transition-colors hover:text-text-primary"
          >
            <Pencil className="h-4 w-4" aria-hidden />
          </button>
          <button
            type="button"
            onClick={() => setConfirm(true)}
            aria-label={`Delete ${item.name}`}
            className="focus-ring rounded-lg p-2 text-text-muted transition-colors hover:text-danger"
          >
            <Trash2 className="h-4 w-4" aria-hidden />
          </button>
        </div>
      </CardContent>

      <Modal open={confirm} onClose={() => setConfirm(false)} title={`Delete ${item.name}?`}>
        <div className="space-y-4 p-5">
          <p className="text-sm text-text-muted">
            This removes the item and its taken history. This can&rsquo;t be undone.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setConfirm(false)}>
              Keep it
            </Button>
            <Button
              className="bg-danger text-white hover:bg-danger/90"
              onClick={() => {
                setConfirm(false)
                onDelete()
              }}
            >
              Delete
            </Button>
          </div>
        </div>
      </Modal>
    </Card>
  )
}

function RecentActivity({ items, logs }: { items: WellnessItem[]; logs: WellnessLog[] }) {
  const nameById = new Map(items.map((i) => [i.id, i.name]))
  const recent = logs.slice(0, 12)
  if (recent.length === 0) return null

  return (
    <section className="space-y-3">
      <h3 className="font-display text-sm font-semibold text-text-muted">Recent activity</h3>
      <Card>
        <CardContent className="divide-y divide-white/5 p-0">
          {recent.map((l) => (
            <div key={l.id} className="flex items-center justify-between px-5 py-2.5 text-sm">
              <span className="min-w-0 truncate text-text-primary">
                {nameById.get(l.item_id) ?? 'Removed item'}
              </span>
              <span className="shrink-0 font-mono text-xs text-text-muted">
                {relativeDay(l.taken_at)}
              </span>
            </div>
          ))}
        </CardContent>
      </Card>
    </section>
  )
}

export function TrackerPage() {
  const { user } = useAuth()
  const userId = user?.id ?? ''
  const { data: items = [], isPending } = useWellnessItems(userId)
  const { data: logs = [] } = useWellnessLogs(userId)
  const { deleteItem, markTaken, undoTaken } = useWellnessMutations(userId)

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<WellnessItem | null>(null)
  const today = todayISO()

  function openAdd() {
    setEditing(null)
    setDialogOpen(true)
  }
  function openEdit(item: WellnessItem) {
    setEditing(item)
    setDialogOpen(true)
  }

  return (
    <div className="animate-fade-in space-y-8">
      <header className="space-y-3">
        <Link
          to="/wellness"
          className="focus-ring -mx-2 inline-flex min-h-[44px] items-center gap-1.5 rounded-lg px-2 text-sm text-text-muted md:mx-0 md:min-h-0 md:px-0 transition-colors hover:text-text-primary"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          Focus &amp; Calm
        </Link>
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-brand-gradient-soft text-brand">
            <Pill className="h-5 w-5" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="font-display text-xl font-semibold">Supplement &amp; medication tracker</h2>
            <p className="text-sm text-text-muted">A simple personal log of what you take.</p>
          </div>
          <Button onClick={openAdd} className="shrink-0">
            <Plus className="h-4 w-4" aria-hidden /> Add item
          </Button>
        </div>
      </header>

      <DisclaimerBanner />

      {isPending ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-20 animate-pulse rounded-2xl border border-white/5 bg-surface-2/40" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-4 py-14 text-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-gradient-soft text-brand">
              <Pill className="h-6 w-6" aria-hidden />
            </span>
            <div>
              <h3 className="font-display text-lg font-semibold">Nothing tracked yet</h3>
              <p className="mx-auto mt-1 max-w-sm text-text-muted">
                Add a supplement, vitamin, or medication to start a simple personal log and keep a
                taken streak.
              </p>
            </div>
            <Button onClick={openAdd}>
              <Plus className="h-4 w-4" aria-hidden /> Add your first item
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {items.map((item) => {
            const takenDays = takenDaysForItem(logs, item.id)
            const takenToday = isTakenOn(takenDays, today)
            const streak = computeStreak(takenDays, today)
            const todayLogIds = logs
              .filter((l) => l.item_id === item.id && logDay(l.taken_at) === today)
              .map((l) => l.id)
            const pending =
              (markTaken.isPending && markTaken.variables === item.id) ||
              (undoTaken.isPending && undoTaken.variables?.itemId === item.id)
            return (
              <ItemRow
                key={item.id}
                item={item}
                takenToday={takenToday}
                streak={streak}
                pending={pending}
                onEdit={() => openEdit(item)}
                onMark={() => markTaken.mutate(item.id)}
                onUndo={() => undoTaken.mutate({ itemId: item.id, logIds: todayLogIds })}
                onDelete={() => deleteItem.mutate(item.id)}
              />
            )
          })}
        </div>
      )}

      {items.length > 0 && <RecentActivity items={items} logs={logs} />}

      <ItemDialog open={dialogOpen} onClose={() => setDialogOpen(false)} item={editing} />
    </div>
  )
}
