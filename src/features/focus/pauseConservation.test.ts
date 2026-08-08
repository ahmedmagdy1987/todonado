import { describe, expect, it } from 'vitest'
import {
  elapsedSeconds,
  focusStartAnchorMs,
  remainingSeconds,
  resume as resumeTiming,
  resumeAnchorMs,
} from './timer'

/**
 * REPEATED PAUSING MUST NOT ACCUMULATE TIMING ERROR.
 *
 * ── WHY THIS FILE EXISTS ───────────────────────────────────────────────────
 *
 * The pause/resume continuity fix was written, reviewed, and passed every other
 * test in this feature — and was still wrong. It stamped `paused_at` at the last
 * RENDER rather than at the click, which guarantees the frozen number matches
 * the screen but silently hands the gap between them to the pause. At a 1 Hz
 * render cadence that is ~0.5 SECONDS OF REAL FOCUS PER PAUSE, and it compounds:
 *
 *     40 pause/resume cycles   19.9s of focus lost
 *     200 cycles               97.9s lost
 *
 * A straight line through the origin. Every unit test passed, the countdown
 * looked perfect, and `actual_seconds` drifted underneath it — into Insights,
 * the weekly review, `estimationBias` and every task's focus total.
 *
 * The single-instant tests in `timer.test.ts` cannot catch that, because each
 * one conserves by construction: they define the pause as starting where they
 * measure it. Only driving MANY cycles at millisecond resolution and comparing
 * against independently-tracked true focus exposes it.
 *
 * ── WHAT THE FIX IS ────────────────────────────────────────────────────────
 *
 * Renders are aimed at the countdown's own second boundary (`useNow`'s
 * `phaseMs`), so between two renders the displayed second cannot change. The
 * value on screen is then stale in TIME but never in VALUE, which is what lets
 * Pause stamp the TRUE click instant — exact accounting — without the clock
 * appearing to move.
 */

const PLANNED_MINUTES = 60
/** Timers fire late, never early. This models that, because it is what leaves
 *  the one irreducible sliver in which a click can outrun its own render. */
const TIMER_LATENESS_MS = 3

interface Run {
  samples: { at: number; elapsed: number; remaining: number }[]
  atPause: { before: number; after: number; reload: number }[]
  atResume: { frozen: number; onResume: number; oneSecondLater: number }[]
  accSeries: number[]
  finalElapsed: number
  trueFocusMs: number
  /** Constant head-start adopted from the server's `started_at`. Not drift. */
  initialSkewMs: number
}

/** Drive a whole session at millisecond resolution, mirroring `RunningView`. */
function simulate(cycles: { workMs: number; pauseMs: number }[], skewMs: number): Run {
  const clientStart = 1_700_000_000_000
  let anchor = focusStartAnchorMs(clientStart + skewMs, clientStart)
  let acc = 0
  let pausedAt: number | null = null

  const samples: Run['samples'] = []
  const atPause: Run['atPause'] = []
  const atResume: Run['atResume'] = []
  const accSeries = [acc]

  const timing = (at: number | null = pausedAt) => ({
    startedAtMs: anchor,
    accumulatedPausedSeconds: acc,
    pausedAtMs: at,
  })
  /** `useNow(active, phaseMs)`: the next instant the displayed second changes. */
  const nextRenderAfter = (t: number) => {
    const since = (((t - (anchor + acc * 1000)) % 1000) + 1000) % 1000
    return t + (1000 - since) + TIMER_LATENESS_MS
  }
  const record = (at: number) => {
    const e = elapsedSeconds(timing(), at)
    samples.push({ at, elapsed: e, remaining: remainingSeconds(PLANNED_MINUTES, e) })
    return e
  }

  let clock = clientStart
  let nextRender = clock
  let lastRender = clock
  let trueFocusMs = 0

  for (const cycle of cycles) {
    const clickAt = clock + cycle.workMs
    while (nextRender <= clickAt) {
      lastRender = nextRender
      record(nextRender)
      nextRender = nextRenderAfter(nextRender)
    }

    // ---- PAUSE. The user focused right up to the click.
    trueFocusMs += clickAt - clock
    const before = elapsedSeconds(timing(null), lastRender)
    pausedAt = clickAt
    const after = elapsedSeconds(timing(), lastRender)
    // A reload mid-pause must agree with the frozen screen.
    const reload = elapsedSeconds(timing(), clickAt + Math.min(500, cycle.pauseMs))
    atPause.push({ before, after, reload })
    for (const probe of [0, 1, 137, cycle.pauseMs]) {
      record(clickAt + Math.min(probe, cycle.pauseMs))
    }

    // ---- RESUME.
    const resumeAt = clickAt + cycle.pauseMs
    acc = resumeTiming(timing(), resumeAt).accumulatedPausedSeconds
    anchor = resumeAnchorMs(anchor, pausedAt, resumeAt)
    pausedAt = null
    accSeries.push(acc)
    atResume.push({
      frozen: after,
      onResume: record(resumeAt),
      oneSecondLater: elapsedSeconds(timing(null), resumeAt + 1000),
    })
    nextRender = nextRenderAfter(resumeAt)
    clock = resumeAt
  }

  const endAt = clock + 5_000
  while (nextRender <= endAt) {
    lastRender = nextRender
    record(nextRender)
    nextRender = nextRenderAfter(nextRender)
  }
  trueFocusMs += endAt - clock

  return {
    samples,
    atPause,
    atResume,
    accSeries,
    finalElapsed: elapsedSeconds(timing(null), endAt),
    trueFocusMs,
    initialSkewMs: clientStart - focusStartAnchorMs(clientStart + skewMs, clientStart),
  }
}

