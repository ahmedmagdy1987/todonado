import { describe, expect, it } from 'vitest'
import {
  bandTilt,
  buildNoiseLoop,
  crossfadeLoop,
  generateNoise,
  mulberry32,
  normalise,
  peakOf,
  isNoiseKind,
  type NoiseKind,
} from './noise'

/**
 * The three colours have to BE three colours.
 *
 * "It made a noise" is not a test: white, pink and brown all make a noise, and
 * a broken pink filter still makes a noise. What separates them is the spectral
 * slope, so that is what is measured here, with a seeded generator so the
 * measurement is the same on every machine and every run.
 */

const RATE = 44_100
const seeded = (n = 1) => mulberry32(n)

describe('mulberry32', () => {
  it('is deterministic for a seed and different across seeds', () => {
    const a = Array.from({ length: 8 }, seeded(42))
    const b = Array.from({ length: 8 }, seeded(42))
    const c = Array.from({ length: 8 }, seeded(43))
    expect(a).toEqual(b)
    expect(a).not.toEqual(c)
  })

  it('stays inside [0, 1)', () => {
    const rng = seeded(7)
    for (let i = 0; i < 10_000; i += 1) {
      const v = rng()
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
  })
})

describe('generateNoise', () => {
  const kinds: NoiseKind[] = ['white', 'pink', 'brown']

  it.each(kinds)('%s produces finite, unclipped samples', (kind) => {
    const s = generateNoise(kind, RATE, seeded())
    expect(s).toHaveLength(RATE)
    for (let i = 0; i < s.length; i += 1) {
      expect(Number.isFinite(s[i]), `sample ${i} is not finite`).toBe(true)
    }
    // Before normalisation the only hard requirement is that it has not run
    // away: a leaky integrator that leaks too little drifts to enormous values.
    expect(peakOf(s), `${kind} ran away`).toBeLessThan(10)
  })

  it.each(kinds)('%s is deterministic for a seed', (kind) => {
    expect(Array.from(generateNoise(kind, 2048, seeded(9)))).toEqual(
      Array.from(generateNoise(kind, 2048, seeded(9))),
    )
  })

  it.each(kinds)('%s is not silent and not a constant', (kind) => {
    const s = generateNoise(kind, 8192, seeded())
    expect(peakOf(s)).toBeGreaterThan(0.001)
    expect(new Set(Array.from(s.slice(0, 200))).size).toBeGreaterThan(50)
  })

  it('refuses a nonsense length instead of allocating something strange', () => {
    expect(() => generateNoise('white', 0, seeded())).toThrow(/positive integer/)
    expect(() => generateNoise('white', -5, seeded())).toThrow(/positive integer/)
    expect(() => generateNoise('white', 1.5, seeded())).toThrow(/positive integer/)
  })
})

describe('spectral slope: the colours are actually different colours', () => {
  // One second is plenty for a Goertzel bin and keeps the suite fast.
  const white = normalise(generateNoise('white', RATE, seeded(11)))
  const pink = normalise(generateNoise('pink', RATE, seeded(11)))
  const brown = normalise(generateNoise('brown', RATE, seeded(11)))

  const tiltWhite = bandTilt(white, RATE)
  const tiltPink = bandTilt(pink, RATE)
  const tiltBrown = bandTilt(brown, RATE)

  it('white is roughly flat', () => {
    // Equal energy per hertz, so low and high bands measure about the same.
    // Generous bounds: this is a stochastic signal, not a sine sweep.
    expect(tiltWhite).toBeGreaterThan(0.2)
    expect(tiltWhite).toBeLessThan(5)
  })

  it('pink falls off, and white does not', () => {
    expect(tiltPink).toBeGreaterThan(tiltWhite * 3)
  })

  it('brown falls off much harder than pink', () => {
    // ~6 dB/octave against ~3, over ~5 octaves between the bands.
    expect(tiltBrown).toBeGreaterThan(tiltPink * 3)
  })

  it('the ordering is strict, which is the property that matters', () => {
    expect(tiltWhite).toBeLessThan(tiltPink)
    expect(tiltPink).toBeLessThan(tiltBrown)
  })
})

describe('normalise', () => {
  it('puts the peak exactly on target', () => {
    const s = normalise(generateNoise('brown', 4096, seeded(3)), 0.9)
    expect(peakOf(s)).toBeCloseTo(0.9, 5)
  })

  it('never exceeds the target, which is what stops it clipping', () => {
    for (const kind of ['white', 'pink', 'brown'] as NoiseKind[]) {
      const s = normalise(generateNoise(kind, 8192, seeded(5)), 0.9)
      expect(peakOf(s), `${kind} clips`).toBeLessThanOrEqual(0.9 + 1e-6)
    }
  })

  it('leaves silence alone rather than dividing by zero', () => {
    const silent = new Float32Array(64)
    const out = normalise(silent)
    expect(peakOf(out)).toBe(0)
    for (const v of out) expect(Number.isNaN(v)).toBe(false)
  })
})

describe('crossfadeLoop', () => {
  it('shortens the buffer by exactly the fade', () => {
    const s = generateNoise('white', 1000, seeded())
    expect(crossfadeLoop(s, 100)).toHaveLength(900)
  })

  it('JOINS THE SEAM: the end meets the start without a jump', () => {
    /*
     * The whole point. A raw noise buffer on repeat clicks once per loop,
     * forever, because the last sample and the first are unrelated. After the
     * crossfade the two ends are the same material, so the step across the seam
     * is no larger than an ordinary step inside the buffer.
     */
    const fade = 512
    const raw = generateNoise('pink', 8192 + fade, seeded(21))
    const looped = crossfadeLoop(raw, fade)

    const seamJump = Math.abs(looped[0] - looped[looped.length - 1])
    let worstInside = 0
    for (let i = 1; i < looped.length; i += 1) {
      worstInside = Math.max(worstInside, Math.abs(looped[i] - looped[i - 1]))
    }
    expect(seamJump, 'the loop point is a click').toBeLessThanOrEqual(worstInside)
  })

  it('is measurably better than not crossfading at all', () => {
    // The negative control, in-suite: the same buffer without the join.
    const fade = 512
    const raw = generateNoise('brown', 8192 + fade, seeded(21))
    const joined = crossfadeLoop(raw, fade)
    const naive = raw.slice(0, raw.length - fade)

    const jump = (b: Float32Array) => Math.abs(b[0] - b[b.length - 1])
    // Brown noise wanders, so an unjoined seam is a large step; the joined one
    // is small. If this ever inverts, the crossfade has stopped working.
    expect(jump(joined)).toBeLessThan(jump(naive))
  })

  it('keeps every sample finite', () => {
    const out = crossfadeLoop(generateNoise('brown', 4096, seeded()), 256)
    for (let i = 0; i < out.length; i += 1) expect(Number.isFinite(out[i])).toBe(true)
  })

  it('refuses a fade that would eat the buffer', () => {
    expect(() => crossfadeLoop(new Float32Array(100), 80)).toThrow(/leaves no room/)
  })

  it('a zero fade is a copy, not a crash', () => {
    const s = generateNoise('white', 64, seeded())
    expect(Array.from(crossfadeLoop(s, 0))).toEqual(Array.from(s))
  })
})

describe('buildNoiseLoop', () => {
  it.each(['white', 'pink', 'brown'] as NoiseKind[])(
    '%s: right length, no clipping, no NaN',
    (kind) => {
      const seconds = 0.5
      const buf = buildNoiseLoop(kind, { sampleRate: RATE, seconds, fadeSeconds: 0.05, seed: 4 })
      expect(buf).toHaveLength(Math.round(seconds * RATE))
      expect(peakOf(buf)).toBeLessThanOrEqual(0.9 + 1e-6)
      expect(peakOf(buf)).toBeGreaterThan(0.5)
      for (let i = 0; i < buf.length; i += 1) expect(Number.isFinite(buf[i])).toBe(true)
    },
  )

  it('normalises AFTER the crossfade, so the seam cannot be the one clipping part', () => {
    // Summing two signals can exceed either of them. Normalising first would
    // leave the joined region above the target; this asserts it does not.
    const buf = buildNoiseLoop('brown', { sampleRate: RATE, seconds: 0.5, fadeSeconds: 0.1, seed: 8 })
    expect(peakOf(buf)).toBeLessThanOrEqual(0.9 + 1e-6)
  })

  it('is deterministic for a seed', () => {
    const a = buildNoiseLoop('pink', { sampleRate: 8000, seconds: 0.2, seed: 77 })
    const b = buildNoiseLoop('pink', { sampleRate: 8000, seconds: 0.2, seed: 77 })
    expect(Array.from(a)).toEqual(Array.from(b))
  })

  it('CLAMPS an over-long fade instead of throwing at the caller', () => {
    // This test caught it: 0.2s at 8kHz is 1600 samples, and the default
    // quarter-second fade is 2000 — longer than the loop it is folding into.
    // A helper that explodes on its own default is a trap for the next caller.
    const buf = buildNoiseLoop('pink', { sampleRate: 8000, seconds: 0.2, seed: 77 })
    expect(buf).toHaveLength(1600)
    expect(peakOf(buf)).toBeLessThanOrEqual(0.9 + 1e-6)
  })

  it('still refuses a request too short to be a loop at all', () => {
    expect(() => buildNoiseLoop('white', { sampleRate: 8000, seconds: 0.0001 })).toThrow(
      /too short to loop/,
    )
  })
})

describe('isNoiseKind', () => {
  it('accepts the three and nothing else', () => {
    expect(isNoiseKind('white')).toBe(true)
    expect(isNoiseKind('pink')).toBe(true)
    expect(isNoiseKind('brown')).toBe(true)
    expect(isNoiseKind('rain')).toBe(false)
    expect(isNoiseKind(undefined)).toBe(false)
  })
})
