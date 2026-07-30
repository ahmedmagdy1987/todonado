import type { FocusSession } from '@/types/database'
import { sessionsOn } from './selectors'

/**
 * Pomodoro cadence math — the break phases and the cycle counter.
 *
 * Pure, React-free, no I/O. Sits alongside `timer.ts` rather than inside it:
 * `elapsedSeconds` / `pause` / `resume` / `formatClock` are byte-identical to
 * before, so every existing consumer (breathwork's pacer, the audio player, the
 * insights aggregates) is untouched.
 *
 * ── THE DESIGN DECISION, AND WHY ────────────────────────────────────────────
 * A pomodoro chain is **one `focus_sessions` row per work interval**, with the
 * break held as device-local UI state. The tempting alternative — one long row
 * whose elapsed time contains the breaks — was rejected because it silently
 * corrupts everything downstream:
 *
 *   • `insights.focusStats` sums `actual_seconds` for every finished row, so
 *     break minutes would be reported as focus minutes, in Insights, in the
 *     weekly review, in `estimationBias`, and on every task row's focus total.
 *   • `isComplete(planned_minutes, elapsed)` and the ring's `elapsed / total`
 *     would have to mean two different things at once.
 *
 * With one row per interval, a 4-pomodoro chain is simply four completed
 * 25-minute focus sessions — which is exactly what it *was*. Every existing
 * number stays true with **no migration, no new column, and no change to what
 * `actual_seconds` means**.
 *
 * ── WHY THE BREAK IS NOT A ROW ──────────────────────────────────────────────
 * A break is not work, so recording it as a focus session would make
 * `endStatusFor` mark a skipped 5-minute break as an *abandoned session* and
 * drag the completion rate down. It is genuinely ephemeral UI state, and it is
 * treated as such — but it is still **timestamp-derived, never tick-counted**
 * (the whole point of `timer.ts`), so a break survives a reload, a backgrounded
 * tab and a throttled interval with the correct time remaining.
 *
 * The trade-off, stated plainly: the chain lives in this device's
 * localStorage. Open the same running session on another device and it behaves
 * as a plain 25-minute sprint. That is acceptable — a running timer is a
 * here-and-now thing — and it is why nothing important (the session itself, its
 * duration, its focus time) depends on the chain record.
 */

export interface PomodoroCadence {
  /** Length of one work interval. */
  workMinutes: number
  /** The short break after most work intervals. */
  breakMinutes: number
  /** The longer break after every `cyclesBeforeLongBreak`-th interval. */
  longBreakMinutes: number
  cyclesBeforeLongBreak: number
}

/**
 * ONE cadence, deliberately. docs/SUPERAPP_ROADMAP.md flags pomodoro presets as
 * a scope-creep trap ("table-stakes parity, not a differentiator") and says to
 * cap it if built at all. The classic 25/5, long break every 4, is the one
 * everybody already knows — and the existing Focus setup still offers 25/50/90
 * and any custom duration for anyone who wants something else.
 */
export const POMODORO: PomodoroCadence = {
  workMinutes: 25,
  breakMinutes: 5,
  longBreakMinutes: 15,
  cyclesBeforeLongBreak: 4,
}

export type BreakKind = 'break' | 'long-break'

export interface PomodoroBreak {
  kind: BreakKind
  minutes: number
  /** Wall-clock instant the break began. The break clock is derived from this. */
  startedAtMs: number
}

export interface PomodoroChain {
  /** The focus_sessions row this chain is currently running, if any. */
  sessionId: string | null
  /**
   * The task the chain is working on (null = general focus). Carried across
   * breaks so the next interval continues the same work instead of dropping the
   * user back to a blank task picker every 25 minutes.
   */
  taskId: string | null
  /** Work intervals FINISHED in this chain. */
  completed: number
  /** The break in progress, or null while working. */
  break: PomodoroBreak | null
}

/**
 * Which break follows the `completed`-th work interval (1-based).
 * Long break on every multiple of `cyclesBeforeLongBreak` — so 4, 8, 12 — and
 * the short break otherwise. `completed` of 0 or less has no break yet and
 * falls through to the short one rather than throwing.
 */
