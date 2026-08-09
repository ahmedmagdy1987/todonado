import { describe, expect, it } from 'vitest'
import {
  countdownTickControl,
  endChimeControl,
  type AudioControlState,
  type AudioControlView,
} from './audioControls'
import { DEFAULT_PREFS, parsePrefs } from '@/features/settings/prefs'

const ON: AudioControlState = { enabled: true, masterSound: true }
const OFF: AudioControlState = { enabled: false, masterSound: true }
const MUTED_ON: AudioControlState = { enabled: true, masterSound: false }
const MUTED_OFF: AudioControlState = { enabled: false, masterSound: false }

const everyState = [ON, OFF, MUTED_ON, MUTED_OFF]
const bothControls = [
  { name: 'end chime', build: endChimeControl, when: 'ends' },
  { name: 'countdown tick', build: countdownTickControl, when: 'runs' },
]

/**
 * The controls were functionally correct and visually ambiguous: a speaker icon
 * beside a clock icon, neither labelled. A speaker reads as "all sound", so the
 * control governing the LEAST looked like it governed everything.
 *
 * These pin the wording, because the wording is the whole fix.
 */
describe('each control names its own sound', () => {
  it('labels the speaker as the end chime', () => {
    expect(endChimeControl(OFF).label).toBe('End chime')
  })

  it('labels the clock as the countdown tick', () => {
    expect(countdownTickControl(OFF).label).toBe('Countdown tick')
  })

  it('never gives the two controls the same label, in ANY state', () => {
    for (const state of everyState) {
      const chime = endChimeControl(state)
      const tick = countdownTickControl(state)
      expect(chime.label).not.toBe(tick.label)
      expect(chime.ariaLabel).not.toBe(tick.ariaLabel)
      // The muted tooltip was once a single shared string, so the two controls
      // became indistinguishable at exactly the moment someone is hunting for
      // which is which.
      expect(chime.title).not.toBe(tick.title)
    }
  })

  it('says WHEN each sound happens, not merely that it is a sound', () => {
    for (const { build, when } of bothControls) {
      expect(build(OFF).title.toLowerCase()).toContain(when)
      expect(build(OFF).ariaLabel.toLowerCase()).toContain(when)
      expect(build(ON).ariaLabel.toLowerCase()).toContain(when)
    }
  })

  /**
   * THE NAMING RULE. "Sound" and "Audio" are what made the speaker ambiguous,
   * they read as "all of it", and they are exactly what a future edit reaches
   * for when the row feels crowded.
   */
  it('never falls back to a bare "Sound" or "Audio" label', () => {
    for (const { build } of bothControls) {
      for (const state of everyState) {
        const label = build(state).label.toLowerCase()
        expect(['sound', 'audio', 'mute', 'sounds']).not.toContain(label)
      }
    }
  })
})

// ─────────────────────────────────────────────────────────────────────────────
//  THE ARIA CONTRACT — the semantic bug this file exists to prevent recurring
// ─────────────────────────────────────────────────────────────────────────────

/**
 * `aria-pressed` REPORTS THE STATE THE BUTTON CHANGES, and these buttons change
 * one preference each. The master "Sounds & notices" switch is a different
 * control on a different screen that neither button can touch.
 *
 * It was implemented as `enabled && masterSound` first. With the preference on
 * and the master switch off that reported "not pressed", labelled itself "tap to
 * play", and then turned the preference OFF when pressed, still reporting "not
 * pressed" afterwards. A toggle whose announced state cannot change is broken,
 * and its label instructed the opposite of what it did.
 */
describe('aria-pressed is the preference, not the audibility', () => {
  it('follows the control own preference in all four combinations', () => {
    for (const { name, build } of bothControls) {
      expect(build(ON).pressed, name).toBe(true)
      expect(build(OFF).pressed, name).toBe(false)
      // THE CASE THAT WAS WRONG: on, and silenced by a switch this button does
      // not own. The preference is still on, so the button is still pressed.
      expect(build(MUTED_ON).pressed, name).toBe(true)
      expect(build(MUTED_OFF).pressed, name).toBe(false)
    }
  })

  it('is never influenced by the master switch', () => {
    for (const { name, build } of bothControls) {
      for (const enabled of [true, false]) {
        expect(build({ enabled, masterSound: true }).pressed, name).toBe(
          build({ enabled, masterSound: false }).pressed,
        )
      }
    }
  })

  it('always moves to the opposite state when pressed', () => {
    // The toggle contract, including while the master switch is off. If this
    // ever fails, a screen reader user presses a button that announces no change.
    for (const { name, build } of bothControls) {
      for (const state of everyState) {
        const view = build(state)
        expect(view.pressResult, name).toBe(!view.pressed)
        // And pressing really does land on that state.
        expect(build({ ...state, enabled: view.pressResult }).pressed, name).toBe(view.pressResult)
      }
    }
  })

  it('tracks audibility separately, where it cannot corrupt the state', () => {
    for (const { name, build } of bothControls) {
      expect(build(ON).audible, name).toBe(true)
      expect(build(MUTED_ON).audible, name).toBe(false)
      expect(build(OFF).audible, name).toBe(false)
      expect(build(MUTED_OFF).audible, name).toBe(false)

      // Only "on but silenced elsewhere" gets the dimmed treatment.
      expect(build(MUTED_ON).mutedByMaster, name).toBe(true)
      expect(build(ON).mutedByMaster, name).toBe(false)
      expect(build(MUTED_OFF).mutedByMaster, name).toBe(false)
    }
  })
})

