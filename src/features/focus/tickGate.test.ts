import { describe, expect, it } from 'vitest'
import { nextTickGate } from './tickGate'

/**
 * One tick per displayed second, and exactly one.
 *
 * `ticking.test.ts` covers whether the tick is ALLOWED (paused, complete,
 * ending, master switch, preference). This covers the other half: given that it
 * is allowed, does this particular second sound once, never twice, and does a
 * new sprint start ticking again.
 */
describe('a displayed second ticks once', () => {
  const running = { allowed: true, sessionId: 's1', elapsed: 10 }

  it('emits the first time it sees a second', () => {
    expect(nextTickGate(null, running)).toEqual({ key: 's1:10', emit: true })
  })

  it('does NOT emit again for the same second', () => {
    // Extra renders inside one second are normal: every mutation's onSettled
    // invalidates the focus query, which re-renders this component.
    const first = nextTickGate(null, running)
    const second = nextTickGate(first.key, running)
    expect(second.emit).toBe(false)
    expect(second.key).toBe(first.key)
  })

  it('emits again when the second advances', () => {
    const first = nextTickGate(null, running)
    const next = nextTickGate(first.key, { ...running, elapsed: 11 })
    expect(next).toEqual({ key: 's1:11', emit: true })
  })

  it('survives many repeat renders of one second without a second tick', () => {
    let key: string | null = null
    let emissions = 0
    for (let i = 0; i < 25; i += 1) {
      const result = nextTickGate(key, running)
      key = result.key
      if (result.emit) emissions += 1
    }
    expect(emissions).toBe(1)
  })
})

describe('the gate is scoped to the session', () => {
  it('ticks for a new session even at the same elapsed second', () => {
    // A pomodoro chain restarts elapsed at 0. Keyed on the number alone, the
    // next interval would be silenced at whichever second the last one ended on.
    const previous = nextTickGate(null, { allowed: true, sessionId: 's1', elapsed: 4 })
    const nextSession = nextTickGate(previous.key, {
      allowed: true,
      sessionId: 's2',
      elapsed: 4,
    })
    expect(nextSession).toEqual({ key: 's2:4', emit: true })
  })
})

describe('when ticking is not allowed', () => {
  const blocked = { allowed: false, sessionId: 's1', elapsed: 10 }

  it('emits nothing and clears the gate', () => {
    expect(nextTickGate('s1:9', blocked)).toEqual({ key: null, emit: false })
  })

  it('lets the second it paused on tick when it resumes', () => {
    // Holding the key across a pause would swallow exactly the tick the user
    // listens for to know the timer restarted.
    const paused = nextTickGate('s1:10', blocked)
    const resumed = nextTickGate(paused.key, { allowed: true, sessionId: 's1', elapsed: 10 })
    expect(resumed.emit).toBe(true)
  })

  it('stays silent for as long as it is disallowed', () => {
    let key: string | null = 's1:9'
    for (let elapsed = 10; elapsed < 20; elapsed += 1) {
      const result = nextTickGate(key, { allowed: false, sessionId: 's1', elapsed })
      expect(result.emit).toBe(false)
      key = result.key
    }
    expect(key).toBeNull()
  })
})
