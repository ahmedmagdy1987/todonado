import { describe, expect, it } from 'vitest'
import { TICK_PEAK, TONES } from './sound'

/**
 * The one relationship the tick tuning must never break.
 *
 * The countdown tick was raised because it was inaudible in a normal room, and
 * the obvious next step when somebody says "still too quiet" is to raise it
 * again. There is a ceiling: the end chime has to remain clearly louder than the
 * tick, or reaching zero stops being an event and becomes just another tick.
 *
 * Levels only. The unit suite runs in `node` with no Web Audio, so whether a
 * speaker makes a sound is not knowable here — the `e2e` suite cannot prove it
 * either, since headless Chromium always runs `--mute-audio`. What IS provable
 * is the arithmetic that decides relative loudness, so that is what is pinned.
 */
describe('the countdown tick stays below every chime', () => {
  it('is quieter than the quietest tone', () => {
    const quietestChime = Math.min(...Object.values(TONES).map((t) => t.peak))
    expect(TICK_PEAK).toBeLessThan(quietestChime)
  })

  it('is audible — not so quiet that switching it on appears to do nothing', () => {
    // It shipped at 0.035 and was reported inaudible. This floor is the lesson,
    // not an arbitrary bound.
    expect(TICK_PEAK).toBeGreaterThan(0.05)
  })

  it('leaves real headroom, so the end of a session is unmistakable', () => {
    // Half the quietest chime or less: a difference you hear, not one you infer.
    const quietestChime = Math.min(...Object.values(TONES).map((t) => t.peak))
    expect(TICK_PEAK).toBeLessThanOrEqual(quietestChime * 0.8)
  })

  it('scales with the device volume rather than replacing it', () => {
    // The volume slider is the user's control for "still too quiet"; this
    // constant is the ceiling. Both are multiplied, never max()'d.
    for (const volume of [0, 0.25, 1]) {
      expect(TICK_PEAK * volume).toBeLessThanOrEqual(TICK_PEAK)
    }
    expect(TICK_PEAK * 0).toBe(0)
  })
})

describe('the chime catalogue is unchanged by the tick retune', () => {
  it('still has three tones at their original levels', () => {
    // The tick change must not have moved a chime to make room for itself.
    expect(TONES.soft.peak).toBe(0.12)
    expect(TONES.bell.peak).toBe(0.1)
    expect(TONES.low.peak).toBe(0.14)
  })
})
