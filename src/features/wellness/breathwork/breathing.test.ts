import { describe, it, expect } from 'vitest'
import {
  BREATH_PATTERNS,
  circleScale,
  cycleSeconds,
  elapsedMs,
  getPattern,
  isSessionComplete,
  pacerPause,
  pacerResume,
  phaseAt,
  phaseLabel,
  roundsCompleted,
  sessionSecondsLeft,
  type PacerTiming,
} from './breathing'

const box = getPattern('box') // 4-4-4-4 => 16s cycle
const calm = getPattern('calm') // 4-7-8 => 19s cycle
const S = 1000

describe('patterns', () => {
  it('exposes the three patterns with correct cadences', () => {
    expect(BREATH_PATTERNS.map((p) => p.id)).toEqual(['box', 'calm', 'simple'])
    expect(getPattern('calm').cadence).toBe('4-7-8')
  })

  it('cycleSeconds sums the phases', () => {
    expect(cycleSeconds(box)).toBe(16)
    expect(cycleSeconds(calm)).toBe(19)
    expect(cycleSeconds(getPattern('simple'))).toBe(8)
  })
})

describe('phaseAt', () => {
  it('returns inhale at the start', () => {
    const s = phaseAt(0, box)
    expect(s.phase.type).toBe('inhale')
    expect(s.phaseIndex).toBe(0)
    expect(s.phaseProgress).toBe(0)
    expect(s.round).toBe(0)
  })

  it('walks box phases by elapsed time', () => {
    expect(phaseAt(2 * S, box).phase.type).toBe('inhale') // 0-4s
    expect(phaseAt(5 * S, box).phase.type).toBe('hold-full') // 4-8s
    expect(phaseAt(9 * S, box).phase.type).toBe('exhale') // 8-12s
    expect(phaseAt(13 * S, box).phase.type).toBe('hold-empty') // 12-16s
  })

  it('wraps into the next round after a full cycle', () => {
    const s = phaseAt(16 * S + 1 * S, box) // 1s into round 2
    expect(s.round).toBe(1)
    expect(s.phase.type).toBe('inhale')
  })

  it('reports phase progress and a 1-based seconds-left countdown', () => {
    const s = phaseAt(1 * S, box) // 1s into the 4s inhale
    expect(s.phaseProgress).toBeCloseTo(0.25, 5)
    expect(s.phaseSecondsLeft).toBe(3)
  })

  it('handles the 4-7-8 (three-phase) pattern', () => {
    expect(phaseAt(3 * S, calm).phase.type).toBe('inhale') // 0-4
    expect(phaseAt(6 * S, calm).phase.type).toBe('hold-full') // 4-11
    expect(phaseAt(15 * S, calm).phase.type).toBe('exhale') // 11-19
  })
})

describe('roundsCompleted', () => {
  it('counts whole cycles', () => {
    expect(roundsCompleted(0, box)).toBe(0)
    expect(roundsCompleted(15 * S, box)).toBe(0)
    expect(roundsCompleted(16 * S, box)).toBe(1)
    expect(roundsCompleted(48 * S, box)).toBe(3)
  })
})

describe('circleScale', () => {
  it('expands on inhale, holds full, contracts on exhale, holds empty', () => {
    expect(circleScale(phaseAt(0, box))).toBeCloseTo(0, 5) // start of inhale
    expect(circleScale(phaseAt(2 * S, box))).toBeCloseTo(0.5, 5) // mid inhale
    expect(circleScale(phaseAt(5 * S, box))).toBe(1) // hold-full
    expect(circleScale(phaseAt(10 * S, box))).toBeCloseTo(0.5, 5) // mid exhale
    expect(circleScale(phaseAt(13 * S, box))).toBe(0) // hold-empty
  })
})

describe('phaseLabel', () => {
  it('maps phase types to cues', () => {
    expect(phaseLabel('inhale')).toBe('Breathe in')
    expect(phaseLabel('exhale')).toBe('Breathe out')
    expect(phaseLabel('hold-full')).toBe('Hold')
    expect(phaseLabel('hold-empty')).toBe('Hold')
  })
})

describe('pacer timing (wall-clock, drift-resistant)', () => {
  const running = (over: Partial<PacerTiming> = {}): PacerTiming => ({
    startedAtMs: 0,
    accumulatedPausedMs: 0,
    pausedAtMs: null,
    ...over,
  })

  it('elapsed depends only on now, not on tick count', () => {
    expect(elapsedMs(running({ startedAtMs: 1_000_000 }), 1_000_000 + 5_000)).toBe(5_000)
  })

  it('freezes while paused, then folds the pause into accumulated time', () => {
    let t = running()
    t = pacerPause(t, 10_000)
    expect(elapsedMs(t, 10_000)).toBe(10_000)
    expect(elapsedMs(t, 25_000)).toBe(10_000) // still frozen 15s later
    t = pacerResume(t, 25_000) // paused for 15s
    expect(t.accumulatedPausedMs).toBe(15_000)
    expect(elapsedMs(t, 30_000)).toBe(15_000) // gross 30s - 15s paused
  })

  it('pause is idempotent; resume on a running pacer is a no-op', () => {
    const t = running()
    expect(pacerResume(t, 5_000)).toEqual(t)
    const paused = pacerPause(t, 5_000)
    expect(pacerPause(paused, 9_000)).toEqual(paused)
  })

  it('never goes negative', () => {
    expect(elapsedMs(running({ startedAtMs: 100_000 }), 0)).toBe(0)
  })
})

describe('session completion', () => {
  it('completes at the chosen duration and counts down whole seconds', () => {
    expect(isSessionComplete(1, 59_000)).toBe(false)
    expect(isSessionComplete(1, 60_000)).toBe(true)
    expect(sessionSecondsLeft(1, 0)).toBe(60)
    expect(sessionSecondsLeft(1, 60_000)).toBe(0)
    expect(sessionSecondsLeft(3, 90_000)).toBe(90)
  })
})
