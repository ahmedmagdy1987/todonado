/**
 * WHAT THE TWO FOCUS AUDIO BUTTONS SAY, AND WHAT STATE THEY REPORT.
 *
 * ── THE PROBLEM THIS FIXES ─────────────────────────────────────────────────
 *
 * The two controls were correct and unreadable. A speaker icon next to a clock
 * icon, both unlabelled, does not tell anyone that the speaker means ONLY the
 * end-of-session chime and the clock means ONLY the per-second tick. The
 * universal reading of a speaker icon is "all sound", so the one control that
 * governs the least was the one that looked like it governed everything.
 *
 * Nothing about the AUDIO changes here. Each button still toggles exactly what
 * it toggled before; it now says which one it is.
 *
 * ── `aria-pressed` IS THE PREFERENCE, NOT THE AUDIBILITY ────────────────────
 *
 * This was implemented the other way round first, as `enabled && masterSound`,
 * on the reasoning that a control should not claim to be on while nothing can
 * be heard. That is wrong, and not by a fine margin.
 *
 * `aria-pressed` reports THE STATE THE BUTTON CHANGES. These buttons change one
 * thing each: the end-chime preference, and the countdown-tick preference. The
 * master "Sounds & notices" switch is a different control, on a different
 * screen, that neither of these buttons can touch. Look at what pressing
 * actually does (`toggleTick` in RunningView): it branches on `prefs.tick`, the
 * preference, and never on audibility.
 *
 * So with the tick preference ON and the master switch OFF, the old code
 * produced this:
 *
 *   aria-pressed  false          ("not pressed")
 *   accessible    "Countdown ticking off. Tap to play a clock tick..."
 *   pressing it   turns the preference OFF
 *   afterwards    aria-pressed is STILL false
 *
 * Three failures at once: the state is misreported, the label instructs the
 * user to do the exact opposite of what the press will do, and the button
 * appears to do NOTHING to anyone relying on the announced state, because it
 * reads false before and after. A toggle whose reported state cannot change is
 * a broken toggle.
 *
 * `pressed` is therefore the preference alone. Audibility is real and still
 * worth showing, so it is carried separately in `audible` and `mutedByMaster`,
 * where it drives the icon, the dimming and the wording, and where it cannot
 * corrupt the button's state.
 *
 * ── WHY A MODULE ───────────────────────────────────────────────────────────
 *
 * Same reason as `ticking.ts`, `tickGate.ts` and `interruption.ts`: the unit
 * suite runs in `node` with no DOM and no renderer, so a label written inline in
 * JSX is a label nothing can assert.
 *
 * ── THE NAMING RULE ────────────────────────────────────────────────────────
 *
 * NEITHER CONTROL MAY BE CALLED "Sound" OR "Audio" ON ITS OWN. Those are exactly
 * the words that made the speaker icon ambiguous in the first place: they read
 * as "all of it". Every string below names the specific thing it governs, the
 * chime at the END or the tick WHILE IT RUNS. The test enforces it, because the
 * shorter word is always the tempting one when space is tight.
 */

export interface AudioControlView {
  /** The visible text, shown beside the icon where the row has room for it. */
  label: string
  /** Always present, on every screen size. This is what a screen reader gets. */
  ariaLabel: string
  /** The tooltip. Explains the effect, not just the state. */
  title: string
  /**
   * `aria-pressed`, and the selected styling. THE PREFERENCE THIS BUTTON OWNS,
   * never the audibility. See the header.
   */
  pressed: boolean
  /** Preference on AND master switch on: a press right now would be heard. */
  audible: boolean
  /** On, but silenced by the master switch. Drives the dimmed treatment. */
  mutedByMaster: boolean
  /**
   * What `pressed` becomes if the button is activated.
   *
   * Exists so the ARIA contract is a test rather than a promise: a toggle must
   * always move to the opposite state, including while the master switch is off.
   */
  pressResult: boolean
}

export interface AudioControlState {
  /** This control's own preference. The thing the button toggles. */
  enabled: boolean
  /** The master "Sounds & notices" switch. A DIFFERENT control, elsewhere. */
  masterSound: boolean
}

/**
 * "Off" and "on but globally muted" are different sentences, deliberately.
 *
 * Collapsing them was the first version's other mistake: a user whose chime is
 * ON and inaudible needs to be sent to Settings, while a user whose chime is OFF
 * needs to press this button. One message cannot serve both, and the wrong one
 * sends people to the wrong place.
 */
interface Phrasing {
  /** Reads after "Tap to play ...". */
  play: string
  /** Reads after "Tap to mute ...". */
  mute: string
}

function copyFor(
  name: string,
  what: Phrasing,
  { enabled, masterSound }: AudioControlState,
): Pick<AudioControlView, 'ariaLabel' | 'title'> {
  if (enabled && !masterSound) {
    const state = `${name} is on, but muted while “Sounds & notices” is switched off in Settings`
    return { ariaLabel: `${state}. Tap to turn ${name} off`, title: state }
  }
  if (!enabled && !masterSound) {
    // Both are off. Say so, and warn that pressing this alone will not be heard,
    // otherwise the press looks broken.
    const state = `${name} is off, and “Sounds & notices” is switched off in Settings too`
    return { ariaLabel: `${state}. Tap to turn ${name} on`, title: state }
  }
  if (enabled) {
    return { ariaLabel: `${name} on. Tap to mute ${what.mute}`, title: `${name} on. Tap to mute` }
  }
  return { ariaLabel: `${name} off. Tap to play ${what.play}`, title: `Play ${what.play}` }
}

function build(name: string, what: Phrasing, state: AudioControlState): AudioControlView {
  return {
    label: name,
    ...copyFor(name, what, state),
    pressed: state.enabled,
    audible: state.enabled && state.masterSound,
    mutedByMaster: state.enabled && !state.masterSound,
    pressResult: !state.enabled,
  }
}

export function endChimeControl(state: AudioControlState): AudioControlView {
  return build(
    'End chime',
    {
      play: 'a chime when the Focus timer ends',
      mute: 'the chime that plays when the Focus timer ends',
    },
    state,
  )
}

export function countdownTickControl(state: AudioControlState): AudioControlView {
  return build(
    'Countdown tick',
    {
      play: 'a clock tick while the Focus timer runs',
      mute: 'the tick that plays while the Focus timer runs',
    },
    state,
  )
}
