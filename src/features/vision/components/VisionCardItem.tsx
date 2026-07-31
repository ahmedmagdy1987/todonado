import { useState } from 'react'
import { Link } from 'react-router-dom'
import { CalendarDays, FolderOpen, Pencil, Trash2 } from 'lucide-react'
import { Badge, Button, Card, CardContent, Modal } from '@/components/ui'
import { formatDateShort } from '@/lib/format'
import type { Project, VisionCard } from '@/types/database'
import { targetTone } from '../vision'

/**
 * One goal.
 *
 * TYPOGRAPHY IS THE DESIGN HERE. There are no images (see the migration for why),
 * so the card earns its presence from the display face, generous leading on the
 * reason, and restraint everywhere else — not from decoration standing in for a
 * picture that isn't there.
 */
export function VisionCardItem({
  card,
  project,
  today,
  onEdit,
  onDelete,
}: {
  card: VisionCard
  project: Project | null
  today: string
  onEdit: () => void
  onDelete: () => void
}) {
  const [confirmDelete, setConfirmDelete] = useState(false)
  const tone = targetTone(card, today)

  return (
    <Card className="h-full">
      <CardContent className="flex h-full flex-col gap-3">
        <div className="flex items-start gap-2">
          <h3 className="min-w-0 flex-1 font-display text-lg font-semibold leading-snug">
            {card.title}
          </h3>
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={onEdit}
              aria-label={`Edit ${card.title}`}
              className="focus-ring rounded-lg p-1.5 text-text-muted transition-colors hover:text-text-primary"
            >
              <Pencil className="h-4 w-4" aria-hidden />
            </button>
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              aria-label={`Remove ${card.title}`}
              className="focus-ring rounded-lg p-1.5 text-text-muted transition-colors hover:text-danger"
            >
              <Trash2 className="h-4 w-4" aria-hidden />
            </button>
          </div>
        </div>

        {card.why && (
          <p className="whitespace-pre-line text-sm leading-relaxed text-text-muted">{card.why}</p>
        )}

        <div className="mt-auto flex flex-wrap items-center gap-2 pt-1">
          {tone !== 'none' && card.target_date && (
            <Badge variant="outline">
              <CalendarDays className="h-3 w-3" aria-hidden />
              {/* A date that has passed is stated, never scolded — no red, no
                  "overdue", because a goal is not a task. */}
              {tone === 'passed' ? 'Target was ' : 'By '}
              {formatDateShort(card.target_date)}
            </Badge>
          )}
          {project && (
            <Link
              to={`/projects/${project.id}`}
              className="focus-ring inline-flex items-center gap-1.5 rounded-full bg-brand-gradient-soft px-2.5 py-1 text-xs font-medium text-brand transition-colors hover:bg-brand/20"
            >
              <FolderOpen className="h-3 w-3" aria-hidden />
              {project.name}
            </Link>
          )}
        </div>
      </CardContent>

      <Modal
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title={`Remove ${card.title}?`}
      >
        <div className="space-y-4 p-5">
          <p className="text-sm text-text-muted">
            This removes the goal and its reason. Any project it was linked to is left completely
            alone. Only the link goes.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setConfirmDelete(false)}>
              Keep it
            </Button>
            <Button
              className="bg-danger text-white hover:bg-danger/90"
              onClick={() => {
                setConfirmDelete(false)
                onDelete()
              }}
            >
              Remove
            </Button>
          </div>
        </div>
      </Modal>
    </Card>
  )
}
