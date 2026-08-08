import { describe, it, expect } from 'vitest'
import {
  focusStartAnchorMs,
  elapsedSeconds,
  remainingSeconds,
  isComplete,
  pause,
  resume,
  resumeAnchorMs,
  endStatusFor,
  formatClock,
  type FocusTiming,
} from './timer'

const S = 1000 // ms per second
const running = (over: Partial<FocusTiming> = {}): FocusTiming => ({
  startedAtMs: 0,
  accumulatedPausedSeconds: 0,
  pausedAtMs: null,
  ...over,
})

describe('elapsedSeconds', () => {
  it('counts wall-clock seconds while running', () => {
    expect(elapsedSeconds(running(), 90 * S)).toBe(90)
  })

  it('is drift-resistant — depends only on now, not on tick count', () => {
    const t = running({ startedAtMs: 1_000_000 })
    expect(elapsedSeconds(t, 1_000_000 + 300 * S)).toBe(300)
  })

  it('excludes accumulated paused time', () => {
    expect(elapsedSeconds(running({ accumulatedPausedSeconds: 30 }), 100 * S)).toBe(70)
  })

  it('freezes while currently paused', () => {
    const t = running({ pausedAtMs: 60 * S })
    expect(elapsedSeconds(t, 60 * S)).toBe(60)
    expect(elapsedSeconds(t, 120 * S)).toBe(60) // still 60 a minute later
  })

  it('never goes negative', () => {
    expect(elapsedSeconds(running({ startedAtMs: 100 * S }), 0)).toBe(0)
  })
})

describe('pause / resume', () => {
  it('pause sets pausedAt; resume folds the pause into accumulated time', () => {
    let t = running()
    t = pause(t, 60 * S)
    expect(t.pausedAtMs).toBe(60 * S)
    t = resume(t, 90 * S) // paused for 30s
    expect(t.pausedAtMs).toBeNull()
    expect(t.accumulatedPausedSeconds).toBe(30)
    expect(elapsedSeconds(t, 120 * S)).toBe(90) // gross 120 - 30 paused
  })

  it('pause is idempotent and resume on a running timer is a no-op', () => {
    const t = running()
    expect(resume(t, 10 * S)).toEqual(t)
    const paused = pause(t, 10 * S)
    expect(pause(paused, 20 * S)).toEqual(paused)
  })
})

describe('remainingSeconds / isComplete', () => {
  it('computes remaining time and completion', () => {
    expect(remainingSeconds(50, 600)).toBe(50 * 60 - 600)
    expect(remainingSeconds(25, 25 * 60 + 10)).toBe(0)
    expect(isComplete(50, 50 * 60)).toBe(true)
    expect(isComplete(50, 50 * 60 - 1)).toBe(false)
  })
})

describe('endStatusFor', () => {
  it('abandons trivially short sessions, completes meaningful ones', () => {
    expect(endStatusFor(59)).toBe('abandoned')
    expect(endStatusFor(60)).toBe('completed')
    expect(endStatusFor(3000)).toBe('completed')
  })
})

describe('formatClock', () => {
  it('formats MM:SS with padding', () => {
    expect(formatClock(0)).toBe('00:00')
    expect(formatClock(65)).toBe('01:05')
    expect(formatClock(90 * 60)).toBe('90:00')
  })
})

