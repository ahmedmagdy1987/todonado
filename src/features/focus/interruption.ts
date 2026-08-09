/**
 * LOGGING AN INTERRUPTION, as a pure state machine.
 *
 * The requirement that shapes all of it: the confirmation sound must mean "this
 * was RECORDED", not "you pressed a button". A sound on press is a lie whenever
 * the write then fails — and the write can fail, since it is a PATCH to
 * `focus_sessions` over the network.
 *
 * ── THE AUTOPLAY PROBLEM THIS SOLVES ───────────────────────────────────────
 *
 * Success arrives asynchronously, by which time the click's user activation is
 * long gone, so a context created THERE would be suspended and the confirmation
 * would never sound. The two are therefore split: the click UNLOCKS audio (it is
 * a real gesture, which is the only moment that permission exists), and the
 * success CONFIRMS. Unlocking is idempotent and silent, so doing it on a click
 * that later fails costs nothing and makes no sound.
 *
 * ── WHY THE IN-FLIGHT GUARD ────────────────────────────────────────────────
 *
 * A second click while the first PATCH is still open used to send a second
 * `interruptions: session.interruptions + 1` computed from the SAME rendered
 * value — so two clicks could write the same number twice, tallying one
 * interruption and playing two confirmations for it. Dropping the second click
 * fixes both halves: one log, one sound, and the count can no longer lose an
 * increment to a stale read. It is a guard on a rapid double-press, not a rate
 * limit — the gate opens again the moment the write settles, success or failure.
 */
export interface InterruptionState {
  /** A log PATCH is open. */
  inFlight: boolean
}

export const IDLE_INTERRUPTION: InterruptionState = { inFlight: false }

export type InterruptionEvent = 'click' | 'success' | 'error'

export interface InterruptionAction {
  state: InterruptionState
  /** Send the mutation. */
  log: boolean
  /** Get the shared AudioContext going while we still hold user activation. */
  unlock: boolean
  /** Play the confirmation. ONLY ever true for a successful write. */
  confirm: boolean
}

export function reduceInterruption(
  state: InterruptionState,
  event: InterruptionEvent,
): InterruptionAction {
  switch (event) {
    case 'click':
      if (state.inFlight) {
        // Ignored entirely: no second write, and therefore no second sound.
        return { state, log: false, unlock: false, confirm: false }
      }
      return { state: { inFlight: true }, log: true, unlock: true, confirm: false }
    case 'success':
      return { state: IDLE_INTERRUPTION, log: false, unlock: false, confirm: true }
    case 'error':
      // No sound on failure. The existing error UX is what tells the user.
      return { state: IDLE_INTERRUPTION, log: false, unlock: false, confirm: false }
  }
}
