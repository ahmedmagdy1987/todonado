import { describe, it, expect } from 'vitest'
import { moveItem, positionUpdates } from './reorder'

const id = (x: { id: string }) => x.id

describe('moveItem', () => {
  const items = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]

  it('moves an item down', () => {
    expect(moveItem(items, 'a', 'c', id).map(id)).toEqual(['b', 'c', 'a'])
  })

  it('moves an item up', () => {
    expect(moveItem(items, 'c', 'a', id).map(id)).toEqual(['c', 'a', 'b'])
  })

  it('returns an unchanged copy for equal or unknown ids', () => {
    expect(moveItem(items, 'a', 'a', id).map(id)).toEqual(['a', 'b', 'c'])
    expect(moveItem(items, 'x', 'b', id).map(id)).toEqual(['a', 'b', 'c'])
  })
})

describe('positionUpdates', () => {
  it('maps an ordered id list to index positions', () => {
    expect(positionUpdates(['x', 'y', 'z'])).toEqual([
      { id: 'x', position: 0 },
      { id: 'y', position: 1 },
      { id: 'z', position: 2 },
    ])
  })
})
