import { describe, expect, it } from 'vitest'
import type { Project, VisionCard } from '@/types/database'
import {
  MAX_VISION_TITLE,
  MAX_VISION_WHY,
  canCreateVisionCard,
  linkedProject,
  nextVisionPosition,
  sortVisionCards,
  targetTone,
  validateVisionCard,
} from './vision'

const card = (over: Partial<VisionCard> = {}): VisionCard => ({
  id: 'vc-1',
  user_id: 'u-1',
  title: 'Run a half marathon',
  why: null,
  target_date: null,
  position: 0,
  project_id: null,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
  ...over,
})

const project = (over: Partial<Project> = {}): Project =>
  ({
    id: 'p-1',
    workspace_id: 'ws-1',
    name: 'Marathon training',
    color: '#22D3A6',
    status: 'active',
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...over,
  }) as Project

describe('sortVisionCards', () => {
  it('honours the position the user dragged things into', () => {
    const cards = [
      card({ id: 'c', position: 2 }),
      card({ id: 'a', position: 0 }),
      card({ id: 'b', position: 1 }),
    ]
    expect(sortVisionCards(cards).map((c) => c.id)).toEqual(['a', 'b', 'c'])
  })

  it('handles the fractional positions a drag actually writes', () => {
    const cards = [
      card({ id: 'a', position: 0 }),
      card({ id: 'b', position: 1 }),
      card({ id: 'moved', position: 0.5 }),
    ]
    expect(sortVisionCards(cards).map((c) => c.id)).toEqual(['a', 'moved', 'b'])
  })

  it('is a TOTAL order — equal positions fall back to creation time, then id', () => {
    const cards = [
      card({ id: 'z', position: 0, created_at: '2026-02-01T00:00:00.000Z' }),
      card({ id: 'y', position: 0, created_at: '2026-01-01T00:00:00.000Z' }),
    ]
    expect(sortVisionCards(cards).map((c) => c.id)).toEqual(['y', 'z'])

    const sameTime = [card({ id: 'b', position: 0 }), card({ id: 'a', position: 0 })]
    expect(sortVisionCards(sameTime).map((c) => c.id)).toEqual(['a', 'b'])
  })

  it('never mutates the array it was given', () => {
    const cards = [card({ id: 'b', position: 1 }), card({ id: 'a', position: 0 })]
    const order = cards.map((c) => c.id)
    sortVisionCards(cards)
    expect(cards.map((c) => c.id)).toEqual(order)
  })

  it('handles an empty list', () => {
    expect(sortVisionCards([])).toEqual([])
  })
})

describe('nextVisionPosition', () => {
  it('appends below everything that exists', () => {
    expect(nextVisionPosition([card({ position: 0 }), card({ position: 3 })])).toBe(4)
  })

  it('starts at 0 for the first goal', () => {
    expect(nextVisionPosition([])).toBe(0)
  })

  it('appends after a fractional position, not between', () => {
    expect(nextVisionPosition([card({ position: 0 }), card({ position: 0.5 })])).toBe(1.5)
  })

  it('copes with negative positions (a card dragged above the first)', () => {
    expect(nextVisionPosition([card({ position: -1 }), card({ position: -0.5 })])).toBe(0.5)
  })
})

describe('canCreateVisionCard', () => {
  it('lets Free create up to the limit and no further', () => {
    expect(canCreateVisionCard(0, false, 3)).toBe(true)
    expect(canCreateVisionCard(2, false, 3)).toBe(true)
    expect(canCreateVisionCard(3, false, 3)).toBe(false)
  })

  it('is unlimited for Pro, at ANY count', () => {
    expect(canCreateVisionCard(3, true, 3)).toBe(true)
    expect(canCreateVisionCard(500, true, 3)).toBe(true)
  })

  it('never reaches backwards: someone already over the limit is only blocked from ADDING', () => {
    // The function answers "may they create another", so being over the limit
    // (e.g. after a downgrade) returns false — it never implies deleting any.
    expect(canCreateVisionCard(9, false, 3)).toBe(false)
  })
})

describe('validateVisionCard', () => {
  it('accepts a minimal goal — only the name is required', () => {
    expect(validateVisionCard({ title: 'Learn to swim', why: null })).toEqual({ ok: true })
  })

  it('rejects a blank or whitespace-only name', () => {
    expect(validateVisionCard({ title: '', why: null }).ok).toBe(false)
    expect(validateVisionCard({ title: '   ', why: null }).ok).toBe(false)
  })

  it('enforces the same lengths as the DB CHECKs', () => {
    expect(validateVisionCard({ title: 'x'.repeat(MAX_VISION_TITLE), why: null }).ok).toBe(true)
    expect(validateVisionCard({ title: 'x'.repeat(MAX_VISION_TITLE + 1), why: null }).ok).toBe(false)
    expect(validateVisionCard({ title: 'ok', why: 'y'.repeat(MAX_VISION_WHY) }).ok).toBe(true)
    expect(validateVisionCard({ title: 'ok', why: 'y'.repeat(MAX_VISION_WHY + 1) }).ok).toBe(false)
  })

  it('explains itself without blaming the user', () => {
    const result = validateVisionCard({ title: '', why: null })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe('Give the goal a name.')
  })
})

describe('linkedProject', () => {
  const projects = [project({ id: 'p-1' }), project({ id: 'p-2', name: 'Other' })]

  it('finds the linked project', () => {
    expect(linkedProject(card({ project_id: 'p-2' }), projects)?.name).toBe('Other')
  })

  it('is null when nothing is linked', () => {
    expect(linkedProject(card({ project_id: null }), projects)).toBeNull()
  })

  it('is null for a project that is gone, rather than rendering a broken badge', () => {
    expect(linkedProject(card({ project_id: 'deleted' }), projects)).toBeNull()
    expect(linkedProject(card({ project_id: 'p-1' }), [])).toBeNull()
  })
})

describe('targetTone', () => {
  const today = '2026-07-30'

  it('is "none" without a date — a goal needs no deadline', () => {
    expect(targetTone(card({ target_date: null }), today)).toBe('none')
  })

  it('is "ahead" for today and the future', () => {
    expect(targetTone(card({ target_date: today }), today)).toBe('ahead')
    expect(targetTone(card({ target_date: '2026-12-31' }), today)).toBe('ahead')
  })

  it('is "passed" only once the date is genuinely behind', () => {
    expect(targetTone(card({ target_date: '2026-07-29' }), today)).toBe('passed')
  })

  it('is boundary-exact: the target day itself is not yet passed', () => {
    expect(targetTone(card({ target_date: '2026-07-30' }), '2026-07-30')).toBe('ahead')
    expect(targetTone(card({ target_date: '2026-07-30' }), '2026-07-31')).toBe('passed')
  })
})
