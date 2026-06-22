import { describe, it, expect } from 'vitest'
import type { WellnessLog } from '@/types/database'
import { computeStreak, isTakenOn, shiftDay, takenDaysForItem } from './tracking'

const log = (item_id: string, taken_at: string): WellnessLog => ({
  id: `${item_id}-${taken_at}`,
  user_id: 'u1',
  item_id,
  taken_at,
  created_at: taken_at,
})

describe('shiftDay', () => {
  it('moves by whole days and handles month boundaries', () => {
    expect(shiftDay('2026-06-22', -1)).toBe('2026-06-21')
    expect(shiftDay('2026-06-01', -1)).toBe('2026-05-31')
    expect(shiftDay('2026-06-22', 1)).toBe('2026-06-23')
  })
})

describe('takenDaysForItem / isTakenOn', () => {
  const logs = [
    log('a', '2026-06-22T08:00:00Z'),
    log('a', '2026-06-22T20:00:00Z'), // same day, second mark
    log('a', '2026-06-21T09:00:00Z'),
    log('b', '2026-06-22T09:00:00Z'),
  ]

  it('collapses multiple marks on the same day and filters by item', () => {
    const a = takenDaysForItem(logs, 'a')
    expect([...a].sort()).toEqual(['2026-06-21', '2026-06-22'])
    expect(isTakenOn(a, '2026-06-22')).toBe(true)
    expect(isTakenOn(a, '2026-06-20')).toBe(false)
    expect(takenDaysForItem(logs, 'b').size).toBe(1)
  })
})

describe('computeStreak', () => {
  const today = '2026-06-22'

  it('counts consecutive days ending today', () => {
    const days = new Set(['2026-06-20', '2026-06-21', '2026-06-22'])
    expect(computeStreak(days, today)).toBe(3)
  })

  it('still counts a run ending yesterday (today not over yet)', () => {
    const days = new Set(['2026-06-20', '2026-06-21'])
    expect(computeStreak(days, today)).toBe(2)
  })

  it('is 0 when neither today nor yesterday is logged', () => {
    expect(computeStreak(new Set(['2026-06-19']), today)).toBe(0)
    expect(computeStreak(new Set<string>(), today)).toBe(0)
  })

  it('stops at the first gap', () => {
    const days = new Set(['2026-06-18', '2026-06-19', '2026-06-21', '2026-06-22'])
    expect(computeStreak(days, today)).toBe(2) // 21 + 22; gap at 20
  })
})
