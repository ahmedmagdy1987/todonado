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
export const TONES: Record<ChimeToneId, { notes: Note[]; peak: number }> = {
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
 * Peak gain of one countdown tick, before the device volume scales it.
 *
 * Exported so `sound.test.ts` can assert the one property that must hold however
 * this is retuned: a tick is quieter than every chime. Nothing else imports it.
 */
export const TICK_PEAK = 0.075

/**
 * One soft tick, for the optional per-second countdown sound.
 *
 * ── WHY IT IS NOT A `TONES` ENTRY ──────────────────────────────────────────
 *
 * The chimes play ONCE, at the end. This plays sixteen hundred times in a
 * 25-minute sprint, so it is tuned for a completely different job: it has to be
 * audible without ever becoming something you notice — a soft wooden tock rather
 * than a beep. Anything longer starts to hum; anything louder becomes a
 * metronome you cannot ignore.
 *
 * ── THE TUNING WAS RAISED ONCE, AND HERE IS WHAT MOVED ─────────────────────
 *
 * Shipped at peak 0.035 / 1150 Hz / 25 ms decay it was inaudible in a normal
 * room over a laptop speaker: too quiet to hear and too high to carry.
 *
 *   peak   0.035 -> 0.075   still BELOW every chime (0.10-0.14), so the end of
 *                           the session stays clearly louder than a tick and
 *                           the ending is never ambiguous
 *   freq   1150  -> 900 Hz  small speakers and phones roll off above ~1 kHz;
 *                           900 Hz is the same tock, actually reproduced
 *   decay  25    -> 45 ms   long enough to have a body you can hear, short
 *                           enough that it cannot ring into the next second
 *
 * The ceiling is deliberate, and `sound.test.ts` pins it: a tick that reached
 * chime level would make the completion chime stop meaning anything. If it is
 * still too quiet, the device VOLUME slider is the control for that — it scales
 * this peak — not this constant.
 *
 * It reuses the SAME shared AudioContext as the chime. A second context would
 * be a second thing to unlock from a gesture, and browsers cap how many a page
 * may create.
 *
 * SILENT WHEN THE MASTER SWITCH IS OFF, exactly like `playEndTone`. "Sounds off"
 * has to mean off everywhere, not off in the places somebody remembered.
 */
export function playTick(): void {
  const prefs = getPrefs()
  if (!prefs.sound || prefs.volume <= 0) return
  const audio = audioCtx()
  if (!audio) return
  try {
    const start = audio.currentTime
    const osc = audio.createOscillator()
    const gain = audio.createGain()
    osc.connect(gain)
    gain.connect(audio.destination)
    osc.type = 'sine'
    osc.frequency.value = 900
    const peak = TICK_PEAK * Math.min(1, Math.max(0, prefs.volume))
    gain.gain.setValueAtTime(0.0001, start)
    gain.gain.exponentialRampToValueAtTime(peak, start + 0.004)
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.045)
    osc.start(start)
    // One-shot: the node stops itself and is collected. Nothing accumulates,
    // which is why the ticking needs no teardown of its own.
    osc.stop(start + 0.05)
  } catch {
    // ignore — sound is a non-critical nicety
  }
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
