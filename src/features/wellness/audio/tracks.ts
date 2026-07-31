/**
 * Audio track manifest for Sleep sounds + Guided meditation.
 *
 * TWO KINDS OF TRACK, and the difference is why half of this section works
 * today and half does not.
 *
 * GENERATED tracks are arithmetic. White, pink and brown noise are synthesised
 * on the device from a seeded PRNG and a filter (see `noise.ts`), encoded to a
 * WAV blob in memory, and played by the ordinary player. There is no file, no
 * download, no bundle weight and nothing to license, so they are simply live.
 *
 * RECORDED tracks are files we do not have. Rain, thunder and ocean are
 * recordings, and this repo bundles NO copyrighted audio, so each ships with an
 * empty `src` and its card shows an honest "Audio coming soon" state rather
 * than a broken player. To enable one, set its `src` to either:
 *   - a filename/path served from /public/audio  (e.g. 'rain.mp3' -> /audio/rain.mp3), or
 *   - a full public URL (e.g. a Supabase Storage public object URL).
 * Only add files you have the right to use (owned, licensed, or CC0/public-domain).
 * See public/audio/README.md.
 */

import type { NoiseKind } from './noise'

export type AudioCategory = 'sleep' | 'meditation'

export interface AudioTrack {
  id: string
  title: string
  description: string
  category: AudioCategory
  /** Public URL or /public path. Empty/undefined => "Audio coming soon". */
  src?: string
  /**
   * Set for a GENERATED track: which colour of noise to synthesise. A track
   * with this needs no `src` and is always playable.
   */
  generator?: NoiseKind
  /** Optional length hint in seconds (mainly for guided meditation sessions). */
  durationSec?: number
}

/** Base path for files dropped into /public/audio. */
export const AUDIO_BASE_PATH = '/audio'

/**
 * Resolve a track's playable URL, or null if no source is set yet.
 * Absolute URLs and root-absolute paths pass through; a bare name is served
 * from /public/audio.
 */
export function resolveTrackSrc(track: AudioTrack): string | null {
  const s = track.src?.trim()
  if (!s) return null
  if (/^https?:\/\//i.test(s) || s.startsWith('/')) return s
  return `${AUDIO_BASE_PATH}/${s}`
}

export const AUDIO_TRACKS: AudioTrack[] = [
  // --- Sleep sounds: GENERATED, playable now, nothing to license ---
  { id: 'white-noise', title: 'White noise', description: 'Even, steady static that covers sudden sounds.', category: 'sleep', generator: 'white' },
  { id: 'pink-noise', title: 'Pink noise', description: 'Softer than white, weighted the way hearing is. The balanced one.', category: 'sleep', generator: 'pink' },
  { id: 'brown-noise', title: 'Brown noise', description: 'Deep and low, closer to a rumble than a hiss.', category: 'sleep', generator: 'brown' },

  // --- Sleep sounds: RECORDED, waiting on licensed files ---
  { id: 'rain', title: 'Rain', description: 'Gentle, steady rainfall.', category: 'sleep', src: '' },
  { id: 'thunderstorm', title: 'Thunderstorm', description: 'Distant rolling thunder over rain.', category: 'sleep', src: '' },
  { id: 'ocean', title: 'Ocean', description: 'Slow waves on the shore.', category: 'sleep', src: '' },

  // --- Guided meditation (placeholders until sessions are recorded/licensed) ---
  { id: 'morning-reset', title: 'Morning reset', description: 'A short session to set an intention for the day.', category: 'meditation', src: '', durationSec: 300 },
  { id: 'midday-breather', title: 'Midday breather', description: 'A brief pause to reset between tasks.', category: 'meditation', src: '', durationSec: 180 },
  { id: 'wind-down', title: 'Wind-down for sleep', description: 'A slower session to ease into rest.', category: 'meditation', src: '', durationSec: 600 },
]

export function tracksByCategory(category: AudioCategory): AudioTrack[] {
  return AUDIO_TRACKS.filter((t) => t.category === category)
}

/**
 * Can this track make a sound right now?
 *
 * The single availability predicate the UI reads. It used to be
 * `resolveTrackSrc(track) !== null`, which was the same question back when
 * every track was a file. A generated track has no src and is nonetheless
 * playable, so the question had to change rather than the answer.
 */
export function isTrackPlayable(track: AudioTrack): boolean {
  return track.generator != null || resolveTrackSrc(track) !== null
}

/** True for the synthesised noise tracks. */
export function isGenerated(track: AudioTrack): boolean {
  return track.generator != null
}
