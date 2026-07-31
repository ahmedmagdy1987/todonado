import { buildNoiseLoop, type NoiseKind } from './noise'
import { encodeWav } from './wav'

/**
 * Turn a noise colour into something an <audio> element can play, and give it
 * back when we are done with it.
 *
 * ── WHY SIX SECONDS ──────────────────────────────────────────────────────────
 * Long enough that the ear cannot pick out a repeating pattern (noise has no
 * melody to recognise, so the only tell is periodicity, and six seconds is well
 * past where that is perceptible), short enough that generating it is
 * instantaneous and the blob is about half a megabyte rather than tens.
 *
 * ── WHY 22.05 kHz ────────────────────────────────────────────────────────────
 * Half the usual rate halves the memory. For white noise that costs the top
 * octave, which is the harshest part and the least missed; for pink and brown,
 * where the energy is already tilted downward, it costs almost nothing
 * audible. The saving is real: 44.1 kHz would be a megabyte per track.
 */
const SAMPLE_RATE = 22_050
const SECONDS = 6
/** A quarter second of crossfade at the loop point. See `crossfadeLoop`. */
const FADE_SECONDS = 0.25

/**
 * One object URL per colour, built on demand and kept for the session.
 *
 * Generating is fast but not free (six seconds of samples through a filter),
 * and a user who stops and restarts the same track should not pay for it twice.
 * The cache is module-level rather than component-level precisely because the
 * player unmounts when a track is stopped.
 */
const urls = new Map<NoiseKind, string>()

/** A distinct seed per colour, so the three do not share the same sample data. */
const SEEDS: Record<NoiseKind, number> = { white: 0x5eed, pink: 0xc0ffee, brown: 0xbead }

/**
 * A playable URL for the requested colour.
 *
 * Synchronous on purpose: it is called from the click that started playback, so
 * the element gets its source inside the same user gesture and the browser's
 * autoplay policy stays satisfied. Six seconds of arithmetic is a few
 * milliseconds; making it async would move the `play()` call out of the gesture
 * and reintroduce exactly the problem the focus chime already learned about.
 */
export function noiseObjectUrl(kind: NoiseKind): string {
  const cached = urls.get(kind)
  if (cached) return cached

  const samples = buildNoiseLoop(kind, {
    sampleRate: SAMPLE_RATE,
    seconds: SECONDS,
    fadeSeconds: FADE_SECONDS,
    seed: SEEDS[kind],
  })
  const bytes = encodeWav(samples, SAMPLE_RATE)
  // `slice()` hands the Blob its own ArrayBuffer rather than a view into a
  // buffer we still hold a reference to.
  const url = URL.createObjectURL(new Blob([bytes.slice().buffer], { type: 'audio/wav' }))
  urls.set(kind, url)
  return url
}

/**
 * Drop every generated blob.
 *
 * An object URL keeps its Blob alive until it is revoked, so without this the
 * three loops would sit in memory for the life of the tab. Called when the
 * player unmounts: the URL is cheap to rebuild and expensive to hoard.
 */
export function releaseNoiseUrls(): void {
  for (const url of urls.values()) {
    try {
      URL.revokeObjectURL(url)
    } catch {
      /* already gone, or no URL API in this environment */
    }
  }
  urls.clear()
}

/** For tests and for anyone wondering how big the thing in memory is. */
export const NOISE_LOOP = { sampleRate: SAMPLE_RATE, seconds: SECONDS, fadeSeconds: FADE_SECONDS }
