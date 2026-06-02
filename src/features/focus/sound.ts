/**
 * One soft, short end-tone (opt-in). Deliberately gentle — no loud alarms.
 * Wrapped in try/catch so an unavailable/locked AudioContext never throws.
 */
export function playEndTone(): void {
  try {
    const ctx = new AudioContext()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.type = 'sine'
    osc.frequency.value = 660
    const now = ctx.currentTime
    gain.gain.setValueAtTime(0.0001, now)
    gain.gain.exponentialRampToValueAtTime(0.12, now + 0.05)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.8)
    osc.start(now)
    osc.stop(now + 0.85)
    osc.onended = () => void ctx.close()
  } catch {
    // ignore — sound is a non-critical nicety
  }
}
