import { describe, it, expect } from 'vitest'
import { moveItem, positionBetween, newPositionForMove } from './reorder'

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

describe('positionBetween', () => {
  it('returns the midpoint between two positions', () => {
    expect(positionBetween(2, 4)).toBe(3)
    expect(positionBetween(0, 1)).toBe(0.5)
  })
  it('extends past an open end', () => {
    expect(positionBetween(null, 5)).toBe(4) // before the first
    expect(positionBetween(3, null)).toBe(4) // after the last
  })
  it('returns 0 for an empty list', () => {
    expect(positionBetween(null, null)).toBe(0)
  })
})

describe('newPositionForMove', () => {
  const positions = new Map([
    ['a', 0],
    ['b', 1],
    ['c', 2],
  ])

  it('computes a midpoint when dropped between two items', () => {
    // moved 'a' between b(1) and c(2) -> 1.5
    expect(newPositionForMove(['b', 'a', 'c'], 'a', positions)).toBe(1.5)
  })

  it('computes past-the-end when dropped last', () => {
    // moved 'a' after c(2) -> 3
    expect(newPositionForMove(['b', 'c', 'a'], 'a', positions)).toBe(3)
  })

  it('computes before-the-start when dropped first', () => {
    // moved 'c' before a(0) -> -1
    expect(newPositionForMove(['c', 'a', 'b'], 'c', positions)).toBe(-1)
  })

  it('only the moved item changes — neighbours keep their positions', () => {
    // moving does not require renumbering a/b/c; their map values are untouched.
    expect(positions.get('b')).toBe(1)
    expect(positions.get('c')).toBe(2)
  })
})
