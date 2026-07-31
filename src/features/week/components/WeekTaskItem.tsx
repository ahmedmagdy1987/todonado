import type { ReactNode } from 'react'
import { useDraggable } from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Drag chrome for a task on the week board. Drags start ONLY from the grip (the
 * same rule SortableList uses), so the checkbox, menu and buttons inside the row
 * stay clickable — and the grip is a real focusable button, so dnd-kit's
 * KeyboardSensor can pick up and move a task without a mouse.
 *
 * THE GRIP SITS INSIDE THE CARD, not in a gutter beside it. As a flex sibling it
 * took ~20px out of every column — on a board where a column is 150px wide that
 * is an eighth of the readable width, and it left the handles floating outside
 * the column's own border, which read as a rendering fault. Overlaying it costs
 * nothing: the card reserves the space with padding, and the handle only appears
 * on hover or focus, so a resting board is clean.
 *
 * It stays permanently visible on touch, where there is no hover to reveal it.
 */
export function WeekTaskItem({
  id,
  label,
  children,
}: {
  id: string
  /** Task title, for the drag handle's accessible name. */
  label: string
  children: ReactNode
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id })

  return (
    <div
      ref={setNodeRef}
      style={transform ? { transform: CSS.Translate.toString(transform) } : undefined}
      className={cn('group/drag relative', isDragging && 'relative z-10 opacity-60')}
    >
      {children}
      <button
        type="button"
        aria-label={`Move ${label} to another day`}
        className={cn(
          'focus-ring absolute right-1 top-1 cursor-grab touch-none rounded p-1 text-text-muted/50',
          'transition-opacity hover:text-text-muted active:cursor-grabbing',
          // Hidden until wanted on pointer devices; always there on touch, where
          // nothing can be revealed by hovering.
          'opacity-100 md:opacity-0 md:group-hover/drag:opacity-100 md:focus-visible:opacity-100',
        )}
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-4 w-4" aria-hidden />
      </button>
    </div>
  )
}
