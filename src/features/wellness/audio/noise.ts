/**
 * Generated sleep noise: white, pink and brown, made from arithmetic.
 *
 * ── WHY THIS EXISTS ──────────────────────────────────────────────────────────
 * The sleep-sounds section shipped with a player and no audio, because rain and
 * ocean recordings have to be licensed and this repo bundles no copyrighted
 * sound. Noise is different: it IS a formula. There is nothing to license, no
 * file to serve, and no bundle weight, so the three noise tracks can be real
 * today while the recorded ambience stays honestly unavailable.
 *
 * Everything here is PURE and deterministic: samples in, samples out, seeded
 * RNG, no Web Audio types, no DOM. That is what makes the spectral behaviour
 * testable rather than a thing you have to listen to and hope.
 *
 * ── THE THREE COLOURS ────────────────────────────────────────────────────────
 * White has equal energy per hertz: a flat spectrum, and the harshest of the
 * three. Pink falls at about 3 dB per octave, which is roughly how human
 * hearing weights loudness, so it sounds "even" rather than bright. Brown (a
 * random walk, the sound of Brownian motion) falls at about 6 dB per octave and
 * is the deep, ocean-ish one people usually mean by "that low rumble".
 */

export type NoiseKind = 'white' | 'pink' | 'brown'

export const NOISE_KINDS: readonly NoiseKind[] = ['white', 'pink', 'brown'] as const

export function isNoiseKind(value: unknown): value is NoiseKind {
  return typeof value === 'string' && (NOISE_KINDS as readonly string[]).includes(value)
}

/**
 * A small, fast, seeded PRNG (mulberry32).
 *
 * `Math.random()` would do for noise, but a seed makes the generator
 * reproducible, and a reproducible generator can be tested for spectral slope
 * instead of only for "did not throw".
 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Uniform white noise in [-1, 1). */
function whiteSample(rng: () => number): number {
  return rng() * 2 - 1
}

/**
 * Pink noise by Paul Kellet's refined filter.
 *
 * Seven one-pole filters summed, each an octave apart, which approximates a
 * 1/f slope closely enough that nobody can hear the difference from a "proper"
 * pinking filter. Chosen over an FFT approach because it is a handful of
 * multiply-accumulates per sample and needs no buffer of the whole signal.
 *
 * The magic constants are Kellet's; they are not adjustable knobs and changing
 * one quietly ruins the slope, which is why the spectral test exists.
 */
function makePinkFilter(): (white: number) => number {
  let b0 = 0
  let b1 = 0
  let b2 = 0
  let b3 = 0
  let b4 = 0
  let b5 = 0
  let b6 = 0
  return (white) => {
    b0 = 0.99886 * b0 + white * 0.0555179
    b1 = 0.99332 * b1 + white * 0.0750759
    b2 = 0.969 * b2 + white * 0.153852
    b3 = 0.8665 * b3 + white * 0.3104856
    b4 = 0.55 * b4 + white * 0.5329522
    b5 = -0.7616 * b5 - white * 0.016898
    const out = b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362
    b6 = white * 0.115926
    return out * 0.11 // Kellet's rough gain compensation; normalise() finishes the job
  }
}

/**
 * Brown noise: a leaky integrator over white.
 *
 * A pure integral of white noise is a random walk, and a random walk has no
 * bound: over a few hundred thousand samples it drifts far away from zero,
 * which is inaudible rumble at best and a hard clip at worst. The 0.998 leak
 * pulls it back toward zero so the result stays bounded while keeping the
 * 6 dB/octave tilt that makes it brown.
 */
function makeBrownFilter(): (white: number) => number {
  let last = 0
  return (white) => {
    last = (last + 0.02 * white) / 1.02
    return last * 3.5
  }
}

/**
 * Generate `length` samples of the requested colour.
 *
 * Deliberately NOT normalised or loop-joined here: those are separate,
 * separately testable steps, and keeping them apart is what lets the tests say
 * which one broke.
 */
export function generateNoise(kind: NoiseKind, length: number, rng: () => number): Float32Array {
  if (!Number.isInteger(length) || length <= 0) {
    throw new Error(`generateNoise: length must be a positive integer, got ${length}`)
  }
  const out = new Float32Array(length)

  if (kind === 'white') {
    for (let i = 0; i < length; i += 1) out[i] = whiteSample(rng)
    return out
  }

  const filter = kind === 'pink' ? makePinkFilter() : makeBrownFilter()
  /*
   * Warm the filter up before recording anything. Both filters start from
   * silence, so the first few thousand samples are a fade-in from zero rather
   * than the steady state — audible as a swell at the loop point, and enough to
   * skew a spectral measurement.
   */
  for (let i = 0; i < 4096; i += 1) filter(whiteSample(rng))
  for (let i = 0; i < length; i += 1) out[i] = filter(whiteSample(rng))
  return out
}

/** Largest absolute sample. 0 for an all-silent buffer. */
export function peakOf(samples: Float32Array): number {
  let peak = 0
  for (let i = 0; i < samples.length; i += 1) {
    const v = Math.abs(samples[i])
    if (v > peak) peak = v
  }
  return peak
}

