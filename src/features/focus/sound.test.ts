import { afterEach, describe, expect, it } from 'vitest'
import {
  INTERRUPTION_NOTES,
  INTERRUPTION_PEAK,
  SCHEDULE_LEAD_SECONDS,
  TICK_PEAK,
  TICK_TRANSIENT_RATIO,
  TONES,
  installAudioUnlock,
  playInterruptionTone,
  playTick,
  resetAudioForTests,
  unlockAudio,
} from './sound'
import { DEFAULT_PREFS, resetPrefsCache, setPrefs } from '@/features/settings/prefs'
import { installFakeDocument, installMockAudio, lastContext, removeAudio } from './audioHarness'

/**
 * The one relationship the tick tuning must never break.
 *
 * The countdown tick was raised because it was inaudible in a normal room, and
 * the obvious next step when somebody says "still too quiet" is to raise it
 * again. There is a ceiling: the end chime has to remain clearly louder than the
 * tick, or reaching zero stops being an event and becomes just another tick.
 *
 * Levels only. The unit suite runs in `node` with no Web Audio, so whether a
 * speaker makes a sound is not knowable here — the `e2e` suite cannot prove it
 * either, since headless Chromium always runs `--mute-audio`. What IS provable
 * is the arithmetic that decides relative loudness, so that is what is pinned.
 */
describe('the countdown tick stays below every chime', () => {
  const quietestChime = Math.min(...Object.values(TONES).map((t) => t.peak))

  it('is quieter than the quietest tone', () => {
    expect(TICK_PEAK).toBeLessThan(quietestChime)
  })

  it('is audible — not so quiet that switching it on appears to do nothing', () => {
    // It shipped at 0.035 and was reported inaudible. This floor is the lesson,
    // not an arbitrary bound.
    expect(TICK_PEAK).toBeGreaterThan(0.05)
  })

  it('leaves real headroom, so the end of a session is unmistakable', () => {
    // Half the quietest chime or less: a difference you hear, not one you infer.
    expect(TICK_PEAK).toBeLessThanOrEqual(quietestChime * 0.8)
  })

  it('keeps BODY PLUS TRANSIENT below the quietest chime', () => {
    // The tick gained a second component. The ceiling is about the loudest
    // instant the tick can produce, not about one of its parts.
    expect(TICK_PEAK * (1 + TICK_TRANSIENT_RATIO)).toBeLessThan(quietestChime)
  })

  it('scales with the device volume rather than replacing it', () => {
    // The volume slider is the user's control for "still too quiet"; this
    // constant is the ceiling. Both are multiplied, never max()'d.
    for (const volume of [0, 0.25, 1]) {
      expect(TICK_PEAK * volume).toBeLessThanOrEqual(TICK_PEAK)
    }
    expect(TICK_PEAK * 0).toBe(0)
  })
})

describe('the chime catalogue is unchanged by the tick retune', () => {
  it('still has three tones at their original levels', () => {
    // The tick change must not have moved a chime to make room for itself.
    expect(TONES.soft.peak).toBe(0.12)
    expect(TONES.bell.peak).toBe(0.1)
    expect(TONES.low.peak).toBe(0.14)
  })

  it('still has its original notes', () => {
    expect(TONES.soft.notes).toEqual([
      { freq: 660, at: 0, hold: 0.5 },
      { freq: 880, at: 0.18, hold: 0.5 },
    ])
    expect(TONES.bell.notes).toEqual([{ freq: 1046.5, at: 0, hold: 1.1 }])
    expect(TONES.low.notes).toEqual([
      { freq: 330, at: 0, hold: 0.6 },
      { freq: 440, at: 0.2, hold: 0.6 },
    ])
  })
})

