import { describe, expect, it } from 'vitest'
import { countdownTickControl, endChimeControl, type AudioControlView } from './audioControls'
import { DEFAULT_PREFS, parsePrefs } from '@/features/settings/prefs'

const ON = { enabled: true, masterSound: true }
const OFF = { enabled: false, masterSound: true }
const MUTED_ON = { enabled: true, masterSound: false }
const MUTED_OFF = { enabled: false, masterSound: false }

const everyState = [ON, OFF, MUTED_ON, MUTED_OFF]
const bothControls = [
  { name: 'end chime', build: endChimeControl },
  { name: 'countdown tick', build: countdownTickControl },
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

  it('never gives the two controls the same label', () => {
    for (const state of everyState) {
      const chime = endChimeControl(state)
      const tick = countdownTickControl(state)
      expect(chime.label).not.toBe(tick.label)
      expect(chime.ariaLabel).not.toBe(tick.ariaLabel)
      expect(chime.title).not.toBe(tick.title)
    }
  })

  it('says WHEN each sound happens, not merely that it is a sound', () => {
    // "at the end" vs "while it runs" is the distinction the icons could not
    // make on their own, so every string has to carry it.
    expect(endChimeControl(OFF).title.toLowerCase()).toContain('ends')
    expect(countdownTickControl(OFF).title.toLowerCase()).toContain('runs')
    expect(endChimeControl(OFF).ariaLabel.toLowerCase()).toContain('ends')
    expect(countdownTickControl(OFF).ariaLabel.toLowerCase()).toContain('runs')
  })

  /**
   * THE NAMING RULE. "Sound" and "Audio" are what made the speaker ambiguous —
   * they read as "all of it" — and they are exactly what a future edit reaches
   * for when the row feels crowded.
   */
  it('never falls back to a bare "Sound" or "Audio" label', () => {
    for (const { build } of bothControls) {
      for (const state of everyState) {
        const label = build(state).label
        expect(label.toLowerCase()).not.toBe('sound')
        expect(label.toLowerCase()).not.toBe('audio')
        expect(label.toLowerCase()).not.toBe('mute')
      }
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
    for (const { build } of bothControls) {
      for (const state of [ON, OFF]) {
        expect(build(state).ariaLabel.toLowerCase()).toContain('tap to')
      }
    }
  })
})

describe('aria-pressed reflects what is AUDIBLE', () => {
  it('is pressed only when its own switch and the master are both on', () => {
    for (const { name, build } of bothControls) {
      expect(build(ON).pressed, name).toBe(true)
      expect(build(OFF).pressed, name).toBe(false)
      // Stored on, but silenced in Settings: showing it as on would be the
      // button claiming an effect it does not have.
      expect(build(MUTED_ON).pressed, name).toBe(false)
      expect(build(MUTED_OFF).pressed, name).toBe(false)
    }
  })

  it('explains itself when the master switch is what silenced it', () => {
    for (const { build } of bothControls) {
      const title = build(MUTED_ON).title
      expect(title).toContain('Sounds & notices')
      expect(title).toContain('Settings')
    }
  })
})

describe('the two controls are independent', () => {
  it('changing one control does not change the other', () => {
    // Each reads only its own `enabled`. Feeding one every value while the
    // other holds still must leave the other's view byte-identical.
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
    // This is the structural reason the two cannot cross-talk: ticking is a
    // persisted pref, the chime is per-session component state. There is no
    // shared key for one toggle to overwrite.
    expect(Object.keys(DEFAULT_PREFS)).toContain('tick')
    expect(Object.keys(DEFAULT_PREFS)).not.toContain('chime')
    expect(Object.keys(DEFAULT_PREFS)).not.toContain('endChime')
  })

  it('toggling the tick preference preserves every other preference', () => {
    // `setPrefs` is a patch over the whole object; if that ever changed, the
    // tick toggle could silently reset the master switch, the volume or the
    // chosen chime tone.
    const before = parsePrefs({ ...DEFAULT_PREFS, sound: true, volume: 0.35, tone: 'low' })
    const after = parsePrefs({ ...before, tick: !before.tick })
    expect(after.tick).toBe(!before.tick)
    expect(after.sound).toBe(before.sound)
    expect(after.volume).toBe(before.volume)
    expect(after.tone).toBe(before.tone)
  })
})
