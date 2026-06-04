import type { ReactNode } from 'react'
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical } from 'lucide-react'
import { moveItem } from '@/lib/reorder'
import { cn } from '@/lib/utils'

interface SortableListProps {
  ids: string[]
  /** Receives the new id order and the id that was dragged. */
  onReorder: (orderedIds: string[], activeId: string) => void
  /** Render the content for an id (without the drag handle). */
  children: (id: string) => ReactNode
  className?: string
  disabled?: boolean
}

/**
 * Vertical drag-to-reorder list. Drags start only from the grip handle so
 * checkboxes/buttons inside rows stay clickable. The new order is computed with
 * the pure (unit-tested) `moveItem` helper and handed back via `onReorder`.
 */
export function SortableList({ ids, onReorder, children, className, disabled }: SortableListProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    onReorder(moveItem(ids, String(active.id), String(over.id), (x) => x), String(active.id))
  }

  if (disabled) {
    return (
      <div className={className}>
        {ids.map((id) => (
          <div key={id}>{children(id)}</div>
        ))}
      </div>
    )
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        <div className={className}>
          {ids.map((id) => (
            <SortableRow key={id} id={id}>
              {children(id)}
            </SortableRow>
          ))}
        </div>
      </SortableContext>
    </DndContext>
  )
}

function SortableRow({ id, children }: { id: string; children: ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
  })
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn('group/sortable flex items-start gap-1', isDragging && 'relative z-10 opacity-70')}
    >
      <button
        type="button"
        aria-label="Drag to reorder"
        className="focus-ring mt-2 cursor-grab touch-none rounded p-0.5 text-text-muted/30 opacity-100 transition-opacity hover:text-text-muted focus-visible:opacity-100 active:cursor-grabbing md:opacity-0 md:group-hover/sortable:opacity-100"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-4 w-4" aria-hidden />
      </button>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  )
}