export function breakAfter(
  completed: number,
  c: PomodoroCadence = POMODORO,
): { kind: BreakKind; minutes: number } {
  const isLong =
    completed > 0 && c.cyclesBeforeLongBreak > 0 && completed % c.cyclesBeforeLongBreak === 0
  return isLong
    ? { kind: 'long-break', minutes: c.longBreakMinutes }
    : { kind: 'break', minutes: c.breakMinutes }
}

/**
 * Position of the NEXT work interval inside the current set, 1-based.
 * With `cyclesBeforeLongBreak: 4` this cycles 1,2,3,4,1,2,3,4… so the UI can
 * honestly say "3 of 4 before a long break" without storing a counter.
 */
export function cyclePosition(completed: number, c: PomodoroCadence = POMODORO): number {
  if (c.cyclesBeforeLongBreak <= 0) return 1
  return (Math.max(0, completed) % c.cyclesBeforeLongBreak) + 1
}

/** Seconds left in a break, derived from its start instant. Never negative. */
export function breakRemainingSeconds(b: PomodoroBreak, nowMs: number): number {
  const total = b.minutes * 60
  const elapsed = Math.floor(Math.max(0, nowMs - b.startedAtMs) / 1000)
  return Math.max(0, total - elapsed)
}

/** Break progress 0..1. Clamped at both ends; 1 for a zero-length break. */
export function breakProgress(b: PomodoroBreak, nowMs: number): number {
  const total = b.minutes * 60
  if (total <= 0) return 1
  const elapsed = Math.floor(Math.max(0, nowMs - b.startedAtMs) / 1000)
  return Math.min(1, Math.max(0, elapsed / total))
}

export function isBreakOver(b: PomodoroBreak, nowMs: number): boolean {
  return breakRemainingSeconds(b, nowMs) <= 0
}

// ---------------------------------------------------------------------------
//  Chain reducers — pure. Every transition is a function of the previous chain
//  plus `nowMs`, so the whole lifecycle is unit-testable without a browser.
// ---------------------------------------------------------------------------

/** Begin a chain on a freshly started work interval. */
export function startChain(sessionId: string, taskId: string | null = null): PomodoroChain {
  return { sessionId, taskId, completed: 0, break: null }
}

/**
 * A work interval finished: bank it and open the break it earns.
 * Idempotent per session id is NOT assumed — the caller guards that (the same
 * single-shot ref pattern `RunningView` already uses for ending a session),
 * because "how many times did this fire" is a React concern, not a math one.
 */
export function completeWorkInterval(
  chain: PomodoroChain,
  nowMs: number,
  c: PomodoroCadence = POMODORO,
): PomodoroChain {
  const completed = chain.completed + 1
  const { kind, minutes } = breakAfter(completed, c)
  return {
    sessionId: null,
    taskId: chain.taskId,
    completed,
    break: { kind, minutes, startedAtMs: nowMs },
  }
}

/** The break is over (or skipped) and the next interval has started. */
export function beginNextWorkInterval(chain: PomodoroChain, sessionId: string): PomodoroChain {
  return { sessionId, taskId: chain.taskId, completed: chain.completed, break: null }
}

/** Drop the break without starting another interval — the chain is over. */
export function endBreak(chain: PomodoroChain): PomodoroChain {
  return { ...chain, break: null }
}

/**
 * Pomodoros completed on a local day, straight from the session rows.
 * A pomodoro is a COMPLETED work interval of exactly the cadence's length, so
 * this survives a cleared localStorage, a different device and a reload — the
 * chain record is only ever an optimisation for the live UI, never the record.
 */
export function pomodorosCompletedOn(
  sessions: FocusSession[],
  dayISO: string,
  c: PomodoroCadence = POMODORO,
): number {
  return sessionsOn(sessions, dayISO).filter(
    (s) => s.status === 'completed' && s.planned_minutes === c.workMinutes,
  ).length
}

/** Human label for a break kind. */
export function breakLabel(kind: BreakKind): string {
  return kind === 'long-break' ? 'long break' : 'break'
}
