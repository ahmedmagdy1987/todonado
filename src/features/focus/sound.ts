import { getPrefs, type ChimeToneId } from '@/features/settings/prefs'

/**
 * Opt-in end-of-session chime.
 *
 * A SINGLE shared AudioContext is created and resumed from a user gesture (the
 * sound toggle) and then reused for the completion chime. This matters: a
 * context created later (when the timer hits 0, with no gesture) is suspended by
 * the browser's autoplay policy and stays silent — which is why the button used
 * to do nothing. Deliberately soft: gentle sine notes, never an alarm.
 *
 * TONE AND VOLUME COME FROM THE DEVICE PREFERENCE, not from the call site.
 * `playEndTone()` keeps its exact signature — breathwork, the focus timer, the
 * break screen and the marketing demo all import it — so every existing caller
 * respects the setting with no change at all. The master `sound` switch is
 * honoured here too, which is what makes "sounds off" mean off everywhere rather
 * than off in the places somebody remembered to check.
 *
 * NO AUDIO FILES. Every tone is synthesised from oscillators, so there is
 * nothing to license, nothing to download and nothing to cache. That is also why
 * there are three of them and not thirty.
 */
let ctx: AudioContext | null = null

function audioCtx(): AudioContext | null {
  try {
    if (!ctx) ctx = new AudioContext()
    if (ctx.state === 'suspended') void ctx.resume()
    return ctx
  } catch {
    return null
  }
}

interface Note {
  freq: number
  /** Seconds after the start of the chime. */
  at: number
  /** Seconds the note rings for. */
  hold: number
}

/** Each tone is a short sequence of sine notes. Peak gain is scaled by volume. */
const TONES: Record<ChimeToneId, { notes: Note[]; peak: number }> = {
  soft: {
    notes: [
      { freq: 660, at: 0, hold: 0.5 },
      { freq: 880, at: 0.18, hold: 0.5 },
    ],
    peak: 0.12,
  },
  bell: {
    notes: [{ freq: 1046.5, at: 0, hold: 1.1 }],
    peak: 0.1,
  },
  low: {
    notes: [
      { freq: 330, at: 0, hold: 0.6 },
      { freq: 440, at: 0.2, hold: 0.6 },
    ],
    peak: 0.14,
  },
}

/**
 * Play the end chime, using the device's chosen tone and volume.
 *
 * Call it from a click handler at least once (e.g. when enabling sound) so the
 * shared context is unlocked for the later, gesture-less completion chime.
 * Silent when the master sound preference is off or the volume is 0.
 */
export function playEndTone(): void {
  const prefs = getPrefs()
  if (!prefs.sound || prefs.volume <= 0) return
  playTone(prefs.tone, prefs.volume)
}

/**
 * Play a specific tone, bypassing the master switch.
 * Used ONLY by the Settings preview, where the point is to hear the thing you
 * are choosing — including while deciding whether to switch sound on.
 */
export function playTone(toneId: ChimeToneId, volume: number): void {
  const audio = audioCtx()
  if (!audio) return
  const tone = TONES[toneId] ?? TONES.soft
  const level = Math.min(1, Math.max(0, volume))
  if (level <= 0) return
  try {
    const base = audio.currentTime
    for (const note of tone.notes) {
      const osc = audio.createOscillator()
      const gain = audio.createGain()
      osc.connect(gain)
      gain.connect(audio.destination)
      osc.type = 'sine'
      osc.frequency.value = note.freq
      const start = base + note.at
      // exponentialRamp cannot reach 0, hence the tiny floor at both ends.
      gain.gain.setValueAtTime(0.0001, start)
      gain.gain.exponentialRampToValueAtTime(tone.peak * level, start + 0.04)
      gain.gain.exponentialRampToValueAtTime(0.0001, start + note.hold)
      osc.start(start)
      osc.stop(start + note.hold + 0.05)
    }
  } catch {
    // ignore — sound is a non-critical nicety
  }
}
