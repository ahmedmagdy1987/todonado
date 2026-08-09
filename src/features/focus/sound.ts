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
/** The tick's noise transient, generated once and reused (see `playTick`). */
let noiseBuffer: AudioBuffer | null = null

function audioCtx(): AudioContext | null {
  try {
    if (!ctx) ctx = new AudioContext()
    if (ctx.state === 'suspended') void ctx.resume()
    return ctx
  } catch {
    return null
  }
}

/**
 * HOW FAR AHEAD OF `currentTime` EVERY SHORT ONE-SHOT IS SCHEDULED.
 *
 * ── THIS CONSTANT IS THE COUNTDOWN-TICK BUG FIX. READ BEFORE REMOVING IT. ───
 *
 * `AudioContext.currentTime` is the time of the sample frame FOLLOWING the block
 * the audio thread has already rendered. It is therefore always slightly in the
 * past by the time anything you schedule against it is evaluated: one render
 * quantum at minimum, plus however long the main thread takes to hand the graph
 * over.
 *
 * The tick used to schedule its ENTIRE envelope — 4 ms attack, decay done by
 * 45 ms — starting at exactly `currentTime`, from inside a React commit, on the
 * one frame per second when the main thread is busiest. When the audio thread
 * reached those events they had all expired, so the gain param skipped the ramp
 * to peak and took the tail value (the 0.0001 floor) instead. The oscillator ran
 * and connected correctly and produced silence. That is why the control appeared
 * to do nothing at any gain: the level was never the problem, the SCHEDULE was.
 *
 * The end chime never showed the symptom because its notes ring for 0.5-1.1 s —
 * losing the first few milliseconds off the front of a one-second bell is
 * inaudible. Losing the first few milliseconds off a 45 ms tick is the whole
 * tick.
 *
 * A 25 ms lead clears a render quantum and ordinary main-thread jitter with room
 * to spare, and is far below the ~100 ms at which a delay becomes perceptible —
 * against a once-per-second cadence it cannot be noticed at all.
 *
 * IT ALSO FIXES THE SUSPENDED-CONTEXT CASE, which is a second, independent way
 * this went silent (see `unlockAudio`). A suspended context's `currentTime` is
 * frozen, so events scheduled AT it are already stale the moment `resume()`
 * lands. Scheduled a lead ahead of it, they are still in the future when the
 * clock starts moving, and the sound plays.
 */
export const SCHEDULE_LEAD_SECONDS = 0.025

/**
 * What the audio hardware can currently do for us.
 *
 * `blocked` is NOT a failure: `resume()` is asynchronous, so a context unlocked
 * from a real user gesture still reports `suspended` for a moment afterwards.
 * Only `unavailable` — no constructor, or construction threw — means the sound
 * genuinely cannot happen, and it is the only state a caller should surface to
 * the user.
 */
export type AudioReadiness = 'ready' | 'blocked' | 'unavailable'

/**
 * Get the shared AudioContext going. CALL THIS FROM A USER GESTURE.
 *
 * ── THE SECOND REASON THE TICK WAS SILENT ──────────────────────────────────
 *
 * `tick` is PERSISTED (localStorage), unlike the end chime's per-session toggle.
 * So the common path for a returning user is: the preference is already true,
 * they open Focus, and the first `playTick()` of the session runs from a timer
 * effect — with no gesture anywhere near it. On a page that has not been clicked
 * yet (a reload mid-session, which this feature explicitly supports recovering
 * from) the browser's autoplay policy starts that context `suspended`, the
 * unawaited `resume()` inside `audioCtx()` never takes effect without a gesture,
 * `currentTime` stays frozen at 0, and every tick for the entire sprint is
 * scheduled into a clock that is not running. Silence, permanently, with no
 * error anywhere.
 *
 * Unlocking explicitly from the gesture that turns ticking on — and, as a
 * backstop, from the next gesture anywhere on the page (`installAudioUnlock`) —
 * is what closes that path.
 */
export function unlockAudio(): AudioReadiness {
  const audio = audioCtx()
  if (!audio) return 'unavailable'
  return audio.state === 'running' ? 'ready' : 'blocked'
}

/**
 * Resume the shared context on the next user gesture, then stop listening.
 *
 * The backstop for the case above: a page restored mid-session has had no
 * gesture, so nothing has been able to unlock audio yet. The first pointer or
 * key event anywhere does it, once, and the listeners remove themselves.
 *
 * NOT A CLOCK. No interval, no polling, no rAF — it is three event listeners
 * that fire at most once. The countdown's cadence remains `useNow` alone.
 */