describe('focusStartAnchorMs — the countdown must not start in the future', () => {
  /*
   * THE BUG THIS PINS. `started_at` comes from PostgreSQL `now()`; the countdown
   * runs on the browser clock. When the browser is behind the database, the
   * server instant is in the client's future, `elapsedSeconds` clamps to 0, and
   * the timer visibly sits at the full duration until the clock catches up.
   */
  it('counts from the client instant when the server timestamp is in the future', () => {
    const clientNow = 1_000_000
    const serverStarted = clientNow + 3_000 // browser 3s behind the database
    expect(focusStartAnchorMs(serverStarted, clientNow)).toBe(clientNow)
  })

  it('the timer moves on the very first tick instead of sitting still', () => {
    const clientNow = 1_000_000
    const serverStarted = clientNow + 3_000
    const anchor = focusStartAnchorMs(serverStarted, clientNow)
    const timing = { startedAtMs: anchor, accumulatedPausedSeconds: 0, pausedAtMs: null }

    // One second later the display must have advanced. Against the RAW server
    // value it would still read 0 — that is exactly the reported symptom.
    expect(elapsedSeconds(timing, clientNow + 1_000)).toBe(1)
    expect(
      elapsedSeconds(
        { startedAtMs: serverStarted, accumulatedPausedSeconds: 0, pausedAtMs: null },
        clientNow + 1_000,
      ),
    ).toBe(0)
  })

  it('KEEPS the server timestamp once it is in the past, so reload recovery is unchanged', () => {
    const clientNow = 1_000_000
    const serverStarted = clientNow - 25 * 60 * 1000 // reopened 25 minutes later
    expect(focusStartAnchorMs(serverStarted, clientNow)).toBe(serverStarted)

    const timing = { startedAtMs: focusStartAnchorMs(serverStarted, clientNow), accumulatedPausedSeconds: 0, pausedAtMs: null }
    expect(elapsedSeconds(timing, clientNow)).toBe(25 * 60)
  })

  it('never invents progress — elapsed at the anchor instant is always 0', () => {
    for (const skewMs of [-5_000, -1, 0, 1, 5_000]) {
      const clientNow = 1_000_000
      const anchor = focusStartAnchorMs(clientNow + skewMs, clientNow)
      const timing = { startedAtMs: anchor, accumulatedPausedSeconds: 0, pausedAtMs: null }
      expect(elapsedSeconds(timing, clientNow)).toBe(skewMs < 0 ? Math.floor(-skewMs / 1000) : 0)
    }
  })

  it('falls back to the client clock on an unparseable timestamp', () => {
    // Date.parse of a malformed value is NaN; Math.min(NaN, x) is NaN, which
    // would render "NaN:NaN" forever.
    expect(focusStartAnchorMs(Number.NaN, 1_000_000)).toBe(1_000_000)
  })
})

/**
 * PAUSE / RESUME CONTINUITY — the two bugs that made the countdown lie.
 *
 * Both were reported from the running app: pausing at 24:45 immediately showed
 * 24:44, and resuming jumped UP two or three seconds before settling one second
 * BELOW where it had been. Neither was a clock problem; both were rounding.
 *
 * The invariant these pin, in one sentence: **the number on screen may only ever
 * change because a real second of unpaused time has passed.**
 */
