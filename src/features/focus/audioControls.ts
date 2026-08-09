/**
 * WHAT THE TWO FOCUS AUDIO BUTTONS SAY — as data, not as JSX.
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
 * ── WHY A MODULE ───────────────────────────────────────────────────────────
 *
 * Same reason as `ticking.ts`, `tickGate.ts` and `interruption.ts`: the unit
 * suite runs in `node` with no DOM and no renderer, so a label written inline in
 * JSX is a label nothing can assert. Here the exact wording of both controls is
 * a value, and `audioControls.test.ts` pins the properties that matter — that
 * the two are different, that each names its own sound, and that neither falls
 * back to the vague words that caused the confusion.
 *
 * ── THE NAMING RULE ────────────────────────────────────────────────────────
 *
 * NEITHER CONTROL MAY BE CALLED "Sound" OR "Audio" ON ITS OWN. Those are exactly
 * the words that made the speaker icon ambiguous in the first place: they read
 * as "all of it". Every string below names the specific thing it governs — the
 * chime at the END, or the tick WHILE IT RUNS. The test enforces it, because the
 * shorter word is always the tempting one when space is tight.
 */

export interface AudioControlView {
  /** The visible text, shown beside the icon where the row has room for it. */
  label: string
  /** Always present, on every screen size — this is what a screen reader gets. */
  ariaLabel: string
  /** The tooltip. Explains the effect, not just the state. */
  title: string
  /** Drives `aria-pressed` AND the highlighted style. One source, so they agree. */
  pressed: boolean
}

export interface AudioControlState {
  /** This control's own preference. */
  enabled: boolean
  /** The master "Sounds & notices" switch, which overrides both controls. */
  masterSound: boolean
}

/**
 * The master switch off is its own message, and it is worth the extra branch.
 *
 * Without it the button reads "tap to turn on" while Settings is silencing
 * everything, so tapping appears to do nothing and the user has no way to learn
 * why. Naming the setting is what makes it fixable.
 */
/*
 * IT STILL NAMES ITSELF WHILE MUTED, and that is not a detail.
 *
 * The first version returned one shared string here, so with the master switch
 * off both buttons had the IDENTICAL tooltip — the two controls stopped being
 * distinguishable at exactly the moment someone is most likely to be hunting
 * for which one does what. `audioControls.test.ts` caught it.
 */
const mutedElsewhere = (label: string) =>
  `${label}: muted while “Sounds & notices” is switched off in Settings`

export function endChimeControl({ enabled, masterSound }: AudioControlState): AudioControlView {
  // `pressed` is the AUDIBLE state, not the stored one: with the master switch
  // off nothing sounds, so showing the control as on would be the button
  // claiming an effect it does not have.
  const pressed = enabled && masterSound
  return {
    label: 'End chime',
    ariaLabel: pressed
      ? 'End chime on. Tap to mute the chime that plays when the Focus timer ends'
      : 'End chime off. Tap to play a chime when the Focus timer ends',
    title: !masterSound
      ? mutedElsewhere('End chime')
      : pressed
        ? 'End chime on. Tap to mute'
        : 'Play a chime when the Focus timer ends',
    pressed,
  }
}

export function countdownTickControl({
  enabled,
  masterSound,
}: AudioControlState): AudioControlView {
  const pressed = enabled && masterSound
  return {
    label: 'Countdown tick',
    ariaLabel: pressed
      ? 'Countdown ticking on. Tap to mute the tick that plays while the Focus timer runs'
      : 'Countdown ticking off. Tap to play a clock tick while the Focus timer runs',
    title: !masterSound
      ? mutedElsewhere('Countdown tick')
      : pressed
        ? 'Countdown ticking on. Tap to mute'
        : 'Play a clock tick while the Focus timer runs',
    pressed,
  }
}
