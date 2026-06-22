import { describe, expect, it } from 'vitest'
import { estimationBias, ESTIMATION_MIN_SAMPLES } from './insights'
import { makeTask, makeFocusSession } from '@/test/factories'

/** A done task estimated at `est` min with `actualMin` of focused time on it. */
function pair(id: string, est: number, actualMin: number) {
  return {
    task: makeTask({ id, status: 'done', effort_minutes: est }),
    session: makeFocusSession({ task_id: id, status: 'completed', actual_seconds: actualMin * 60 }),
  }
}

describe('estimationBias', () => {
  it('reports too few samples below the threshold (keep-logging state)', () => {
    const { task, session } = pair('t1', 30, 45)
    const bias = estimationBias([task], [session])
    expect(bias.sampleCount).toBe(1)
    expect(bias.hasEnough).toBe(false)
    expect(bias.minSamples).toBe(ESTIMATION_MIN_SAMPLES)
  })

  it('detects under-estimation (actual > estimate) as a positive bias %', () => {
    // 5 tasks all estimated 30m but actually taking 45m → ratio 1.5 → +50%.
    const pairs = [1, 2, 3, 4, 5].map((n) => pair(`u${n}`, 30, 45))
    const bias = estimationBias(
      pairs.map((p) => p.task),
      pairs.map((p) => p.session),
    )
    expect(bias.hasEnough).toBe(true)
    expect(bias.sampleCount).toBe(5)
    expect(bias.medianRatio).toBeCloseTo(1.5, 5)
    expect(bias.biasPct).toBe(50)
    expect(bias.direction).toBe('under')
  })

  it('detects over-estimation (actual < estimate) as a negative bias %', () => {
    const pairs = [1, 2, 3, 4, 5].map((n) => pair(`o${n}`, 60, 30)) // ratio 0.5 → -50%
    const bias = estimationBias(
      pairs.map((p) => p.task),
      pairs.map((p) => p.session),
    )
    expect(bias.biasPct).toBe(-50)
    expect(bias.direction).toBe('over')
  })

  it('reports "accurate" within the ±5% band', () => {
    const pairs = [1, 2, 3, 4, 5].map((n) => pair(`a${n}`, 60, 61)) // ratio ~1.017 → +2%
    const bias = estimationBias(
      pairs.map((p) => p.task),
      pairs.map((p) => p.session),
    )
    expect(bias.direction).toBe('accurate')
  })

  it('uses the median so one wild outlier does not dominate', () => {
    const normal = [1, 2, 3, 4].map((n) => pair(`m${n}`, 30, 30)) // ratio 1.0
    const outlier = pair('m5', 30, 300) // ratio 10
    const all = [...normal, outlier]
    const bias = estimationBias(
      all.map((p) => p.task),
      all.map((p) => p.session),
    )
    expect(bias.medianRatio).toBe(1) // median unaffected by the 10x outlier
    expect(bias.biasPct).toBe(0)
  })

  it('ignores tasks without a done status, an estimate, or focus time', () => {
    const noEstimate = makeTask({ id: 'x1', status: 'done', effort_minutes: null })
    const notDone = makeTask({ id: 'x2', status: 'todo', effort_minutes: 30 })
    const noFocus = makeTask({ id: 'x3', status: 'done', effort_minutes: 30 })
    const runningOnly = pair('x4', 30, 45)
    runningOnly.session = makeFocusSession({ task_id: 'x4', status: 'running', actual_seconds: 0 })
    const bias = estimationBias(
      [noEstimate, notDone, noFocus, runningOnly.task],
      [makeFocusSession({ task_id: 'x2', actual_seconds: 1800 }), runningOnly.session],
    )
    expect(bias.sampleCount).toBe(0)
    expect(bias.medianRatio).toBeNull()
    expect(bias.biasPct).toBeNull()
    expect(bias.direction).toBeNull()
  })

  it('sums multiple focus sessions on the same task', () => {
    const task = makeTask({ id: 's1', status: 'done', effort_minutes: 60 })
    const sessions = [
      makeFocusSession({ task_id: 's1', actual_seconds: 30 * 60 }),
      makeFocusSession({ task_id: 's1', actual_seconds: 30 * 60 }),
    ]
    const bias = estimationBias([task], sessions, { minSamples: 1 })
    expect(bias.samples[0].actualMin).toBe(60) // 30 + 30
    expect(bias.medianRatio).toBe(1)
  })
})
