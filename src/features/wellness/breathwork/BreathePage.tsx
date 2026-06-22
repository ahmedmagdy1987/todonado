import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, Pause, Play, Sparkles, Square, Volume2, VolumeX, Wind } from 'lucide-react'
import { Button, Card, CardContent } from '@/components/ui'
import { playEndTone } from '@/features/focus/sound'
import { formatClock } from '@/features/focus/timer'
import { cn } from '@/lib/utils'
import {
  BREATH_DURATIONS_MIN,
  BREATH_PATTERNS,
  circleScale,
  elapsedMs,
  getPattern,
  isSessionComplete,
  pacerPause,
  pacerResume,
  phaseAt,
  phaseLabel,
  roundsCompleted,
  sessionSecondsLeft,
  type BreathPattern,
  type BreathPatternId,
  type PacerTiming,
} from './breathing'

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

type Stage = 'setup' | 'running' | 'done'
interface SessionResult {
  rounds: number
  durationMin: number
  patternName: string
}

export function BreathePage() {
  const [stage, setStage] = useState<Stage>('setup')
  const [patternId, setPatternId] = useState<BreathPatternId>('box')
  const [durationMin, setDurationMin] = useState<number>(3)
  const [chimeOn, setChimeOn] = useState(false)
  const [result, setResult] = useState<SessionResult | null>(null)

  const pattern = getPattern(patternId)

  function toggleChime() {
    const next = !chimeOn
    setChimeOn(next)
    // Play a preview now (a user gesture) — this also unlocks the shared
    // AudioContext so the gesture-less end chime can sound later.
    if (next) playEndTone()
  }

  function handleFinish(rounds: number, natural: boolean) {
    if (natural && chimeOn) playEndTone()
    setResult({ rounds, durationMin, patternName: pattern.name })
    setStage('done')
  }

  return (
    <div className="animate-fade-in space-y-8">
      <header className="space-y-3">
        <Link
          to="/wellness"
          className="focus-ring inline-flex items-center gap-1.5 rounded-lg text-sm text-text-muted transition-colors hover:text-text-primary"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          Focus &amp; Calm
        </Link>
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-brand-gradient-soft text-brand">
            <Wind className="h-5 w-5" aria-hidden />
          </span>
          <div>
            <h2 className="font-display text-xl font-semibold">Breathwork</h2>
            <p className="text-sm text-text-muted">A guided breathing pacer to steady your day.</p>
          </div>
        </div>
      </header>

      {stage === 'setup' && (
        <BreathSetup
          patternId={patternId}
          onPattern={setPatternId}
          durationMin={durationMin}
          onDuration={setDurationMin}
          chimeOn={chimeOn}
          onToggleChime={toggleChime}
          onStart={() => setStage('running')}
        />
      )}

      {stage === 'running' && (
        <RunningPacer pattern={pattern} durationMin={durationMin} onFinish={handleFinish} />
      )}

      {stage === 'done' && result && (
        <BreathSummary result={result} onAgain={() => setStage('setup')} />
      )}
    </div>
  )
}

function BreathSetup({
  patternId,
  onPattern,
  durationMin,
  onDuration,
  chimeOn,
  onToggleChime,
  onStart,
}: {
  patternId: BreathPatternId
  onPattern: (id: BreathPatternId) => void
  durationMin: number
  onDuration: (min: number) => void
  chimeOn: boolean
  onToggleChime: () => void
  onStart: () => void
}) {
  return (
    <div className="space-y-6">
      <fieldset className="space-y-3">
        <legend className="text-xs font-medium uppercase tracking-wide text-text-muted">
          Pattern
        </legend>
        <div className="grid gap-3 sm:grid-cols-3">
          {BREATH_PATTERNS.map((p) => {
            const active = p.id === patternId
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => onPattern(p.id)}
                aria-pressed={active}
                className={cn(
                  'focus-ring rounded-2xl border p-4 text-left transition-colors',
                  active
                    ? 'border-brand/50 bg-brand-gradient-soft'
                    : 'border-white/5 bg-surface hover:bg-surface-2/60',
                )}
              >
                <div className="flex items-center justify-between">
                  <span className="font-display text-base font-semibold">{p.name}</span>
                  <span className="font-mono text-xs text-text-muted">{p.cadence}</span>
                </div>
                <p className="mt-1 text-xs text-text-muted">{p.description}</p>
              </button>
            )
          })}
        </div>
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="text-xs font-medium uppercase tracking-wide text-text-muted">
          Duration
        </legend>
        <div className="flex flex-wrap gap-2">
          {BREATH_DURATIONS_MIN.map((min) => {
            const active = min === durationMin
            return (
              <button
                key={min}
                type="button"
                onClick={() => onDuration(min)}
                aria-pressed={active}
                className={cn(
                  'focus-ring h-10 rounded-xl border px-5 text-sm font-medium transition-colors',
                  active
                    ? 'border-brand/50 bg-brand-gradient text-white'
                    : 'border-white/10 text-text-muted hover:text-text-primary',
                )}
              >
                {min} min
              </button>
            )
          })}
        </div>
      </fieldset>

      <div className="flex flex-wrap items-center gap-3">
        <Button size="lg" onClick={onStart}>
          <Wind className="h-4 w-4" aria-hidden />
          Begin
        </Button>
        <button
          type="button"
          onClick={onToggleChime}
          aria-pressed={chimeOn}
          className="focus-ring inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm text-text-muted transition-colors hover:text-text-primary"
        >
          {chimeOn ? <Volume2 className="h-4 w-4" aria-hidden /> : <VolumeX className="h-4 w-4" aria-hidden />}
          End chime {chimeOn ? 'on' : 'off'}
        </button>
      </div>
    </div>
  )
}

function RunningPacer({
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

function BreathSummary({ result, onAgain }: { result: SessionResult; onAgain: () => void }) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-4 py-12 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-gradient-soft text-brand">
          <Sparkles className="h-6 w-6" aria-hidden />
        </span>
        <div>
          <h3 className="font-display text-xl font-semibold">Nicely done</h3>
          <p className="mx-auto mt-1 max-w-sm text-text-muted">
            {result.rounds} {result.rounds === 1 ? 'round' : 'rounds'} of {result.patternName}{' '}
            breathing over {result.durationMin} {result.durationMin === 1 ? 'minute' : 'minutes'}.
            Take that calm with you.
          </p>
        </div>
        <div className="flex flex-wrap justify-center gap-2">
          <Button onClick={onAgain}>
            <Wind className="h-4 w-4" aria-hidden /> Go again
          </Button>
          <Link to="/wellness">
            <Button variant="outline">Back to Focus &amp; Calm</Button>
          </Link>
        </div>
      </CardContent>
    </Card>
  )
}
