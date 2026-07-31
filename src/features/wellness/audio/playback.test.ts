import { describe, expect, it } from 'vitest'
import {
  FADE_MS,
  fadeGain,
  msUntilDeadline,
  sleepDeadline,
  sleepElapsed,
  sleepRemainingSeconds,
} from './playback'
import { decodeWavSamples, encodeWav, tagAt } from './wav'
import { buildNoiseLoop, peakOf } from './noise'

describe('fadeGain', () => {
  it('runs 0 to 1 on the way in, and 1 to 0 on the way out', () => {
    expect(fadeGain(0, 400, 'in')).toBeCloseTo(0, 6)
    expect(fadeGain(400, 400, 'in')).toBeCloseTo(1, 6)
    expect(fadeGain(0, 400, 'out')).toBeCloseTo(1, 6)
    expect(fadeGain(400, 400, 'out')).toBeCloseTo(0, 6)
  })

  it('is monotonic, so a fade never audibly reverses', () => {
    let previous = -1
    for (let ms = 0; ms <= FADE_MS; ms += 10) {
      const g = fadeGain(ms, FADE_MS, 'in')
      expect(g).toBeGreaterThanOrEqual(previous)
      previous = g
    }
  })

  it('is EQUAL-POWER, not linear: the midpoint sits above half', () => {
    // A linear ramp reads as "quiet for ages, then a rush". The quarter-sine
    // crosses 0.707 at the halfway mark, which is what sounds even.
    expect(fadeGain(FADE_MS / 2, FADE_MS, 'in')).toBeCloseTo(Math.SQRT1_2, 3)
    expect(fadeGain(FADE_MS / 2, FADE_MS, 'in')).toBeGreaterThan(0.5)
  })

  it('clamps rather than extrapolating past either end', () => {
    expect(fadeGain(-100, 400, 'in')).toBe(0)
    expect(fadeGain(99_999, 400, 'in')).toBeCloseTo(1, 6)
    expect(fadeGain(99_999, 400, 'out')).toBeCloseTo(0, 6)
  })

  it('survives a zero or nonsense duration without dividing by it', () => {
    expect(fadeGain(10, 0, 'in')).toBe(1)
    expect(fadeGain(10, 0, 'out')).toBe(0)
    expect(fadeGain(Number.NaN, 400, 'in')).toBe(1)
    expect(Number.isNaN(fadeGain(10, Number.NaN, 'in'))).toBe(false)
  })
})

describe('the sleep timer', () => {
  const NOW = 1_800_000_000_000

  it('turns minutes into a wall-clock deadline', () => {
    expect(sleepDeadline(30, NOW)).toBe(NOW + 30 * 60_000)
  })

  it('treats no timer and zero minutes as the same absence', () => {
    expect(sleepDeadline(0, NOW)).toBeNull()
    expect(sleepDeadline(-5, NOW)).toBeNull()
    expect(sleepDeadline(Number.NaN, NOW)).toBeNull()
  })

  it('counts down in whole seconds and never goes negative', () => {
    const deadline = sleepDeadline(1, NOW)!
    expect(sleepRemainingSeconds(deadline, NOW)).toBe(60)
    expect(sleepRemainingSeconds(deadline, NOW + 59_500)).toBe(1)
    expect(sleepRemainingSeconds(deadline, NOW + 60_000)).toBe(0)
    // The display must not read "-3" after the tab wakes up late.
    expect(sleepRemainingSeconds(deadline, NOW + 500_000)).toBe(0)
  })

  it('rounds UP, so the last fraction of a second still shows a second', () => {
    const deadline = NOW + 1
    expect(sleepRemainingSeconds(deadline, NOW)).toBe(1)
  })

  it('reports no countdown when there is no timer', () => {
    expect(sleepRemainingSeconds(null, NOW)).toBe(0)
  })

  it('fires exactly at the deadline, not before', () => {
    const deadline = sleepDeadline(5, NOW)!
    expect(sleepElapsed(deadline, deadline - 1)).toBe(false)
    expect(sleepElapsed(deadline, deadline)).toBe(true)
    expect(sleepElapsed(deadline, deadline + 60_000)).toBe(true)
    expect(sleepElapsed(null, NOW)).toBe(false)
  })

  it('schedules ONE timeout rather than trusting a 1 Hz interval', () => {
    /*
     * Background tabs throttle intervals to about once a minute, and a locked
     * phone can suspend them outright — which is precisely the situation a
     * sleep timer exists for. A single long timeout is honoured far better.
     */
    const deadline = sleepDeadline(30, NOW)!
    expect(msUntilDeadline(deadline, NOW)).toBe(30 * 60_000)
    expect(msUntilDeadline(deadline, NOW + 29 * 60_000)).toBe(60_000)
    // Never negative: a wake-up past the deadline schedules an immediate stop.
    expect(msUntilDeadline(deadline, NOW + 99 * 60_000)).toBe(0)
    expect(msUntilDeadline(null, NOW)).toBeNull()
  })
})

describe('encodeWav', () => {
  const RATE = 8000

  it('writes a header a decoder can actually read', () => {
    const bytes = encodeWav(new Float32Array([0, 0.5, -0.5]), RATE)
    expect(tagAt(bytes, 0)).toBe('RIFF')
    expect(tagAt(bytes, 8)).toBe('WAVE')
    expect(tagAt(bytes, 12)).toBe('fmt ')
    expect(tagAt(bytes, 36)).toBe('data')
    expect(bytes.byteLength).toBe(44 + 3 * 2)
  })

  it('round-trips the samples within 16-bit precision', () => {
    const original = buildNoiseLoop('pink', { sampleRate: RATE, seconds: 0.25, seed: 2 })
    const { sampleRate, samples } = decodeWavSamples(encodeWav(original, RATE))
    expect(sampleRate).toBe(RATE)
    expect(samples).toHaveLength(original.length)
    for (let i = 0; i < original.length; i += 1) {
      expect(Math.abs(samples[i] - original[i])).toBeLessThan(1 / 32767 + 1e-6)
    }
  })

  it('CLAMPS instead of wrapping, which is the difference between loud and broken', () => {
    // An out-of-range sample that wrapped would flip sign: the loudest possible
    // positive value becoming the loudest negative one, heard as a hard click.
    const { samples } = decodeWavSamples(encodeWav(new Float32Array([2, -2, 1, -1]), RATE))
    expect(samples[0]).toBeGreaterThan(0.99)
    expect(samples[1]).toBeCloseTo(-1, 3)
    expect(samples[2]).toBeGreaterThan(0.99)
    expect(samples[3]).toBeCloseTo(-1, 3)
  })

  it('turns a non-finite sample into silence rather than garbage', () => {
    const { samples } = decodeWavSamples(
      encodeWav(new Float32Array([Number.NaN, Infinity, -Infinity]), RATE),
    )
    expect(Array.from(samples)).toEqual([0, 0, 0])
  })

  it('refuses a nonsense sample rate', () => {
    expect(() => encodeWav(new Float32Array(4), 0)).toThrow(/positive/)
    expect(() => encodeWav(new Float32Array(4), -1)).toThrow(/positive/)
  })

  it('encodes a full generated loop without clipping it', () => {
    const loop = buildNoiseLoop('brown', { sampleRate: 22_050, seconds: 0.5, seed: 6 })
    const { samples } = decodeWavSamples(encodeWav(loop, 22_050))
    expect(peakOf(samples)).toBeLessThanOrEqual(0.95)
    expect(peakOf(samples)).toBeGreaterThan(0.5)
  })
})
