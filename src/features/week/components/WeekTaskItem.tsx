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
      className={cn('flex items-start gap-1', isDragging && 'relative z-10 opacity-60')}
    >
      <button
        type="button"
        aria-label={`Move ${label} to another day`}
        className="focus-ring mt-2 cursor-grab touch-none rounded p-0.5 text-text-muted/40 transition-colors hover:text-text-muted active:cursor-grabbing"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-4 w-4" aria-hidden />
      </button>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  )
}
