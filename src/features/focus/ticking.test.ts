import { describe, expect, it } from 'vitest'
import { shouldTick, type TickConditions } from './ticking'

/**
 * Every requirement for the optional countdown tick, as a table.
 *
 * The component that consumes this cannot be rendered here — the unit suite runs
 * in `node` with no DOM and the repo has no component-test infrastructure — so
 * the rule itself is the thing under test, and `RunningView` does nothing with
 * it but obey.
 */

/** Running, ticking enabled, master sound on: the one state that makes a sound. */
const ticking = (over: Partial<TickConditions> = {}): TickConditions => ({
  enabled: true,
  masterSound: true,
  paused: false,
  complete: false,
  ending: false,
  status: 'running',
  ...over,
})

describe('the tick sounds only while a session is genuinely running', () => {
  it('ticks in the ordinary running state', () => {
    expect(shouldTick(ticking())).toBe(true)
  })

  it('is OFF unless the user asked for it', () => {
    // The default is false in DEFAULT_PREFS; this is the other half of that
    // promise — nothing else can turn it on.
    expect(shouldTick(ticking({ enabled: false }))).toBe(false)
  })

  it('is silent while PAUSED, and sounds again on resume', () => {
    expect(shouldTick(ticking({ paused: true }))).toBe(false)
    expect(shouldTick(ticking({ paused: false }))).toBe(true)
  })

  it('resume does NOT re-enable it when the user had switched it off', () => {
    expect(shouldTick(ticking({ enabled: false, paused: true }))).toBe(false)
    expect(shouldTick(ticking({ enabled: false, paused: false }))).toBe(false)
  })

  it('stops the moment the countdown completes', () => {
    expect(shouldTick(ticking({ complete: true }))).toBe(false)
  })

  it('stops the moment End early begins, with time still on the clock', () => {
    // `ending` is separate from `complete` precisely for this case.
    expect(shouldTick(ticking({ ending: true, complete: false }))).toBe(false)
  })

  it('never ticks for a session that is not running', () => {
    for (const status of ['completed', 'abandoned'] as const) {
      expect(shouldTick(ticking({ status })), status).toBe(false)
    }
  })
})

describe('the master switch wins over the local toggle', () => {
  it('is silent when Sounds & notices is off, however keen the local toggle is', () => {
    expect(shouldTick(ticking({ masterSound: false }))).toBe(false)
  })

  it('every running combination is silent with the master off', () => {
    for (const paused of [true, false]) {
      for (const enabled of [true, false]) {
        expect(shouldTick(ticking({ masterSound: false, paused, enabled }))).toBe(false)
      }
    }
  })
})

describe('the rule is exhaustive — exactly one combination sounds', () => {
  it('sounds for one of the 64 states, and it is the running one', () => {
    const bools = [true, false]
    const statuses = ['running', 'completed', 'abandoned'] as const
    const sounding: TickConditions[] = []
    for (const enabled of bools)
      for (const masterSound of bools)
        for (const paused of bools)
          for (const complete of bools)
            for (const ending of bools)
              for (const status of statuses) {
                const c = { enabled, masterSound, paused, complete, ending, status }
                if (shouldTick(c)) sounding.push(c)
              }

    // Exactly one: enabled + master on + not paused + not complete + not ending
    // + running. Anything else sounding would be a requirement quietly lost.
    expect(sounding).toEqual([
      {
        enabled: true,
        masterSound: true,
        paused: false,
        complete: false,
        ending: false,
        status: 'running',
      },
    ])
  })
})