describe('OFF and ON-BUT-MUTED are never described as the same thing', () => {
  it('describes an on-but-muted control as ON, and points at Settings', () => {
    for (const { name, build } of bothControls) {
      const view = build(MUTED_ON)
      expect(view.title, name).toContain('is on, but muted')
      expect(view.title, name).toContain('Sounds & notices')
      expect(view.title, name).toContain('Settings')
      // Pressing turns it OFF, so that is what the label must offer.
      expect(view.ariaLabel.toLowerCase(), name).toContain('tap to turn')
      expect(view.ariaLabel.toLowerCase(), name).toContain(' off')
    }
  })

  it('describes a genuinely off control as OFF', () => {
    for (const { name, build } of bothControls) {
      expect(build(MUTED_OFF).title, name).toContain('is off')
      expect(build(MUTED_OFF).ariaLabel.toLowerCase(), name).toContain('tap to turn')
      expect(build(MUTED_OFF).ariaLabel.toLowerCase(), name).toContain(' on')
    }
  })

  it('does not confuse the two, so the user is sent to the right place', () => {
    // On-but-muted needs Settings; off needs this button. One message cannot
    // serve both without sending somebody the wrong way.
    for (const { name, build } of bothControls) {
      expect(build(MUTED_ON).title, name).not.toBe(build(MUTED_OFF).title)
      expect(build(MUTED_ON).ariaLabel, name).not.toBe(build(MUTED_OFF).ariaLabel)
      expect(build(ON).title, name).not.toBe(build(MUTED_ON).title)
    }
  })

  it('warns that turning it on alone will still be silent', () => {
    // Both off: pressing this button changes the preference but produces no
    // sound, which looks broken unless the reason is stated up front.
    for (const { name, build } of bothControls) {
      expect(build(MUTED_OFF).title, name).toContain('Sounds & notices')
    }
  })
})

describe('accessible labels survive every state, including icon-only layouts', () => {
  it('always has a non-empty aria-label and title', () => {
    // The visible label is hidden below `sm`; these two are unconditional, so
    // the narrow layout loses the word on screen and nothing else.
    for (const { name, build } of bothControls) {
      for (const state of everyState) {
        const view: AudioControlView = build(state)
        expect(view.ariaLabel.trim().length, name).toBeGreaterThan(10)
        expect(view.title.trim().length, name).toBeGreaterThan(10)
        expect(view.label.trim().length, name).toBeGreaterThan(0)
      }
    }
  })

  it('offers the action, so the label is never just a state read-out', () => {
    for (const { name, build } of bothControls) {
      for (const state of everyState) {
        expect(build(state).ariaLabel.toLowerCase(), name).toContain('tap to')
      }
    }
  })

  it('names the control in every accessible label', () => {
    for (const { build } of bothControls) {
      for (const state of everyState) {
        const view = build(state)
        expect(view.ariaLabel).toContain(view.label)
      }
    }
  })
})

describe('the two controls are independent', () => {
  it('changing one control does not change the other', () => {
    const tickHeld = countdownTickControl(OFF)
    for (const state of everyState) {
      endChimeControl(state)
      expect(countdownTickControl(OFF)).toEqual(tickHeld)
    }
    const chimeHeld = endChimeControl(OFF)
    for (const state of everyState) {
      countdownTickControl(state)
      expect(endChimeControl(OFF)).toEqual(chimeHeld)
    }
  })

  it('keeps the end chime OUT of the stored preferences entirely', () => {
    // The structural reason the two cannot cross-talk: ticking is a persisted
    // pref, the chime is per-session component state, and there is no shared key
    // for one toggle to overwrite.
    expect(Object.keys(DEFAULT_PREFS)).toContain('tick')
    expect(Object.keys(DEFAULT_PREFS)).not.toContain('chime')
    expect(Object.keys(DEFAULT_PREFS)).not.toContain('endChime')
  })

  it('toggling the tick preference preserves every other preference', () => {
    const before = parsePrefs({ ...DEFAULT_PREFS, sound: true, volume: 0.35, tone: 'low' })
    const after = parsePrefs({ ...before, tick: !before.tick })
    expect(after.tick).toBe(!before.tick)
    expect(after.sound).toBe(before.sound)
    expect(after.volume).toBe(before.volume)
    expect(after.tone).toBe(before.tone)
  })

  it('the master switch never erases a stored preference', () => {
    // Turning "Sounds & notices" off must silence, not forget. `tick` has to
    // survive so it is still on when sound comes back.
    const stored = parsePrefs({ ...DEFAULT_PREFS, tick: true, sound: true })
    const silenced = parsePrefs({ ...stored, sound: false })
    expect(silenced.tick).toBe(true)
    expect(countdownTickControl({ enabled: silenced.tick, masterSound: silenced.sound }).pressed)
      .toBe(true)
    const restored = parsePrefs({ ...silenced, sound: true })
    expect(restored.tick).toBe(true)
    expect(countdownTickControl({ enabled: restored.tick, masterSound: restored.sound }).audible)
      .toBe(true)
  })
})