/** Awkward, non-repeating sub-second offsets — never aligned to the boundary. */
const cyclesOf = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    workMs: 3_017 + ((i * 37) % 1000) + (i % 7) * 113,
    pauseMs: 1_000 + ((i * 149) % 1000) + (i % 5) * 271,
  }))

/** Pause-driven error: total, minus the constant skew head-start. */
const pauseDrivenError = (run: Run) =>
  run.trueFocusMs / 1000 - run.finalElapsed + run.initialSkewMs / 1000

const SKEWS: [string, number][] = [
  ['no skew', 0],
  ['server 4s ahead of the browser', 4_000],
  ['browser 4s ahead of the server', -4_000],
  ['server 90s ahead (pathological)', 90_000],
]

describe.each(SKEWS)('40 pause/resume cycles — %s', (_label, skewMs) => {
  const run = simulate(cyclesOf(40), skewMs)

  it('the displayed countdown is continuous — never backwards, never a leap', () => {
    let previous = run.samples[0]
    for (const s of run.samples.slice(1)) {
      expect(s.elapsed, `at ${s.at}`).toBeGreaterThanOrEqual(previous.elapsed)
      expect(s.remaining, `at ${s.at}`).toBeLessThanOrEqual(previous.remaining)
      expect(s.elapsed - previous.elapsed, `at ${s.at}`).toBeLessThanOrEqual(
        Math.ceil((s.at - previous.at) / 1000) + 1,
      )
      previous = s
    }
  })

  it('no visible second is LOST on Pause — the reported bug, 40 times over', () => {
    for (const [i, p] of run.atPause.entries()) {
      expect(p.after, `pause #${i + 1}`).toBeGreaterThanOrEqual(p.before)
    }
  })

  it('a mid-pause reload agrees with the frozen screen', () => {
    for (const [i, p] of run.atPause.entries()) {
      expect(p.reload, `pause #${i + 1}`).toBe(p.after)
    }
  })

  it('freezes on the displayed second, catching up at most one and only rarely', () => {
    // A render aimed at the boundary still fires a few ms late, so a click can
    // land in that sliver and see a second the render has not reported yet.
    // Showing truth there costs nothing — `actual_seconds` stays exact — and it
    // can only ever reveal a second that genuinely elapsed, never remove one.
    const caught = run.atPause.filter((p) => p.after !== p.before)
    for (const p of caught) expect(p.after - p.before).toBe(1)
    expect(caught.length / run.atPause.length).toBeLessThanOrEqual(0.05)
  })

  it('adds no seconds on Resume, and decrements exactly once a second later', () => {
    for (const [i, r] of run.atResume.entries()) {
      expect(r.onResume, `resume #${i + 1}`).toBe(r.frozen)
      expect(r.oneSecondLater, `resume #${i + 1} +1s`).toBe(r.frozen + 1)
    }
  })

  it('keeps accumulated_paused_seconds monotonic, integral and never inflated', () => {
    let previous = -1
    for (const acc of run.accSeries) {
      expect(Number.isInteger(acc)).toBe(true)
      expect(acc).toBeGreaterThan(previous)
      previous = acc
    }
    const truePausedMs = cyclesOf(40).reduce((sum, c) => sum + c.pauseMs, 0)
    expect(run.accSeries[run.accSeries.length - 1] * 1000).toBeLessThanOrEqual(truePausedMs)
  })

  it('keeps actual_seconds within a second of true focus, whatever the skew', () => {
    expect(Math.abs(pauseDrivenError(run))).toBeLessThan(2)
  })
})

describe('the error is FLAT in the number of pauses, not linear', () => {
  it('40, 200 and 400 pauses all land within a second of each other', () => {
    // This is the whole proof, and the assertion that would have blocked the
    // first attempt: it produced 19.9s / 97.9s / ~196s here.
    const errors = [40, 200, 400].map((n) => pauseDrivenError(simulate(cyclesOf(n), 0)))
    for (const e of errors) expect(Math.abs(e)).toBeLessThan(2)
    expect(Math.abs(errors[2] - errors[0])).toBeLessThan(1)
  })

  it('is identical across every clock-skew condition — skew is not pause drift', () => {
    // `focusStartAnchorMs` gives a browser-ahead session a CONSTANT head-start
    // from t=0. That is the shipped skew protection, not drift, so the
    // pause-driven component must be the same number in all four worlds.
    const errors = SKEWS.map(([, skew]) => pauseDrivenError(simulate(cyclesOf(40), skew)))
    for (const e of errors) expect(e).toBeCloseTo(errors[0], 6)
  })
})