export function installAudioUnlock(): () => void {
  if (typeof document === 'undefined') return () => {}
  const events = ['pointerdown', 'keydown', 'touchend'] as const
  /*
   * ONE GESTURE IS ENOUGH, so it removes itself unconditionally rather than
   * waiting to see `running`. `resume()` is a promise: the context still reports
   * `suspended` for the rest of this turn even when the unlock succeeded, so a
   * "keep listening until it is running" condition would never be satisfied on
   * the gesture that actually worked, and the listeners would leak for the whole
   * session.
   */
  const onGesture = () => {
    remove()
    unlockAudio()
  }
  const remove = () => {
    for (const e of events) document.removeEventListener(e, onGesture)
  }
  for (const e of events) document.addEventListener(e, onGesture)
  return remove
}

/** Test-only: drop the shared context so a suite doesn't inherit another's. */
export function resetAudioForTests(): void {
  ctx = null
  noiseBuffer = null
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
 * The tick's low-mid body. 660 Hz rather than the old 900 Hz: laptop and phone
 * speakers roll off steeply above ~1 kHz, and a wooden tock lives lower than a
 * beep does anyway.
 */
export const TICK_BODY_HZ = 660

/** Centre of the noise transient's bandpass — the "edge" of the tick. */
export const TICK_TRANSIENT_HZ = 2400

/**
 * The transient's level, as a fraction of `TICK_PEAK`.
 *
 * Kept low on purpose. Its job is TIMBRE, not loudness: broadband noise is what
 * makes the ear hear "tick" instead of "beep", and at this ratio the loudest
 * instant of the whole tick (body + transient) still lands below the quietest
 * chime, which is the relationship `sound.test.ts` exists to defend.
 */
export const TICK_TRANSIENT_RATIO = 0.3

/**
 * Peak gain of the interruption confirmation, before volume scales it.
 *
 * Deliberately between the tick and the quietest chime: more present than the
 * thing that happens every second, less final than the thing that ends the
 * session.
 */
export const INTERRUPTION_PEAK = 0.09

/**
 * The confirmation's two notes — a rising fifth, NOT overlapping.
 *
 * The gap matters twice: it is what makes the pair read as two deliberate notes
 * rather than a chord, and it means the loudest instant is a single note's peak,
 * so the tone can never sum above `INTERRUPTION_PEAK`.
 */
export const INTERRUPTION_NOTES = [
  { freq: 523.25, at: 0, hold: 0.065 },
  { freq: 783.99, at: 0.075, hold: 0.075 },
] as const

/**
 * Why a sound did or did not happen.
 *
 * `muted` and `unavailable` are kept apart because only one of them is worth
 * telling the user about: `muted` is their own setting working correctly,
 * `unavailable` is the browser refusing and is the case that used to fail
 * completely silently.
 */
export type SoundResult = 'played' | 'muted' | 'unavailable'

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
 * ── THE GAIN WAS RAISED TWICE AND IT WAS NEVER THE GAIN ────────────────────
 *
 * It shipped at 0.035 / 1150 Hz / 25 ms, was reported inaudible, and was raised
 * to 0.075 / 900 Hz / 45 ms. It was reported inaudible again — in production,
 * with the control switched on. It was not quiet. It was SILENT, and no amount
 * of level was ever going to fix it, because the fault was in `SCHEDULE_LEAD_
 * SECONDS`'s absence and in the context never being unlocked (`unlockAudio`).
 * Both are written up where they are fixed; read those before touching numbers.
 *
 * THE LESSON, since this is now twice: when a synthesised sound is reported
 * inaudible, prove a sample was rendered before retuning it. A Web Audio graph
 * that is built correctly, connected correctly and started correctly still
 * produces exact silence if its envelope is scheduled in the past or its clock
 * is not running, and neither raises an error.
 *
 * ── WHAT THE SOUND ACTUALLY IS NOW ─────────────────────────────────────────
 *
 *   body       660 Hz sine, 4 ms attack, decayed by 55 ms — the weight, at a
 *              frequency a laptop speaker reproduces
 *   transient  30 ms of white noise through a bandpass at 2.4 kHz, gone in
 *              12 ms — the EDGE. This is the part that makes it read as a
 *              clock rather than a beep, and a pure oscillator cannot make it:
 *              a real tick is broadband, which is exactly what noise is
 *
 * Combined they last 60 ms, so they cannot ring into the next second, and their
 * loudest possible instant stays below the quietest chime. That ceiling is
 * deliberate and `sound.test.ts` pins it: a tick at chime level would make the
 * completion chime stop meaning anything. If it is still too quiet after this,
 * the device VOLUME slider is the control — it scales these peaks.
 *
 * It reuses the SAME shared AudioContext as the chime. A second context would
 * be a second thing to unlock from a gesture, and browsers cap how many a page
 * may create.
 *
 * SILENT WHEN THE MASTER SWITCH IS OFF, exactly like `playEndTone`. "Sounds off"
 * has to mean off everywhere, not off in the places somebody remembered.
 */
export function playTick(): SoundResult {
  const prefs = getPrefs()
  if (!prefs.sound || prefs.volume <= 0) return 'muted'
  const audio = audioCtx()
  if (!audio) return 'unavailable'
  try {
    const level = Math.min(1, Math.max(0, prefs.volume))
    const start = audio.currentTime + SCHEDULE_LEAD_SECONDS

    // ── The body: a low-mid tock small speakers actually reproduce ──────────
    const osc = audio.createOscillator()
    const body = audio.createGain()
    osc.connect(body)
    body.connect(audio.destination)
    osc.type = 'sine'
    osc.frequency.value = TICK_BODY_HZ
    const bodyPeak = TICK_PEAK * level
    body.gain.setValueAtTime(0.0001, start)
    body.gain.exponentialRampToValueAtTime(bodyPeak, start + 0.004)
    body.gain.exponentialRampToValueAtTime(0.0001, start + 0.055)
    osc.start(start)
    // One-shot: the node stops itself and is collected. Nothing accumulates,
    // which is why the ticking needs no teardown of its own.
    osc.stop(start + 0.06)

    // ── The transient: what makes it a tick and not a beep ──────────────────
    const buffer = tickNoise(audio)
    if (buffer) {
      const noise = audio.createBufferSource()
      const band = audio.createBiquadFilter()
      const edge = audio.createGain()
      noise.buffer = buffer
      band.type = 'bandpass'
      band.frequency.value = TICK_TRANSIENT_HZ
      band.Q.value = 1.2
      noise.connect(band)
      band.connect(edge)
      edge.connect(audio.destination)
      edge.gain.setValueAtTime(TICK_PEAK * TICK_TRANSIENT_RATIO * level, start)
      edge.gain.exponentialRampToValueAtTime(0.0001, start + 0.012)
      noise.start(start)
      noise.stop(start + 0.02)
    }
    return 'played'
  } catch {
    // ignore — sound is a non-critical nicety
    return 'unavailable'
  }
}

/**
 * One short confirmation, played ONLY after an interruption is actually
 * recorded.
 *
 * ── WHY IT IS NOT A CHIME AND NOT A TICK ───────────────────────────────────
 *
 * Three sounds now exist in Focus and each has to be identifiable without being
 * looked at, because the user is by definition looking at something else. They
 * are separated on the axis you can actually hear — SHAPE, not level:
 *
 *   tick          one 60 ms tock, no pitch movement, once a second
 *   confirmation  TWO notes, rising, ~150 ms, only ever after a successful log
 *   end chime     0.5-1.1 s, long tail, once, at the end
 *
 * A rising pair is the conventional "recorded" sound and reads as an
 * acknowledgement rather than an alert; the two notes do not overlap, so the
 * loudest instant is one note's peak and never their sum.
 *
 * It sits BETWEEN the tick and the quietest chime (`sound.test.ts` pins the
 * order): louder than the thing that happens every second, quieter than the
 * thing that means the session is over.
 *
 * SILENT WHEN THE MASTER SWITCH IS OFF or the volume is 0, exactly like the
 * other two. It is deliberately INDEPENDENT of the countdown-tick preference —
 * wanting a confirmation when you log a distraction says nothing about wanting
 * a clock ticking for 25 minutes.
 */
export function playInterruptionTone(): SoundResult {
  const prefs = getPrefs()
  if (!prefs.sound || prefs.volume <= 0) return 'muted'
  const audio = audioCtx()
  if (!audio) return 'unavailable'
  try {
    const level = Math.min(1, Math.max(0, prefs.volume))
    const base = audio.currentTime + SCHEDULE_LEAD_SECONDS
    for (const note of INTERRUPTION_NOTES) {
      const osc = audio.createOscillator()
      const gain = audio.createGain()
      osc.connect(gain)
      gain.connect(audio.destination)
      osc.type = 'sine'
      osc.frequency.value = note.freq
      const start = base + note.at
      gain.gain.setValueAtTime(0.0001, start)
      gain.gain.exponentialRampToValueAtTime(INTERRUPTION_PEAK * level, start + 0.006)
      gain.gain.exponentialRampToValueAtTime(0.0001, start + note.hold)
      osc.start(start)
      osc.stop(start + note.hold + 0.01)
    }
    return 'played'
  } catch {
    return 'unavailable'
  }
}

/**
 * White noise for the tick's transient, generated once per context.
 *
 * 30 ms is plenty — the envelope above is done by 12 ms — and regenerating it
 * 1600 times a sprint would be pointless work on the main thread at exactly the
 * moment the main thread matters.
 */
function tickNoise(audio: AudioContext): AudioBuffer | null {
  if (noiseBuffer) return noiseBuffer
  try {
    const frames = Math.max(1, Math.floor(audio.sampleRate * 0.03))
    const buffer = audio.createBuffer(1, frames, audio.sampleRate)
    const data = buffer.getChannelData(0)
    for (let i = 0; i < frames; i += 1) data[i] = Math.random() * 2 - 1
    noiseBuffer = buffer
    return buffer
  } catch {
    // A tick with no transient is still a tick. Losing the body would not be.
    return null
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