describe('pausing freezes the clock on exactly the second that was displayed', () => {
  /** A session started 45.4s ago, on the second-boundary side that used to break. */
  const startedAtMs = 1_000_000
  const running = { startedAtMs, accumulatedPausedSeconds: 0, pausedAtMs: null }

  it('does not lose a second when `paused_at` lands after the last render tick', () => {
    // THE EXACT REPORTED BUG. `useNow` last fired at T; the old code stamped
    // `paused_at` at T+300ms. `now - pausedAt` was -300, and Math.floor(-0.3) is
    // -1 — subtracting which ADDED a second, so the display dropped one.
    // A row written by a build with that behaviour must still read correctly.
    const lastTick = startedAtMs + 45_400
    expect(elapsedSeconds(running, lastTick)).toBe(45)
    expect(elapsedSeconds({ ...running, pausedAtMs: lastTick + 300 }, lastTick)).toBe(45)
    expect(elapsedSeconds({ ...running, pausedAtMs: lastTick + 900 }, lastTick)).toBe(46)
  })

  it('is stamped at the rendered instant, so the frozen value is the displayed one', () => {
    // `RunningView` writes `paused_at` as the `now` that produced the number on
    // screen, never `Date.now()` at the click. That equality is the whole reason
    // the display cannot move: pausing evaluates at the same instant it was
    // already showing.
    for (const renderedAt of [45_001, 45_400, 45_999, 46_000]) {
      const instant = startedAtMs + renderedAt
      const displayed = elapsedSeconds(running, instant)
      expect(elapsedSeconds({ ...running, pausedAtMs: instant }, instant)).toBe(displayed)
    }
  })

  it('reads the same during the pause as it did at the pause instant', () => {
    // A reload mid-pause, or any later render, must not disagree with the screen.
    const pausedAtMs = startedAtMs + 45_400
    const frozen = elapsedSeconds(running, pausedAtMs)
    const paused = { ...running, pausedAtMs }
    for (const later of [0, 1, 600, 10_000, 3_600_000]) {
      expect(elapsedSeconds(paused, pausedAtMs + later)).toBe(frozen)
    }
  })

  it('still counts a REAL pause — the clamp must not freeze a reload', () => {
    // Reloading while paused: `now` is genuinely later than `paused_at`, and the
    // pause has to be subtracted or the session would resume having "lost" it.
    const pausedAtMs = startedAtMs + 45_400
    const paused = { ...running, pausedAtMs }
    expect(elapsedSeconds(paused, pausedAtMs + 10_000)).toBe(45)
    expect(elapsedSeconds(paused, pausedAtMs + 600_000)).toBe(45)
  })

  it('a paused session never advances, however long the page stays open', () => {
    const paused = { ...running, pausedAtMs: startedAtMs + 45_400 }
    const seen = new Set(
      [0, 1_000, 60_000, 3_600_000].map((d) => elapsedSeconds(paused, startedAtMs + 45_400 + d)),
    )
    expect([...seen]).toEqual([45])
  })

  it('still counts a pause that began before this render — reload recovery', () => {
    // The clamp must not be mistaken for "ignore the pause". A session paused an
    // hour ago and reloaded now has to come back at the value it was paused on,
    // which is what makes the pause real rather than free time.
    const paused = { ...running, pausedAtMs: startedAtMs + 45_400 }
    expect(elapsedSeconds(paused, startedAtMs + 45_400 + 3_600_000)).toBe(45)
  })
})

