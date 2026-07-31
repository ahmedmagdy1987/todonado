/**
 * Pure breathing-pacer math. Like the Focus timer, the current phase and the
 * circle scale are derived from wall-clock elapsed time (NOT a tick counter or
 * CSS animation), so the pacer stays accurate when the tab is throttled and
 * snaps to the right point in the cycle after a refocus. No React, no I/O —
 * fully unit-tested.
 */

export type BreathPatternId = 'box' | 'calm' | 'simple'

/** A circle state: inhaling (expanding), holding full, exhaling (contracting), holding empty. */
export type PhaseType = 'inhale' | 'hold-full' | 'exhale' | 'hold-empty'

export interface BreathPhase {
  type: PhaseType
  seconds: number
}

export interface BreathPattern {
  id: BreathPatternId
  name: string
  /** Short cadence label, e.g. "4-7-8". */
  cadence: string
  description: string
  phases: BreathPhase[]
}

/** The selectable patterns. Box (4-4-4-4), Calm (4-7-8), Simple (4-4). */
export const BREATH_PATTERNS: BreathPattern[] = [
  {
    id: 'box',
    name: 'Box',
    cadence: '4-4-4-4',
    description: 'Equal inhale, hold, exhale, hold. Steady and grounding.',
    phases: [
      { type: 'inhale', seconds: 4 },
      { type: 'hold-full', seconds: 4 },
      { type: 'exhale', seconds: 4 },
      { type: 'hold-empty', seconds: 4 },
    ],
  },
  {
    id: 'calm',
    name: 'Calm',
    cadence: '4-7-8',
    description: 'A longer hold and exhale to help you settle.',
    phases: [
      { type: 'inhale', seconds: 4 },
      { type: 'hold-full', seconds: 7 },
      { type: 'exhale', seconds: 8 },
    ],
  },
  {
    id: 'simple',
    name: 'Simple',
    cadence: '4-4',
    description: 'Just inhale and exhale. An easy place to start.',
    phases: [
      { type: 'inhale', seconds: 4 },
      { type: 'exhale', seconds: 4 },
    ],
  },
]

/** Selectable session lengths, in minutes. */
export const BREATH_DURATIONS_MIN = [1, 3, 5] as const

export function getPattern(id: BreathPatternId): BreathPattern {
  return BREATH_PATTERNS.find((p) => p.id === id) ?? BREATH_PATTERNS[0]
}

/** Human label for the big phase cue. */
export function phaseLabel(type: PhaseType): string {
  switch (type) {
    case 'inhale':
      return 'Breathe in'
    case 'exhale':
      return 'Breathe out'
    default:
      return 'Hold'
  }
}

/** Total seconds for one full cycle of the pattern. */
export function cycleSeconds(pattern: BreathPattern): number {
  return pattern.phases.reduce((sum, p) => sum + p.seconds, 0)
}

export interface PhaseState {
  phase: BreathPhase
  phaseIndex: number
  /** 0..1 progress through the current phase. */
  phaseProgress: number
  /** Whole seconds left in the current phase (1..phase.seconds), for the countdown cue. */
  phaseSecondsLeft: number
  /** 0-based index of the cycle currently in progress. */
  round: number
}

/** Where in the breathing cycle are we at `elapsedMs`? Pure function of elapsed. */
export function phaseAt(elapsedMs: number, pattern: BreathPattern): PhaseState {
  const cycleMs = cycleSeconds(pattern) * 1000
  const clamped = Math.max(0, elapsedMs)
  const round = Math.floor(clamped / cycleMs)
  let within = clamped % cycleMs

  for (let i = 0; i < pattern.phases.length; i++) {
    const phase = pattern.phases[i]
    const phaseMs = phase.seconds * 1000
    if (within < phaseMs) {
      const phaseProgress = phaseMs > 0 ? within / phaseMs : 0
      const phaseSecondsLeft = Math.max(1, Math.ceil((phaseMs - within) / 1000))
      return { phase, phaseIndex: i, phaseProgress, phaseSecondsLeft, round }
    }
    within -= phaseMs
  }

  // Floating-point edge: land on the last phase's end.
  const last = pattern.phases[pattern.phases.length - 1]
  return { phase: last, phaseIndex: pattern.phases.length - 1, phaseProgress: 1, phaseSecondsLeft: 1, round }
}

/** Fully completed cycles at `elapsedMs`. */
export function roundsCompleted(elapsedMs: number, pattern: BreathPattern): number {
  const cycleMs = cycleSeconds(pattern) * 1000
  if (cycleMs <= 0) return 0
  return Math.floor(Math.max(0, elapsedMs) / cycleMs)
}

/**
 * Circle "fullness" at a phase state: 0 = fully contracted (empty lungs),
 * 1 = fully expanded (full lungs). The component maps this to a CSS scale.
 */
export function circleScale(state: PhaseState): number {
  const { phase, phaseProgress } = state
  switch (phase.type) {
    case 'inhale':
      return phaseProgress
    case 'hold-full':
      return 1
    case 'exhale':
      return 1 - phaseProgress
    case 'hold-empty':
      return 0
  }
}

// ---------------------------------------------------------------------------
//  Wall-clock session timing (mirrors the Focus timer; milliseconds here for
//  smooth animation). Elapsed is derived from timestamps, never accumulated.
// ---------------------------------------------------------------------------
export interface PacerTiming {
  startedAtMs: number
  accumulatedPausedMs: number
  /** Instant the current pause began; null while running. */
  pausedAtMs: number | null
}

/** Milliseconds actively breathing so far (excludes paused time). */
export function elapsedMs(t: PacerTiming, nowMs: number): number {
  const gross = nowMs - t.startedAtMs
  const currentPause = t.pausedAtMs !== null ? nowMs - t.pausedAtMs : 0
  return Math.max(0, gross - t.accumulatedPausedMs - currentPause)
}

export function pacerPause(t: PacerTiming, nowMs: number): PacerTiming {
  if (t.pausedAtMs !== null) return t
  return { ...t, pausedAtMs: nowMs }
}

export function pacerResume(t: PacerTiming, nowMs: number): PacerTiming {
  if (t.pausedAtMs === null) return t
  const pausedFor = Math.max(0, nowMs - t.pausedAtMs)
  return {
    startedAtMs: t.startedAtMs,
    accumulatedPausedMs: t.accumulatedPausedMs + pausedFor,
    pausedAtMs: null,
  }
}

export function isSessionComplete(durationMinutes: number, elapsed: number): boolean {
  return elapsed >= durationMinutes * 60 * 1000
}

/** Whole seconds left in the whole session (for the MM:SS readout). */
export function sessionSecondsLeft(durationMinutes: number, elapsed: number): number {
  return Math.max(0, Math.ceil((durationMinutes * 60 * 1000 - elapsed) / 1000))
}
