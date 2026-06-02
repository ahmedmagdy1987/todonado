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
