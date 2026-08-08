/**
 * Pure focus-timer math. Elapsed is derived from wall-clock timestamps (+
 * accumulated paused time), NOT a tick counter — so the clock stays accurate
 * when the tab is backgrounded/throttled, and resumes correctly after reload.
 * No React, no I/O: fully unit-tested.
 */

export interface FocusTiming {
  startedAtMs: number
  accumulatedPausedSeconds: number
  /** Instant the current pause began; null when running. */
  pausedAtMs: number | null
}

/**
 * The instant to count from, given the server's `started_at` and the client clock.
 *
 * ── WHY THIS EXISTS: THE TIMER USED TO SIT STILL AFTER START ────────────────
 *
 * `focus_sessions.started_at` is stamped by PostgreSQL (`default now()`). The
 * countdown is driven by the BROWSER clock. Those are two different clocks, and
 * nothing keeps them in step.
 *
 * When the browser is behind the database — ordinary NTP skew, plus the insert
 * round trip, since `now()` is evaluated when the row is written rather than
 * when the button was pressed — `started_at` lands in the client's FUTURE.
 * `elapsedSeconds` then clamps to 0 (it must: negative elapsed would render a
 * countdown that goes UP), so the display sits at the full planned duration,
 * doing visibly nothing, until the client clock catches up.
 *
 * Never counting from the future removes that dead period without inventing
 * progress that did not happen: the worst case is starting from "now" instead of
 * a moment fractionally in the future.
 *
 * THE DATABASE STAYS AUTHORITATIVE. On a reload minutes later the server value
 * is comfortably in the past, so `min` picks it and recovery is byte-for-byte
 * what it was. This only ever bites in the seconds right after Start.
 *
 * RESOLVE IT ONCE PER SESSION. If the server value is in the future and this is
 * recomputed on every render, each recompute would move the anchor forward with
 * the clock and the timer would never advance at all — a worse bug than the one
 * being fixed. The caller pins it per session id.
 */
export function focusStartAnchorMs(serverStartedAtMs: number, clientNowMs: number): number {
  if (!Number.isFinite(serverStartedAtMs)) return clientNowMs
  return Math.min(serverStartedAtMs, clientNowMs)
}

/** Seconds actually focused so far (excludes all paused time). */
export function elapsedSeconds(t: FocusTiming, nowMs: number): number {
  const gross = Math.floor((nowMs - t.startedAtMs) / 1000)
  const currentPause = t.pausedAtMs !== null ? Math.floor((nowMs - t.pausedAtMs) / 1000) : 0
  return Math.max(0, gross - t.accumulatedPausedSeconds - currentPause)
}

export function remainingSeconds(plannedMinutes: number, elapsed: number): number {
  return Math.max(0, plannedMinutes * 60 - elapsed)
}

export function isComplete(plannedMinutes: number, elapsed: number): boolean {
  return elapsed >= plannedMinutes * 60
}

/** Begin a pause (idempotent if already paused). */
export function pause(t: FocusTiming, nowMs: number): FocusTiming {
  if (t.pausedAtMs !== null) return t
  return { ...t, pausedAtMs: nowMs }
}

/** Resume, folding the just-ended pause into accumulated paused time. */
export function resume(t: FocusTiming, nowMs: number): FocusTiming {
  if (t.pausedAtMs === null) return t
  const pausedFor = Math.max(0, Math.floor((nowMs - t.pausedAtMs) / 1000))
  return {
    startedAtMs: t.startedAtMs,
    accumulatedPausedSeconds: t.accumulatedPausedSeconds + pausedFor,
    pausedAtMs: null,
  }
}

/** Sessions shorter than this when ended early are treated as abandoned. */
export const MIN_MEANINGFUL_SECONDS = 60

export function endStatusFor(elapsed: number): 'completed' | 'abandoned' {
  return elapsed >= MIN_MEANINGFUL_SECONDS ? 'completed' : 'abandoned'
}

/** Format seconds as MM:SS (minutes may exceed 59, e.g. "90:00"). */
export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds))
  const minutes = Math.floor(s / 60)
  const seconds = s % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}
