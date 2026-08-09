/**
 * WHICH DISPLAYED SECOND HAS ALREADY BEEN TICKED — the dedupe rule, as one pure
 * function.
 *
 * `ticking.ts` answers "may the tick sound at all right now". This answers the
 * separate question "has this exact second already sounded", and the two are not
 * the same: a re-render caused by anything other than the clock (a cache
 * invalidation settling, a pause write landing, a parent re-rendering) runs the
 * emit effect again with the SAME elapsed value, and without a gate that second
 * ticks twice. The focus cache is invalidated on every mutation's `onSettled`,
 * so extra renders inside one second are normal, not hypothetical.
 *
 * ── WHY THE KEY CARRIES THE SESSION ID ─────────────────────────────────────
 *
 * Elapsed seconds restart at 0 for a new sprint. Keyed on the number alone, a
 * pomodoro chain's second interval would be silenced at whichever second the
 * previous one happened to stop on. The id makes every session's seconds its
 * own, so a new sprint always ticks.
 *
 * ── WHY IT IS A MODULE ─────────────────────────────────────────────────────
 *
 * Same reason as `ticking.ts`: the unit suite runs in `node` with no DOM, so a
 * rule living inside a component is a rule nothing can test. Here each row below
 * is a test case, and `RunningView` holds only a ref and calls this.
 */
export interface TickGateInput {
  /** The result of `shouldTick` — whether audio is permitted at this instant. */
  allowed: boolean
  /** The running session's id. */
  sessionId: string
  /** The displayed elapsed second. */
  elapsed: number
}

export interface TickGateResult {
  /** The gate's next value. Store it; pass it back as `previous`. */
  key: string | null
  /** Whether THIS evaluation should emit a tick. */
  emit: boolean
}

export function nextTickGate(previous: string | null, input: TickGateInput): TickGateResult {
  /*
   * NOT ALLOWED CLEARS THE GATE RATHER THAN HOLDING IT.
   *
   * Holding the last key across a pause would mean the second you paused on is
   * suppressed when you resume — audible as a missing tick exactly when the user
   * is listening for confirmation that the timer restarted.
   */
  if (!input.allowed) return { key: null, emit: false }
  const key = `${input.sessionId}:${input.elapsed}`
  if (previous === key) return { key, emit: false }
  return { key, emit: true }
}
