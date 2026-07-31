/**
 * The timing arithmetic behind the player: fades, and the sleep-timer deadline.
 *
 * Pure on purpose. Both of these are the kind of thing that looks obviously
 * correct and is quietly wrong at the edges (a fade that divides by zero when
 * the duration is 0, a countdown that goes negative and renders "-0:03"), and
 * neither is pleasant to debug by listening.
 */

/**
 * Gain at `elapsed` ms through a fade, equal-power rather than linear.
 *
 * A linear ramp on a broadband noise signal is audibly wrong: perceived
 * loudness follows roughly the square root of power, so a straight line sounds
 * like it lingers quiet and then rushes. The quarter-sine gives a fade that
 * sounds even, which for something you fall asleep to is the whole point.
 *
 * Clamped at both ends so a caller that overshoots gets silence or full volume,
 * never an extrapolated number.
 */
export function fadeGain(elapsedMs: number, durationMs: number, direction: 'in' | 'out'): number {
  if (!Number.isFinite(elapsedMs) || !Number.isFinite(durationMs) || durationMs <= 0) {
    return direction === 'in' ? 1 : 0
  }
  const t = Math.max(0, Math.min(1, elapsedMs / durationMs))
  const shaped = Math.sin((t * Math.PI) / 2)
  return direction === 'in' ? shaped : 1 - shaped
}

/** How long a fade runs. Long enough to hear as smooth, short enough to obey. */
export const FADE_MS = 400

/**
 * When a sleep timer set for `minutes` should stop the sound.
 * `null` means no timer, which is a different thing from "zero minutes from now".
 */
export function sleepDeadline(minutes: number, now: number): number | null {
  if (!Number.isFinite(minutes) || minutes <= 0) return null
  return now + minutes * 60_000
}

/**
 * Whole seconds left, never negative.
 *
 * `ceil` so the display reads "1s" for the final fraction rather than flicking
 * to 0 while sound is still coming out.
 */
export function sleepRemainingSeconds(deadline: number | null, now: number): number {
  if (deadline === null || !Number.isFinite(deadline)) return 0
  return Math.max(0, Math.ceil((deadline - now) / 1000))
}

/** Has the deadline passed? Separate from the countdown so both can be tested. */
export function sleepElapsed(deadline: number | null, now: number): boolean {
  return deadline !== null && now >= deadline
}

/**
 * Milliseconds to wait before the auto-stop should fire.
 *
 * Used to schedule ONE timeout rather than polling a 1 Hz interval. Background
 * tabs throttle intervals hard (a locked phone can suspend them for minutes),
 * and a sleep timer that fires late is at its least accurate in exactly the
 * situation it exists for. A single long timeout is honoured far better, and
 * the wall-clock comparison still has the final say when the tab wakes up.
 */
export function msUntilDeadline(deadline: number | null, now: number): number | null {
  if (deadline === null) return null
  return Math.max(0, deadline - now)
}