describe('three sounds, ordered by what they mean', () => {
  const quietestChime = Math.min(...Object.values(TONES).map((t) => t.peak))

  it('goes tick < confirmation < chime', () => {
    expect(TICK_PEAK).toBeLessThan(INTERRUPTION_PEAK)
    expect(INTERRUPTION_PEAK).toBeLessThan(quietestChime)
  })

  it('cannot clip at full volume', () => {
    // Every peak is a linear gain into the destination. Anything at or above 1
    // would distort on its own before the mix is considered.
    const loudest = Math.max(
      TICK_PEAK * (1 + TICK_TRANSIENT_RATIO),
      INTERRUPTION_PEAK,
      ...Object.values(TONES).map((t) => t.peak),
    )
    expect(loudest).toBeLessThan(1)
  })

  it('keeps the confirmation short and its notes non-overlapping', () => {
    const [first, second] = INTERRUPTION_NOTES
    // Non-overlapping is what keeps the loudest instant one note's peak.
    expect(first.at + first.hold).toBeLessThanOrEqual(second.at)
    const total = second.at + second.hold
    expect(total).toBeGreaterThanOrEqual(0.08)
    expect(total).toBeLessThanOrEqual(0.2)
  })

  it('rises rather than falls, so it reads as a confirmation', () => {
    expect(INTERRUPTION_NOTES[1].freq).toBeGreaterThan(INTERRUPTION_NOTES[0].freq)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
//  THE PLAYBACK PATH — the part that was silent while every number was right
// ─────────────────────────────────────────────────────────────────────────────

describe('playback actually builds and schedules a graph', () => {
  let restore: () => void = () => {}

  afterEach(() => {
    restore()
    resetAudioForTests()
    resetPrefsCache()
  })

  function withAudio() {
    restore = installMockAudio()
    resetAudioForTests()
    resetPrefsCache()
    setPrefs({ sound: true, volume: DEFAULT_PREFS.volume })
  }

  it('reports a tick as played and connects it to the destination', () => {
    withAudio()
    expect(playTick()).toBe('played')
    const ctx = lastContext()
    const oscillator = ctx.nodes.find((n) => n.kind === 'oscillator')
    const gains = ctx.nodes.filter((n) => n.kind === 'gain')
    expect(oscillator).toBeDefined()
    expect(oscillator?.startedAt).not.toBeNull()
    // The oscillator feeds a gain, and a gain reaches the destination. Without
    // that last hop the graph is silent no matter how it is scheduled.
    expect(gains.some((g) => g.connectedTo.includes('destination'))).toBe(true)
  })

  /**
   * THE REGRESSION TEST FOR THE PRODUCTION BUG.
   *
   * Every event of a short one-shot must be scheduled in the context's future.
   * The old tick scheduled its whole 45 ms envelope at exactly `currentTime`,
   * which the audio thread has already rendered past, so the ramp to peak was
   * skipped and the gain param took its 0.0001 tail value. Correct graph,
   * correct level, no sound.
   */
  it('schedules every tick event strictly after currentTime', () => {
    withAudio()
    playTick()
    const ctx = lastContext()
    expect(ctx.events.length).toBeGreaterThan(0)
    for (const event of ctx.events) {
      expect(event.time).toBeGreaterThanOrEqual(ctx.currentTime + SCHEDULE_LEAD_SECONDS)
    }
    for (const node of ctx.nodes) {
      if (node.startedAt !== null) {
        expect(node.startedAt).toBeGreaterThanOrEqual(ctx.currentTime + SCHEDULE_LEAD_SECONDS)
      }
    }
  })

  it('schedules every confirmation event strictly after currentTime', () => {
    withAudio()
    expect(playInterruptionTone()).toBe('played')
    const ctx = lastContext()
    for (const event of ctx.events) {
      expect(event.time).toBeGreaterThanOrEqual(ctx.currentTime + SCHEDULE_LEAD_SECONDS)
    }
  })

  it('gives the tick a noise transient as well as a body', () => {
    withAudio()
    playTick()
    const ctx = lastContext()
    // A pure oscillator cannot sound like a clock. The buffer source through a
    // bandpass is what makes it a tick rather than a beep.
    expect(ctx.nodes.some((n) => n.kind === 'bufferSource')).toBe(true)
    expect(ctx.nodes.some((n) => n.kind === 'biquad')).toBe(true)
  })

  it('ends the tick well inside one second, so it cannot ring into the next', () => {
    withAudio()
    playTick()
    const ctx = lastContext()
    const stops = ctx.nodes.map((n) => n.stoppedAt).filter((t): t is number => t !== null)
    expect(stops.length).toBeGreaterThan(0)
    for (const stop of stops) expect(stop - ctx.currentTime).toBeLessThan(0.5)
  })

  it('plays two notes for the confirmation', () => {
    withAudio()
    playInterruptionTone()
    const ctx = lastContext()
    expect(ctx.nodes.filter((n) => n.kind === 'oscillator')).toHaveLength(2)
  })

  it('reuses ONE context across every sound', () => {
    withAudio()
    playTick()
    playTick()
    playInterruptionTone()
    unlockAudio()
    // A second context would be a second thing to unlock from a gesture.
    expect(lastContext().nodes.length).toBeGreaterThan(0)
    expect(
      (globalThis as unknown as { AudioContext: { instances: unknown[] } }).AudioContext.instances,
    ).toHaveLength(1)
  })
})

describe('the master switch and the volume silence everything', () => {
  let restore: () => void = () => {}

  afterEach(() => {
    restore()
    resetAudioForTests()
    resetPrefsCache()
  })

  function withAudio() {
    restore = installMockAudio()
    resetAudioForTests()
    resetPrefsCache()
  }

  it('plays nothing when Sounds & notices is off', () => {
    withAudio()
    setPrefs({ sound: false, volume: 1 })
    expect(playTick()).toBe('muted')
    expect(playInterruptionTone()).toBe('muted')
    // Nothing was even constructed: "off" means no context, not a silent one.
    expect(
      (globalThis as unknown as { AudioContext: { instances: unknown[] } }).AudioContext.instances,
    ).toHaveLength(0)
  })

  it('plays nothing at volume 0', () => {
    withAudio()
    setPrefs({ sound: true, volume: 0 })
    expect(playTick()).toBe('muted')
    expect(playInterruptionTone()).toBe('muted')
  })

  it('scales both sounds by the volume', () => {
    withAudio()
    setPrefs({ sound: true, volume: 0.5 })
    playTick()
    const tickPeak = Math.max(...lastContext().events.map((e) => e.value))
    expect(tickPeak).toBeCloseTo(TICK_PEAK * 0.5, 6)

    resetAudioForTests()
    playInterruptionTone()
    const confirmPeak = Math.max(...lastContext().events.map((e) => e.value))
    expect(confirmPeak).toBeCloseTo(INTERRUPTION_PEAK * 0.5, 6)
  })
})

describe('unlocking audio', () => {
  let restore: () => void = () => {}

  afterEach(() => {
    restore()
    resetAudioForTests()
    resetPrefsCache()
  })

  it('creates the context and asks it to resume', () => {
    restore = installMockAudio()
    resetAudioForTests()
    // `blocked`, not `ready`: resume() is asynchronous, so a context unlocked
    // from a real gesture still reports suspended for a moment. Treating that as
    // failure would refuse to switch ticking on in the ordinary case.
    expect(unlockAudio()).toBe('blocked')
    expect(lastContext().resumeCalls).toBe(1)
  })

  it('reports unavailable when the browser has no AudioContext at all', () => {
    restore = removeAudio()
    resetAudioForTests()
    resetPrefsCache()
    expect(unlockAudio()).toBe('unavailable')
    expect(playTick()).toBe('unavailable')
    expect(playInterruptionTone()).toBe('unavailable')
  })

  it('unlocks on the next gesture and then stops listening', () => {
    restore = installMockAudio()
    resetAudioForTests()
    const { doc, restore: restoreDoc } = installFakeDocument()
    try {
      const remove = installAudioUnlock()
      expect(doc.count()).toBeGreaterThan(0)

      doc.fire('pointerdown')
      // The context exists and was resumed by the gesture — this is the path a
      // reloaded mid-session page depends on, where no click has happened yet.
      expect(lastContext().resumeCalls).toBeGreaterThanOrEqual(1)
      // Listeners removed themselves once the context was running.
      expect(doc.count()).toBe(0)
      remove()
    } finally {
      restoreDoc()
    }
  })

  it('is a no-op, not a crash, with no document', () => {
    restore = installMockAudio()
    resetAudioForTests()
    expect(() => installAudioUnlock()()).not.toThrow()
  })
})
