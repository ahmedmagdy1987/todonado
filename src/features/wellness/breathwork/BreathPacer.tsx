import { useEffect, useRef, useState } from 'react'
import { Pause, Play, Square } from 'lucide-react'
import { Button } from '@/components/ui'
import { formatClock } from '@/features/focus/timer'
import {
  circleScale,
  elapsedMs,
  isSessionComplete,
  pacerPause,
  pacerResume,
  phaseAt,
  phaseLabel,
  roundsCompleted,
  sessionSecondsLeft,
  type BreathPattern,
  type PacerTiming,
} from './breathing'

/**
 * The breathing pacer itself, lifted out of `BreathePage` UNCHANGED so it can be
 * reused wherever a short breathing step belongs (today: the 60-second reset in
 * the Get-to-Work flow).
 *
 * This was a pure MOVE — the component, both hooks and every line of markup are
 * byte-identical to what lived in BreathePage, which still renders it for the
 * full `/wellness/breathe` session. Extracting rather than exporting in place
 * keeps the route's lazy chunk out of any caller that only wants the pacer: it
 * deliberately imports no react-router and renders no header, no Card and no
 * back-link, so it drops into a step container as-is.
 *
 * Completion already existed as a callback: `onFinish(rounds, natural)`, where
 * `natural: false` means the user pressed End. Callers should decide explicitly
 * whether a bail still advances their flow.
 *
 * The chime is NOT played here — `BreathePage` plays it in its own `onFinish`,
 * so an embedded pacer is silent unless its caller opts in (and unlocks the
 * shared AudioContext from a real click first; see `@/features/focus/sound`).
 */

/** rAF-driven re-render clock (smooth animation); pauses when inactive. */
function useRafNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!active) return
    let raf = 0
    const loop = () => {
      setNow(Date.now())
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    // Snap to the correct point in the cycle when returning to a throttled tab.
    const onVisible = () => {
      if (document.visibilityState === 'visible') setNow(Date.now())
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      cancelAnimationFrame(raf)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [active])
  return now
}

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    setReduced(mq.matches)
    const onChange = () => setReduced(mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])
  return reduced
}

export function RunningPacer({
  pattern,
  durationMin,
  onFinish,
}: {
  pattern: BreathPattern
  durationMin: number
  onFinish: (rounds: number, natural: boolean) => void
}) {
  const [timing, setTiming] = useState<PacerTiming>(() => ({
    startedAtMs: Date.now(),
    accumulatedPausedMs: 0,
    pausedAtMs: null,
  }))
  const paused = timing.pausedAtMs !== null
  const reduced = usePrefersReducedMotion()
  const now = useRafNow(!paused)
  const finishedRef = useRef(false)

  const elapsed = elapsedMs(timing, now)
  const complete = isSessionComplete(durationMin, elapsed)
  const state = phaseAt(elapsed, pattern)
  const fullness = circleScale(state)
  const secsLeft = sessionSecondsLeft(durationMin, elapsed)

  // Finalize once when the session reaches its full duration.
  useEffect(() => {
    if (!complete || finishedRef.current) return
    finishedRef.current = true
    onFinish(roundsCompleted(durationMin * 60 * 1000, pattern), true)
  }, [complete, durationMin, pattern, onFinish])

  function togglePause() {
    setTiming((t) => (t.pausedAtMs !== null ? pacerResume(t, Date.now()) : pacerPause(t, Date.now())))
  }

  function endEarly() {
    if (finishedRef.current) return
    finishedRef.current = true
    onFinish(roundsCompleted(elapsed, pattern), false)
  }

  // Contracted ↔ expanded; gentle range for reduced-motion users.
  const lo = reduced ? 0.92 : 0.5
  const cssScale = lo + (1 - lo) * fullness

  return (
    <div className="flex flex-col items-center space-y-8 pt-2">
      <div className="relative flex h-64 w-64 items-center justify-center sm:h-72 sm:w-72">
        <div
          aria-hidden
          className="absolute inset-0 rounded-full bg-brand-gradient-soft ring-1 ring-brand/30"
          style={{ transform: `scale(${cssScale})`, willChange: 'transform' }}
        />
        <div className="relative z-10 text-center">
          <p role="status" aria-live="polite" className="font-display text-2xl font-semibold">
            {paused ? 'Paused' : phaseLabel(state.phase.type)}
          </p>
          {!paused && (
            <p aria-hidden className="mt-1 font-mono text-3xl tabular-nums text-text-muted">
              {state.phaseSecondsLeft}
            </p>
          )}
        </div>
      </div>

      <div className="text-center">
        <p className="font-mono text-lg tabular-nums text-text-primary">{formatClock(secsLeft)}</p>
        <p className="mt-1 text-xs text-text-muted">
          {pattern.name} · {roundsCompleted(elapsed, pattern)} rounds
        </p>
      </div>

      <div className="flex items-center gap-2">
        <Button variant="secondary" onClick={togglePause}>
          {paused ? (
            <>
              <Play className="h-4 w-4" aria-hidden /> Resume
            </>
          ) : (
            <>
              <Pause className="h-4 w-4" aria-hidden /> Pause
            </>
          )}
        </Button>
        <Button variant="ghost" onClick={endEarly}>
          <Square className="h-4 w-4" aria-hidden /> End
        </Button>
      </div>
    </div>
  )
}
