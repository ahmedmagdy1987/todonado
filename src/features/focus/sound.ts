/**
 * Opt-in end-of-session chime.
 *
 * A SINGLE shared AudioContext is created and resumed from a user gesture (the
 * sound toggle) and then reused for the completion chime. This matters: a
 * context created later (when the timer hits 0, with no gesture) is suspended by
 * the browser's autoplay policy and stays silent — which is why the button used
 * to do nothing. Deliberately soft: two gentle sine notes, never an alarm.
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

/**
 * Play the soft two-note end chime. Call it from a click handler at least once
 * (e.g. when enabling sound) so the shared context is unlocked for the later,
 * gesture-less completion chime.
 */
export function playEndTone(): void {
  const audio = audioCtx()
  if (!audio) return
  try {
    const base = audio.currentTime
    ;[660, 880].forEach((freq, i) => {
      const osc = audio.createOscillator()
      const gain = audio.createGain()
      osc.connect(gain)
      gain.connect(audio.destination)
      osc.type = 'sine'
      osc.frequency.value = freq
      const start = base + i * 0.18
      gain.gain.setValueAtTime(0.0001, start)
      gain.gain.exponentialRampToValueAtTime(0.12, start + 0.04)
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.5)
      osc.start(start)
      osc.stop(start + 0.55)
    })
  } catch {
    // ignore — sound is a non-critical nicety
  }
}