/**
 * Scale so the loudest sample sits at `target`.
 *
 * Headroom is the point: brown noise in particular has large excursions, and a
 * buffer that touches 1.0 clips the moment anything else is added to it. 0.9
 * leaves room and still sounds full.
 */
export function normalise(samples: Float32Array, target = 0.9): Float32Array {
  const peak = peakOf(samples)
  if (peak === 0) return samples
  const gain = target / peak
  const out = new Float32Array(samples.length)
  for (let i = 0; i < samples.length; i += 1) out[i] = samples[i] * gain
  return out
}

/**
 * Make a buffer loop without a click, by crossfading its tail over its head.
 *
 * A raw noise buffer played on repeat has a discontinuity at the seam: the last
 * sample and the first are unrelated values, and the jump between them is a
 * click, once every loop, forever. Since this is meant to be left running all
 * night, "once every loop forever" is the whole product.
 *
 * The fix takes the final `fade` samples, ramps them down while ramping the
 * first `fade` samples up, and sums them. The result's head and tail then meet
 * continuously. Equal-power (sin/cos) rather than linear, because two
 * UNCORRELATED signals crossfaded linearly dip in loudness at the midpoint,
 * and a dip once a loop is just a quieter click.
 *
 * Returns a buffer `fade` samples shorter than the input.
 */
export function crossfadeLoop(samples: Float32Array, fade: number): Float32Array {
  const length = samples.length - fade
  if (fade <= 0) return samples.slice()
  if (length <= fade) {
    throw new Error(`crossfadeLoop: fade (${fade}) leaves no room in ${samples.length} samples`)
  }

  const out = samples.slice(0, length)
  for (let i = 0; i < fade; i += 1) {
    const t = (i + 1) / (fade + 1) // never exactly 0 or 1
    const headGain = Math.sin((t * Math.PI) / 2)
    const tailGain = Math.cos((t * Math.PI) / 2)
    out[i] = out[i] * headGain + samples[length + i] * tailGain
  }
  return out
}

export interface NoiseBufferOptions {
  sampleRate: number
  /** Seconds of audio in the finished loop. */
  seconds: number
  /** Crossfade length in seconds. */
  fadeSeconds?: number
  seed?: number
  peak?: number
}

/**
 * The whole pipeline: generate, crossfade into a seamless loop, normalise.
 *
 * Order matters. Normalising LAST means the crossfade cannot push a sample past
 * the target: summing two signals can exceed either of them, so normalising
 * first would leave the seam as the only part of the buffer that clips.
 */
export function buildNoiseLoop(kind: NoiseKind, options: NoiseBufferOptions): Float32Array {
  const { sampleRate, seconds, fadeSeconds = 0.25, seed = 1, peak = 0.9 } = options
  const loopLength = Math.round(seconds * sampleRate)
  if (loopLength < 2) {
    throw new Error(`buildNoiseLoop: ${seconds}s at ${sampleRate}Hz is too short to loop`)
  }
  /*
   * The fade is CLAMPED, not trusted. The default is a quarter of a second,
   * which is right for the six-second loops this ships with and longer than a
   * short buffer a test (or a future caller) might ask for. A crossfade cannot
   * be longer than the material it folds back into, so half the loop is the
   * ceiling; asking for more gets the most that fits rather than an exception
   * from a helper the caller has no reason to know the internals of.
   */
  const fade = Math.max(1, Math.min(Math.round(fadeSeconds * sampleRate), Math.floor(loopLength / 2)))
  const raw = generateNoise(kind, loopLength + fade, mulberry32(seed))
  return normalise(crossfadeLoop(raw, fade), peak)
}

/* ───────────────────────── measurement, for the tests ───────────────────────── */

/**
 * Magnitude of one frequency bin, by Goertzel.
 *
 * A full FFT would be a dependency or a hundred lines; the tests need eight
 * bins, and Goertzel gives one bin for a few multiplies per sample. This lives
 * in the source rather than the test file because it is also the honest way to
 * document what "pink" is being claimed to mean.
 */
export function binMagnitude(samples: Float32Array, sampleRate: number, hz: number): number {
  const k = (2 * Math.PI * hz) / sampleRate
  const coeff = 2 * Math.cos(k)
  let s0 = 0
  let s1 = 0
  let s2 = 0
  for (let i = 0; i < samples.length; i += 1) {
    s0 = samples[i] + coeff * s1 - s2
    s2 = s1
    s1 = s0
  }
  return Math.sqrt(s1 * s1 + s2 * s2 - coeff * s1 * s2) / samples.length
}

/**
 * How much steeper the spectrum falls than flat, as a ratio of low-band to
 * high-band energy. White is about 1, pink is clearly above it, brown far above
 * pink. Used by the tests to assert the colours are actually different colours.
 */
export function bandTilt(samples: Float32Array, sampleRate: number): number {
  const low = [100, 150, 200, 300]
  const high = [3000, 4000, 6000, 8000]
  const energy = (bins: number[]) =>
    bins.reduce((sum, hz) => sum + binMagnitude(samples, sampleRate, hz) ** 2, 0) / bins.length
  const lowEnergy = energy(low)
  const highEnergy = energy(high)
  return highEnergy === 0 ? Infinity : lowEnergy / highEnergy
}
