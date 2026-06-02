import { describe, it, expect } from 'vitest'
import {
  elapsedSeconds,
  remainingSeconds,
  isComplete,
  pause,
  resume,
  endStatusFor,
  formatClock,
  type FocusTiming,
} from './timer'

const S = 1000 // ms per second
const running = (over: Partial<FocusTiming> = {}): FocusTiming => ({
  startedAtMs: 0,
  accumulatedPausedSeconds: 0,
  pausedAtMs: null,
  ...over,
})

describe('elapsedSeconds', () => {
  it('counts wall-clock seconds while running', () => {
    expect(elapsedSeconds(running(), 90 * S)).toBe(90)
  })

  it('is drift-resistant — depends only on now, not on tick count', () => {
    const t = running({ startedAtMs: 1_000_000 })
    expect(elapsedSeconds(t, 1_000_000 + 300 * S)).toBe(300)
  })

  it('excludes accumulated paused time', () => {
    expect(elapsedSeconds(running({ accumulatedPausedSeconds: 30 }), 100 * S)).toBe(70)
  })

  it('freezes while currently paused', () => {
    const t = running({ pausedAtMs: 60 * S })
    expect(elapsedSeconds(t, 60 * S)).toBe(60)
    expect(elapsedSeconds(t, 120 * S)).toBe(60) // still 60 a minute later
  })

  it('never goes negative', () => {
    expect(elapsedSeconds(running({ startedAtMs: 100 * S }), 0)).toBe(0)
  })
})

describe('pause / resume', () => {
  it('pause sets pausedAt; resume folds the pause into accumulated time', () => {
    let t = running()
    t = pause(t, 60 * S)
    expect(t.pausedAtMs).toBe(60 * S)
    t = resume(t, 90 * S) // paused for 30s
    expect(t.pausedAtMs).toBeNull()
    expect(t.accumulatedPausedSeconds).toBe(30)
    expect(elapsedSeconds(t, 120 * S)).toBe(90) // gross 120 - 30 paused
  })

  it('pause is idempotent and resume on a running timer is a no-op', () => {
    const t = running()
    expect(resume(t, 10 * S)).toEqual(t)
    const paused = pause(t, 10 * S)
    expect(pause(paused, 20 * S)).toEqual(paused)
  })
})

describe('remainingSeconds / isComplete', () => {
  it('computes remaining time and completion', () => {
    expect(remainingSeconds(50, 600)).toBe(50 * 60 - 600)
    expect(remainingSeconds(25, 25 * 60 + 10)).toBe(0)
    expect(isComplete(50, 50 * 60)).toBe(true)
    expect(isComplete(50, 50 * 60 - 1)).toBe(false)
  })
})

describe('endStatusFor', () => {
  it('abandons trivially short sessions, completes meaningful ones', () => {
    expect(endStatusFor(59)).toBe('abandoned')
    expect(endStatusFor(60)).toBe('completed')
    expect(endStatusFor(3000)).toBe('completed')
  })
})

describe('formatClock', () => {
  it('formats MM:SS with padding', () => {
    expect(formatClock(0)).toBe('00:00')
    expect(formatClock(65)).toBe('01:05')
    expect(formatClock(90 * 60)).toBe('90:00')
  })
})
