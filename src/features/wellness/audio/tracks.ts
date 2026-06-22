/**
 * Audio track manifest for Sleep sounds + Guided meditation.
 *
 * AUDIO CONTENT: this repo bundles NO copyrighted audio. Every track below ships
 * with an empty `src`, so its card shows an "Audio coming soon" state instead of
 * a broken player. To enable a track, set its `src` to either:
 *   - a filename/path served from /public/audio  (e.g. 'rain.mp3' -> /audio/rain.mp3), or
 *   - a full public URL (e.g. a Supabase Storage public object URL).
 * Only add files you have the right to use (owned, licensed, or CC0/public-domain).
 * See public/audio/README.md.
 */

export type AudioCategory = 'sleep' | 'meditation'

export interface AudioTrack {
  id: string
  title: string
  description: string
  category: AudioCategory
  /** Public URL or /public path. Empty/undefined => "Audio coming soon". */
  src?: string
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
  // --- Sleep sounds (loop-friendly ambient) ---
  { id: 'white-noise', title: 'White noise', description: 'Steady, even static to mask distractions.', category: 'sleep', src: '' },
  { id: 'rain', title: 'Rain', description: 'Gentle, steady rainfall.', category: 'sleep', src: '' },
  { id: 'thunderstorm', title: 'Thunderstorm', description: 'Distant rolling thunder over rain.', category: 'sleep', src: '' },
  { id: 'ocean', title: 'Ocean', description: 'Slow waves on the shore.', category: 'sleep', src: '' },
  { id: 'brown-noise', title: 'Brown noise', description: 'Deeper, softer low-frequency noise.', category: 'sleep', src: '' },

  // --- Guided meditation (placeholders until sessions are recorded/licensed) ---
  { id: 'morning-reset', title: 'Morning reset', description: 'A short session to set an intention for the day.', category: 'meditation', src: '', durationSec: 300 },
  { id: 'midday-breather', title: 'Midday breather', description: 'A brief pause to reset between tasks.', category: 'meditation', src: '', durationSec: 180 },
  { id: 'wind-down', title: 'Wind-down for sleep', description: 'A slower session to ease into rest.', category: 'meditation', src: '', durationSec: 600 },
]

export function tracksByCategory(category: AudioCategory): AudioTrack[] {
  return AUDIO_TRACKS.filter((t) => t.category === category)
}
