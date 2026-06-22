import { describe, expect, it } from 'vitest'
import {
  heuristicEffort,
  isEffortPreset,
  snapMinutes,
  suggestEffort,
  tokenize,
} from './autoEffort'
import { makeTask, makeFocusSession } from '@/test/factories'

describe('tokenize', () => {
  it('lowercases, strips punctuation, drops stopwords and short words, dedupes', () => {
    expect(tokenize('Write the quarterly Report!!')).toEqual(['write', 'quarterly', 'report'])
    expect(tokenize('plan plan plan')).toEqual(['plan'])
    expect(tokenize('to a of in')).toEqual([]) // all stopwords/short
  })
})

describe('heuristicEffort (transparent keyword/length fallback)', () => {
  it('maps known keywords to sensible minutes', () => {
    expect(heuristicEffort('Call with Sara')).toBe(30)
    expect(heuristicEffort('Reply to that email')).toBe(15)
    expect(heuristicEffort('Draft the blog post')).toBe(45)
    expect(heuristicEffort('Buy groceries')).toBe(20)
  })
  it('falls back by length when no keyword matches', () => {
    expect(heuristicEffort('Nap')).toBe(15) // one short word
    expect(heuristicEffort('Sort through the old box')).toBe(30) // medium, generic
    expect(heuristicEffort('Sit down and untangle the entire garage shelving situation')).toBe(45)
  })
})

describe('snapMinutes / isEffortPreset', () => {
  it('snaps to the nearest 5 (never below 5), preserving common values', () => {
    expect(snapMinutes(42)).toBe(40)
    expect(snapMinutes(23)).toBe(25)
    expect(snapMinutes(45)).toBe(45) // common value preserved (not bumped to 50)
    expect(snapMinutes(3)).toBe(5)
    expect(snapMinutes(200)).toBe(200)
  })
  it('knows the one-tap presets', () => {
    expect(isEffortPreset(30)).toBe(true)
    expect(isEffortPreset(45)).toBe(false)
  })
})

/** A done task titled `title` that actually took `actualMin` of focus time. */
function doneWithFocus(id: string, title: string, actualMin: number, projectId: string | null = null) {
  return {
    task: makeTask({ id, title, status: 'done', project_id: projectId }),
    session: makeFocusSession({ task_id: id, status: 'completed', actual_seconds: actualMin * 60 }),
  }
}

describe('suggestEffort', () => {
  it('returns null for an empty/too-short title', () => {
    expect(suggestEffort({ title: '  ' }, [], [])).toBeNull()
    expect(suggestEffort({ title: 'a' }, [], [])).toBeNull()
  })

  it('falls back to the heuristic with zero history (labelled honestly)', () => {
    const s = suggestEffort({ title: 'Call Bob' }, [], [])
    expect(s).toEqual({ minutes: 30, basis: 'heuristic' })
  })

  it('uses the median of similar completed tasks (history basis) when there are enough', () => {
    const a = doneWithFocus('h1', 'Write weekly report', 60)
    const b = doneWithFocus('h2', 'Write the report', 60)
    const c = doneWithFocus('h3', 'Write report draft', 60)
    const s = suggestEffort(
      { title: 'Write report' },
      [a.task, b.task, c.task],
      [a.session, b.session, c.session],
    )
    expect(s?.basis).toBe('history')
    expect(s?.sampleCount).toBe(3)
    expect(s?.minutes).toBe(60)
  })

  it('is robust to a wild outlier (median, not mean)', () => {
    const xs = [
      doneWithFocus('o1', 'Write report', 30),
      doneWithFocus('o2', 'Write report', 30),
      doneWithFocus('o3', 'Write report', 300),
    ]
    const s = suggestEffort(
      { title: 'Write report' },
      xs.map((x) => x.task),
      xs.map((x) => x.session),
    )
    expect(s?.minutes).toBe(30) // outlier does not drag the median
  })

  it('uses recorded effort when a matched task has no focus time', () => {
    const tasks = [
      makeTask({ id: 'e1', title: 'Review pull request', status: 'done', effort_minutes: 45 }),
      makeTask({ id: 'e2', title: 'Review the PR', status: 'done', effort_minutes: 45 }),
      makeTask({ id: 'e3', title: 'Review code', status: 'done', effort_minutes: 45 }),
    ]
    const s = suggestEffort({ title: 'Review pull request' }, tasks, [])
    expect(s?.basis).toBe('history')
    expect(s?.minutes).toBe(45)
  })

  it('counts same-project tasks as similar even without shared keywords', () => {
    const tasks = [
      makeTask({ id: 'p1', title: 'Alpha', status: 'done', effort_minutes: 90, project_id: 'proj' }),
      makeTask({ id: 'p2', title: 'Beta', status: 'done', effort_minutes: 90, project_id: 'proj' }),
      makeTask({ id: 'p3', title: 'Gamma', status: 'done', effort_minutes: 90, project_id: 'proj' }),
    ]
    const s = suggestEffort({ title: 'Delta', projectId: 'proj' }, tasks, [])
    expect(s?.basis).toBe('history')
    expect(s?.minutes).toBe(90)
  })

  it('ignores not-done tasks and falls back to the heuristic below the threshold', () => {
    const open = makeTask({ id: 'n1', title: 'Write report', status: 'todo', effort_minutes: 120 })
    const oneDone = doneWithFocus('n2', 'Write report', 55)
    // Only one similar DONE task (< 3) → heuristic, not history.
    const s = suggestEffort({ title: 'Write report' }, [open, oneDone.task], [oneDone.session])
    expect(s?.basis).toBe('heuristic')
  })
})
