/**
 * Timing helpers for the focus widget (W3). Its own module so the landing's
 * first-paint chunk carries only what the hero actually needs.
 */

/** The focus widget runs a 25-SECOND stand-in for a 25-minute sprint. */
export const DEMO_FOCUS_SECONDS = 25

/** Format a second count as a `m:ss` timer face. */
export function formatDemoClock(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds))
  const mins = Math.floor(s / 60)
  const secs = s % 60
  return `${mins}:${String(secs).padStart(2, '0')}`
}

/** 0..1 elapsed fraction of the demo sprint, clamped. */
export function demoFocusProgress(remainingSeconds: number): number {
  const remaining = Math.min(DEMO_FOCUS_SECONDS, Math.max(0, remainingSeconds))
  return (DEMO_FOCUS_SECONDS - remaining) / DEMO_FOCUS_SECONDS
}
