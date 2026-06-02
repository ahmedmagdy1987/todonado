/**
 * Pure reordering helpers used by drag-and-drop lists. No DOM, no dnd-kit
 * imports — fully unit-testable. dnd-kit gives us active/over ids; we compute
 * the new order and the resulting `position` updates to persist.
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

/** Map an ordered id list to `{ id, position }` rows (position = index). */
export function positionUpdates(orderedIds: readonly string[]): {
  id: string
  position: number
}[] {
  return orderedIds.map((id, index) => ({ id, position: index }))
}
