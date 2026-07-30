import type { PomodoroChain } from './pomodoro'

/**
 * The pomodoro chain's only storage: this device's localStorage.
 *
 * Deliberately NOT the database. See the header of `pomodoro.ts` for the full
 * reasoning — the short version is that the session rows are the record and this
 * is a live-UI convenience, so losing it costs a user their break countdown and
 * nothing else. Every access is wrapped: a browser with storage disabled (or a
 * quota error in private mode) degrades to "no chain", never to a crash.
 */

const KEY = 'todonado.pomodoro'

/**
 * A break older than this is abandoned state, not a live break.
 *
 * Without a bound, closing the laptop mid-break means /focus opens days later on
 * a break that finished long ago, and `completed` — equally stale — carries the
 * long-break cadence into a brand-new session. Both are the same abandoned
 * chain, so the whole record is discarded rather than only the break.
 *
 * Two hours is well beyond any real break (the longest is 15 minutes) and short
 * enough that a resumed chain is always one the user actually remembers.
 */
const MAX_BREAK_AGE_MS = 2 * 60 * 60 * 1000

/** A break timestamped slightly in the future is clock skew, not corruption. */
const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000

/** Narrow unknown JSON to a chain, rejecting anything malformed or stale. */
function parseChain(raw: unknown, nowMs: number): PomodoroChain | null {
  if (typeof raw !== 'object' || raw === null) return null
  const c = raw as Record<string, unknown>
  if (typeof c.completed !== 'number' || !Number.isFinite(c.completed) || c.completed < 0) return null
  if (c.sessionId !== null && typeof c.sessionId !== 'string') return null
  if (c.taskId !== null && c.taskId !== undefined && typeof c.taskId !== 'string') return null

  let brk: PomodoroChain['break'] = null
  if (c.break !== null && c.break !== undefined) {
    const b = c.break as Record<string, unknown>
    if (
      (b.kind !== 'break' && b.kind !== 'long-break') ||
      typeof b.minutes !== 'number' ||
      !Number.isFinite(b.minutes) ||
      b.minutes < 0 ||
      typeof b.startedAtMs !== 'number' ||
      !Number.isFinite(b.startedAtMs)
    ) {
      return null
    }
    const age = nowMs - b.startedAtMs
    if (age > MAX_BREAK_AGE_MS || age < -MAX_CLOCK_SKEW_MS) return null
    brk = { kind: b.kind, minutes: b.minutes, startedAtMs: b.startedAtMs }
  }

  return {
    sessionId: (c.sessionId as string | null) ?? null,
    taskId: (c.taskId as string | null) ?? null,
    completed: c.completed,
    break: brk,
  }
}

export function readChain(nowMs: number = Date.now()): PomodoroChain | null {
  try {
    const raw = window.localStorage.getItem(KEY)
    if (!raw) return null
    return parseChain(JSON.parse(raw), nowMs)
  } catch {
    return null
  }
}

export function writeChain(chain: PomodoroChain | null): void {
  try {
    if (chain === null) window.localStorage.removeItem(KEY)
    else window.localStorage.setItem(KEY, JSON.stringify(chain))
  } catch {
    /* storage unavailable — the chain simply won't survive a reload */
  }
}
