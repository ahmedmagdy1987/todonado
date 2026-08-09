import { describe, expect, it } from 'vitest'
import { IDLE_INTERRUPTION, reduceInterruption, type InterruptionState } from './interruption'

/**
 * The confirmation sound must mean RECORDED, not PRESSED.
 *
 * Every case below is a statement about when audio is allowed to happen, which
 * is the only thing that makes the sound trustworthy: if it plays on the press,
 * it is a lie whenever the write then fails, and the user is told a distraction
 * was tallied when it was not.
 */
describe('logging an interruption', () => {
  it('sends the write and unlocks audio on the click', () => {
    const action = reduceInterruption(IDLE_INTERRUPTION, 'click')
    expect(action.log).toBe(true)
    // Unlocking must happen HERE — the click is the only moment the browser
    // grants permission, and success arrives long after that activation is gone.
    expect(action.unlock).toBe(true)
    // But no sound yet: nothing has been recorded.
    expect(action.confirm).toBe(false)
    expect(action.state.inFlight).toBe(true)
  })

  it('plays exactly one confirmation on success', () => {
    const clicked = reduceInterruption(IDLE_INTERRUPTION, 'click')
    const settled = reduceInterruption(clicked.state, 'success')
    expect(settled.confirm).toBe(true)
    expect(settled.state.inFlight).toBe(false)
  })

  it('plays NOTHING on failure', () => {
    const clicked = reduceInterruption(IDLE_INTERRUPTION, 'click')
    const failed = reduceInterruption(clicked.state, 'error')
    expect(failed.confirm).toBe(false)
    expect(failed.log).toBe(false)
    expect(failed.state.inFlight).toBe(false)
  })
})

describe('a rapid double press', () => {
  it('does not log twice and does not sound twice', () => {
    const first = reduceInterruption(IDLE_INTERRUPTION, 'click')
    const second = reduceInterruption(first.state, 'click')
    expect(second.log).toBe(false)
    expect(second.confirm).toBe(false)
    expect(second.unlock).toBe(false)

    // Only the one open write settles, so only one confirmation is emitted.
    const settled = reduceInterruption(second.state, 'success')
    expect(settled.confirm).toBe(true)
  })

  it('counts one sound per successful write over a burst', () => {
    let state: InterruptionState = IDLE_INTERRUPTION
    let logs = 0
    let sounds = 0
    for (let i = 0; i < 6; i += 1) {
      const click = reduceInterruption(state, 'click')
      state = click.state
      if (click.log) logs += 1
    }
    const settled = reduceInterruption(state, 'success')
    state = settled.state
    if (settled.confirm) sounds += 1
    expect(logs).toBe(1)
    expect(sounds).toBe(1)
  })

  it('reopens the gate once the write settles, either way', () => {
    for (const outcome of ['success', 'error'] as const) {
      const clicked = reduceInterruption(IDLE_INTERRUPTION, 'click')
      const settled = reduceInterruption(clicked.state, outcome)
      // Not a rate limit: the next genuine interruption logs immediately.
      expect(reduceInterruption(settled.state, 'click').log).toBe(true)
    }
  })
})
