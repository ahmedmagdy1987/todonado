import { useEffect, useRef, useState } from 'react'
import { Check, Play, RotateCcw, Volume2, VolumeX } from 'lucide-react'
import { Badge, Button, Card, CardContent } from '@/components/ui'
import { CircularTimer } from '@/features/focus/components/CircularTimer'
import { playEndTone } from '@/features/focus/sound'
import { cn } from '@/lib/utils'
import { DEMO_FOCUS_SECONDS, demoFocusProgress, formatDemoClock } from './focusTiming'

type Phase = 'idle' | 'running' | 'done'

/**
 * W3 — "Focus". A 25-SECOND stand-in for a real 25-minute sprint, so a visitor
 * can feel the ring close and land on the calm completion state without waiting.
 * Reuses the product's own CircularTimer and end chime.
 *
 * Like the real Focus timer, the countdown is derived from wall-clock
 * timestamps rather than counted ticks, so it stays honest if the tab is
 * throttled or backgrounded. Sound is OFF by default.
 */
export function FocusDemo() {
  const [phase, setPhase] = useState<Phase>('idle')
  const [remaining, setRemaining] = useState(DEMO_FOCUS_SECONDS)
  const [sound, setSound] = useState(false)
  const startedAt = useRef<number | null>(null)
  // Read inside the interval without making sound a dependency (which would
  // restart the countdown whenever it's toggled mid-sprint).
  const soundRef = useRef(sound)
  soundRef.current = sound

  useEffect(() => {
    if (phase !== 'running') return

    const tick = () => {
      if (startedAt.current == null) return
      const elapsed = (Date.now() - startedAt.current) / 1000
      const left = Math.max(0, DEMO_FOCUS_SECONDS - elapsed)
      setRemaining(left)
      if (left <= 0) {
        setPhase('done')
        // The AudioContext was already unlocked by the toggle's click gesture.
        if (soundRef.current) playEndTone()
      }
    }

    tick()
    const id = window.setInterval(tick, 200)
    return () => window.clearInterval(id)
  }, [phase])

  function start() {
    startedAt.current = Date.now()
    setRemaining(DEMO_FOCUS_SECONDS)
    setPhase('running')
  }

  function reset() {
    startedAt.current = null
    setRemaining(DEMO_FOCUS_SECONDS)
    setPhase('idle')
  }

  function toggleSound() {
    const next = !sound
    setSound(next)
    // Unlock + preview the chime from THIS click, so the gesture-less completion
    // chime can actually play later (browser autoplay policy).
    if (next) playEndTone()
  }

  const done = phase === 'done'

  return (
    <Card className="w-full ring-1 ring-white/5">
      <CardContent className="flex flex-col items-center gap-6 p-5 sm:p-6">
        <div className="flex w-full items-center gap-2">
          <Badge variant={done ? 'brand' : 'outline'}>
            {done ? 'Session complete' : 'Deep work'}
          </Badge>
          <button
            type="button"
            onClick={toggleSound}
            aria-pressed={sound}
            aria-label={sound ? 'Turn the end chime off' : 'Turn the end chime on'}
            className="focus-ring ml-auto inline-flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-xs text-text-muted transition-colors hover:text-text-primary"
          >
            {sound ? (
              <Volume2 className="h-4 w-4" aria-hidden />
            ) : (
              <VolumeX className="h-4 w-4" aria-hidden />
            )}
            Chime {sound ? 'on' : 'off'}
          </button>
        </div>

        <CircularTimer progress={demoFocusProgress(remaining)} size={200} stroke={12}>
          <span
            className={cn(
              'font-mono text-4xl font-semibold tabular-nums transition-colors',
              done ? 'text-success' : 'text-text-primary',
            )}
            role="timer"
            aria-live="off"
          >
            {done ? <Check className="h-10 w-10" aria-hidden /> : formatDemoClock(Math.ceil(remaining))}
          </span>
          <span className="mt-1 text-xs text-text-muted">
            {done ? 'Nothing lost' : 'Write the launch email'}
          </span>
        </CircularTimer>

        <p className="min-h-[2.5rem] max-w-xs text-center text-sm text-text-muted" aria-live="polite">
          {phase === 'idle' && 'One task, one timer, no tabs. Press start (this demo runs in seconds, not minutes).'}
          {phase === 'running' && 'The real thing survives a refresh, a pause, and a closed laptop.'}
          {done && 'That’s the whole ritual. The session is logged and the task carries its focus time.'}
        </p>

        <div className="flex items-center gap-3">
          {phase === 'idle' ? (
            <Button size="lg" onClick={start}>
              <Play className="h-4 w-4" aria-hidden />
              Start a sprint
            </Button>
          ) : (
            <Button size="md" variant="secondary" onClick={reset}>
              <RotateCcw className="h-4 w-4" aria-hidden />
              Reset
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
