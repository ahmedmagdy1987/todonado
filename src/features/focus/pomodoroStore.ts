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

/** Narrow unknown JSON to a chain, rejecting anything malformed. */
function parseChain(raw: unknown): PomodoroChain | null {
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
    brk = { kind: b.kind, minutes: b.minutes, startedAtMs: b.startedAtMs }
  }

  return {
    sessionId: (c.sessionId as string | null) ?? null,
    taskId: (c.taskId as string | null) ?? null,
    completed: c.completed,
    break: brk,
  }
}

export function readChain(): PomodoroChain | null {
  try {
    const raw = window.localStorage.getItem(KEY)
    if (!raw) return null
    return parseChain(JSON.parse(raw))
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
