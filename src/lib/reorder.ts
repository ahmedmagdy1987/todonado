/**
 * Pure reordering helpers for drag-and-drop lists. No DOM / dnd-kit imports —
 * fully unit-tested.
 *
 * Ordering uses FRACTIONAL positions: a reorder changes only the dragged item's
 * `position` (to the midpoint between its new neighbours), never the others.
 * This keeps each reorder a single-row update and — crucially — avoids
 * corrupting sibling views when a task belongs to more than one list (e.g. a
 * project-less task scheduled for today appears in both Inbox and Today).
 */

/** Move the item with `activeId` to the slot currently held by `overId`. */
export function moveItem<T>(
  items: readonly T[],
  activeId: string,
  overId: string,
  getId: (item: T) => string,
): T[] {
  const from = items.findIndex((i) => getId(i) === activeId)
  const to = items.findIndex((i) => getId(i) === overId)
  if (from === -1 || to === -1 || from === to) return items.slice()
  const next = items.slice()
  const [moved] = next.splice(from, 1)
  next.splice(to, 0, moved as T)
  return next
}

/** A position that sorts strictly between `prev` and `next` (either may be null). */
export function positionBetween(prev: number | null, next: number | null): number {
  if (prev !== null && next !== null) return (prev + next) / 2
  if (prev !== null) return prev + 1
  if (next !== null) return next - 1
  return 0
}

/**
 * Given the new id order of a subset, the dragged id, and a map of each id's
 * current `position`, compute the single new position for the dragged item.
 */
export function newPositionForMove(
  orderedIds: string[],
  activeId: string,
  positionById: Map<string, number>,
): number {
  const idx = orderedIds.indexOf(activeId)
  if (idx === -1) return 0
  const prevId = idx > 0 ? orderedIds[idx - 1] : undefined
  const nextId = idx < orderedIds.length - 1 ? orderedIds[idx + 1] : undefined
  const prev = prevId !== undefined ? positionById.get(prevId) ?? null : null
  const next = nextId !== undefined ? positionById.get(nextId) ?? null : null
  return positionBetween(prev, next)
}