describe('resuming continues from exactly where it froze', () => {
  const at = (startedAtMs: number, accumulatedPausedSeconds: number, pausedAtMs: number | null) => ({
    startedAtMs,
    accumulatedPausedSeconds,
    pausedAtMs,
  })

  it('the first frame after Resume equals the last frame before it', () => {
    // THE SECOND REPORTED BUG at its root: recomputing from the original start
    // against a freshly grown accumulated total rounds twice, and the answer can
    // land either side. Shifting the anchor by the pause remainder removes the
    // arithmetic entirely.
    const started = 1_000_000
    for (const acc of [0, 1, 7, 300]) {
      for (const pauseMs of [400, 1_000, 1_600, 9_999, 60_000]) {
        const pausedAt = started + 45_400 + acc * 1000
        const frozen = elapsedSeconds(at(started, acc, pausedAt), pausedAt)
        const resumeAt = pausedAt + pauseMs
        const resumed = resume(at(started, acc, pausedAt), resumeAt)
        const anchor = resumeAnchorMs(started, pausedAt, resumeAt)
        expect(
          elapsedSeconds(at(anchor, resumed.accumulatedPausedSeconds, null), resumeAt),
          `acc=${acc} pause=${pauseMs}`,
        ).toBe(frozen)
      }
    }
  })

  it('holds that value for the whole first second, then advances by exactly one', () => {
    // The old code jumped UP here, because `useNow` had not re-synced yet.
    const started = 1_000_000
    const pausedAt = started + 45_400
    const resumeAt = pausedAt + 1_700
    const frozen = elapsedSeconds(at(started, 0, pausedAt), pausedAt)
    const resumed = resume(at(started, 0, pausedAt), resumeAt)
    const anchor = resumeAnchorMs(started, pausedAt, resumeAt)
    const t = at(anchor, resumed.accumulatedPausedSeconds, null)
    for (const ms of [0, 1, 250, 599]) expect(elapsedSeconds(t, resumeAt + ms)).toBe(frozen)
    expect(elapsedSeconds(t, resumeAt + 600)).toBe(frozen + 1)
    expect(elapsedSeconds(t, resumeAt + 1_599)).toBe(frozen + 1)
    expect(elapsedSeconds(t, resumeAt + 1_600)).toBe(frozen + 2)
  })

  it('conserves focused time across forty pause/resume cycles', () => {
    // THE REGRESSION THAT KILLED THE OBVIOUS FIX. Re-anchoring onto the whole
    // second on screen is exact once and lossy repeatedly: 40 cycles of 3.4s
    // reported 120s instead of 136s, because each resume discarded 0.4s of real
    // work. Shifting by the pause remainder conserves every millisecond.
    let anchor = 5_000_000
    let acc = 0
    let now = anchor
    let previous = 0
    for (let cycle = 0; cycle < 40; cycle++) {
      now += 3_400
      const pausedAt = now + 120
      const frozen = elapsedSeconds(at(anchor, acc, pausedAt), pausedAt)
      expect(frozen).toBeGreaterThanOrEqual(previous)
      previous = frozen
      const resumeAt = pausedAt + 1_700
      acc = resume(at(anchor, acc, pausedAt), resumeAt).accumulatedPausedSeconds
      anchor = resumeAnchorMs(anchor, pausedAt, resumeAt)
      expect(elapsedSeconds(at(anchor, acc, null), resumeAt)).toBe(frozen)
      now = resumeAt
    }
    // 40 x 3.52s of genuinely unpaused time, to the second. No drift either way.
    expect(elapsedSeconds(at(anchor, acc, null), now)).toBe(Math.floor((40 * 3_520) / 1000))
  })

  it('a pause of a whole number of seconds moves the anchor not at all', () => {
    expect(resumeAnchorMs(1_000, 5_000, 5_000)).toBe(1_000)
    expect(resumeAnchorMs(1_000, 5_000, 8_000)).toBe(1_000)
  })

  it('is independent of client/server clock skew — it uses only client instants', () => {
    // It never touches a server timestamp: once a session is on screen the
    // display is anchored to this device.
    const day = 86_400_000
    expect(resumeAnchorMs(1_000, 5_000, 6_400)).toBe(resumeAnchorMs(1_000, 5_000 + day, 6_400 + day))
  })

  it('refuses to run backwards if the clock jumps behind the pause', () => {
    expect(resumeAnchorMs(1_000, 5_000, 4_000)).toBe(1_000)
  })
})

describe('the second boundary is crossed once, not twice', () => {
  it('floors ONE subtraction, so a pause cannot buy or cost a second', () => {
    // Flooring the gross span and the pause span separately let two rounding
    // errors compound. These are the boundary values that used to disagree.
    const startedAtMs = 0
    for (const ms of [44_001, 44_500, 44_999, 45_000, 45_001]) {
      const expected = Math.floor(ms / 1000)
      expect(elapsedSeconds({ startedAtMs, accumulatedPausedSeconds: 0, pausedAtMs: null }, ms)).toBe(
        expected,
      )
      // The same instant with a whole second of recorded pause: exactly one less.
      expect(elapsedSeconds({ startedAtMs, accumulatedPausedSeconds: 1, pausedAtMs: null }, ms)).toBe(
        expected - 1,
      )
    }
  })

  it('sub-second accumulated pauses never round the display backwards', () => {
    // Walking forward in 100ms steps, elapsed may only ever stay put or rise.
    const timing = { startedAtMs: 0, accumulatedPausedSeconds: 4, pausedAtMs: null }
    let previous = elapsedSeconds(timing, 4_000)
    for (let ms = 4_000; ms <= 60_000; ms += 100) {
      const value = elapsedSeconds(timing, ms)
      expect(value).toBeGreaterThanOrEqual(previous)
      expect(value - previous).toBeLessThanOrEqual(1)
      previous = value
    }
  })

  it('clamps at zero rather than showing a negative clock', () => {
    expect(elapsedSeconds({ startedAtMs: 1_000, accumulatedPausedSeconds: 0, pausedAtMs: null }, 0)).toBe(0)
    expect(elapsedSeconds({ startedAtMs: 0, accumulatedPausedSeconds: 99, pausedAtMs: null }, 1_000)).toBe(0)
  })
})
