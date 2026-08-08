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

/**
 * Seconds actually focused so far (excludes all paused time).
 *
 * ── THE `Math.max(0, …)` ON THE CURRENT PAUSE IS A BUG FIX, NOT TIDINESS ────
 *
 * `now` comes from `useNow`, which STOPS updating the moment the session is
 * paused — so while paused it holds the value from the last tick, up to a second
 * BEFORE the click. `paused_at` is stamped at the click. That makes
 * `now - pausedAt` a small NEGATIVE number, and `Math.floor(-0.3)` is **-1**,
 * not 0. Subtracting -1 ADDED a second to elapsed, so the display dropped one
 * second the instant Pause was pressed: 24:45 became 24:44 with no time passing.
 *
 * Evaluating a paused session AT `paused_at` — never before it — freezes the
 * clock on the value it genuinely held when the button was pressed, and holds it
 * there whether the next read happens a millisecond or a day later. `resume()`
 * below has always clamped this span at zero; `elapsedSeconds` did not, and that
 * asymmetry was the bug.
 *
 * ONE FLOOR, AT THE END. Flooring the gross time and the pause separately let
 * their rounding errors compound, so a pause could cost or gain a second purely
 * from where the two boundaries happened to fall. Subtracting in milliseconds
 * and flooring once cannot do that.
 */
export function elapsedSeconds(t: FocusTiming, nowMs: number): number {
  // Reading a paused session AT the pause instant is what makes its value
  // canonical: `now` before it and `now` long after it both yield the same
  // answer, so the screen, a reload and the resume all agree.
  const at = t.pausedAtMs !== null ? Math.max(nowMs, t.pausedAtMs) : nowMs
  const currentPauseMs = t.pausedAtMs !== null ? at - t.pausedAtMs : 0
  const focusedMs = at - t.startedAtMs - t.accumulatedPausedSeconds * 1000 - currentPauseMs
  return Math.max(0, Math.floor(focusedMs / 1000))
}

/**
 * The anchor that makes the countdown RESUME on exactly where it froze.
 *
 * ── WHY RESUMING NEEDED ITS OWN ARITHMETIC ─────────────────────────────────
 *
 * Resuming used to add the pause to `accumulated_paused_seconds` and let
 * `elapsedSeconds` recompute from the original start. Two independent roundings
 * then decided the answer — the whole elapsed span and the pause span — so the
 * display could land a second either side of where it froze. Worse, `useNow` did
 * not re-sync on resume, so for up to a second the screen showed a value
 * computed from a STALE `now` against an already-grown accumulated total: the
 * countdown jumped UP by the length of the pause, then snapped back.
 *
 * ── WHY IT SHIFTS BY THE REMAINDER AND NOT TO THE DISPLAYED SECOND ─────────
 *
 * The obvious fix is to re-anchor onto the whole second that was on screen. It
 * is exact for one resume and WRONG over many: each pause would throw away the
 * sub-second remainder of the work before it, so forty pause/resume cycles of
 * 3.4s lost sixteen real seconds of focus — silently, into `actual_seconds`.
 *
 * `accumulated_paused_seconds` only ever grows by WHOLE seconds (`resume()`
 * floors), so the pause's remainder is the precise amount that would otherwise
 * be double-counted as focus. Adding exactly that to the anchor conserves
 * focused milliseconds across every cycle: the resumed clock reads the frozen
 * value, advances one second later, and drifts by nothing however often it is
 * paused.
 *
 * The DATABASE is untouched by this. `accumulated_paused_seconds` is still
 * written in whole seconds and is still what a reload recovers from; this is the
 * live display, for as long as this session is on screen.
 */
export function resumeAnchorMs(
  startedAtMs: number,
  pausedAtMs: number,
  resumeAtMs: number,
): number {
  const pausedForMs = Math.max(0, resumeAtMs - pausedAtMs)
  const wholeSeconds = Math.floor(pausedForMs / 1000)
  return startedAtMs + (pausedForMs - wholeSeconds * 1000)
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
