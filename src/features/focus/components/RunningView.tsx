import { useEffect, useRef, useState } from 'react'
import { Pause, Play, Square, Volume2, VolumeX, Zap } from 'lucide-react'
import { Button } from '@/components/ui'
import { track } from '@/features/analytics/track'
import { useWorkspace } from '@/features/workspace/workspace-context'
import { useTasks } from '@/features/tasks/api/useTasks'
import type { FocusSession } from '@/types/database'
import { CircularTimer } from './CircularTimer'
import { useFocusMutations } from '../api/useFocusSessions'
import { POMODORO } from '../pomodoro'
import {
  elapsedSeconds,
  endStatusFor,
  formatClock,
  isComplete,
  remainingSeconds,
  resume as resumeTiming,
  type FocusTiming,
} from '../timer'
import { useNow } from '../useNow'
import { playEndTone } from '../sound'

/**
 * How a session ENDED, which is not the same thing as its recorded status.
 * `endStatusFor` marks anything over a minute 'completed' even when the user
 * stopped it early, so a pomodoro chain cannot use the status to decide whether
 * an interval was actually seen through:
 *   'finished' — the clock reached zero on its own (a real pomodoro).
 *   'stopped'  — the user pressed End early (the chain ends here).
 */
export type EndReason = 'finished' | 'stopped'

export function RunningView({
  session,
  onEnded,
  pomodoro = null,
}: {
  session: FocusSession
  onEnded: (id: string, reason: EndReason) => void
  /** Set when this interval is part of a pomodoro chain. */
  pomodoro?: { position: number; completed: number } | null
}) {
  const { workspaceId } = useWorkspace()
  const { patchSession } = useFocusMutations(workspaceId)
  const { data: tasks = [] } = useTasks(workspaceId)
  const task = session.task_id ? (tasks.find((t) => t.id === session.task_id) ?? null) : null
  const paused = session.paused_at !== null
  const [soundOn, setSoundOn] = useState(false)
  const endingRef = useRef(false)

  const now = useNow(!paused)
  const timing: FocusTiming = {
    startedAtMs: Date.parse(session.started_at),
    accumulatedPausedSeconds: session.accumulated_paused_seconds,
    pausedAtMs: session.paused_at ? Date.parse(session.paused_at) : null,
  }
  const total = session.planned_minutes * 60
  const elapsed = elapsedSeconds(timing, now)
  const remaining = remainingSeconds(session.planned_minutes, elapsed)
  const progress = total > 0 ? elapsed / total : 0
  const complete = isComplete(session.planned_minutes, elapsed)

  function end(status: 'completed' | 'abandoned', actualSeconds: number, reason: EndReason) {
    if (endingRef.current) return
    endingRef.current = true
    if (status === 'completed') track('focus_completed')
    patchSession.mutate(
      {
        id: session.id,
        patch: {
          status,
          ended_at: new Date().toISOString(),
          actual_seconds: actualSeconds,
          paused_at: null,
        },
      },
      // If the end fails (e.g. offline), un-wedge the guard so it can be retried.
      { onError: () => void (endingRef.current = false) },
    )
    onEnded(session.id, reason)
  }

  // Auto-complete when the sprint reaches zero.
  useEffect(() => {
    if (!complete || endingRef.current || session.status !== 'running') return
    if (soundOn) playEndTone()
    end('completed', total, 'finished')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [complete])

  function togglePause() {
    if (paused) {
      const resumed = resumeTiming(timing, Date.now())
      patchSession.mutate({
        id: session.id,
        patch: { paused_at: null, accumulated_paused_seconds: resumed.accumulatedPausedSeconds },
      })
    } else {
      patchSession.mutate({ id: session.id, patch: { paused_at: new Date().toISOString() } })
    }
  }

  function logInterruption() {
    patchSession.mutate({ id: session.id, patch: { interruptions: session.interruptions + 1 } })
  }

  function toggleSound() {
    const next = !soundOn
    setSoundOn(next)
    // Play the chime now (this runs inside a user gesture) both as a preview and
    // to unlock the shared AudioContext so the gesture-less completion chime works.
    if (next) playEndTone()
  }

  function endEarly() {
    end(endStatusFor(elapsed), elapsed, 'stopped')
  }

  return (
    <div className="animate-fade-in flex flex-col items-center space-y-8 pt-4">
      <div className="text-center">
        <p className="text-xs uppercase tracking-[0.2em] text-text-muted">
          {paused
            ? 'Paused'
            : pomodoro
              ? `Pomodoro ${pomodoro.position} of ${POMODORO.cyclesBeforeLongBreak}`
              : 'Focusing'}
        </p>
        <h2 className="mt-1 font-display text-xl font-semibold">
          {task ? task.title : 'General focus'}
        </h2>
        {pomodoro && pomodoro.completed > 0 && (
          <p className="mt-1 text-sm text-text-muted">
            {pomodoro.completed} done so far — a {POMODORO.longBreakMinutes}-minute break after{' '}
            {POMODORO.cyclesBeforeLongBreak}.
          </p>
        )}
      </div>

      <CircularTimer progress={progress}>
        <span className="font-mono text-5xl font-semibold tabular-nums text-text-primary">
          {formatClock(remaining)}
        </span>
        <span className="mt-2 font-mono text-xs text-text-muted">
          {session.interruptions} {session.interruptions === 1 ? 'interruption' : 'interruptions'}
        </span>
      </CircularTimer>

      <div className="flex flex-wrap items-center justify-center gap-2">
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
        <Button
          variant="outline"
          onClick={logInterruption}
          title="Tally a distraction without stopping your timer"
        >
          <Zap className="h-4 w-4" aria-hidden /> Log interruption
        </Button>
        <Button variant="ghost" onClick={endEarly}>
          <Square className="h-4 w-4" aria-hidden /> End early
        </Button>
        <button
          type="button"
          onClick={toggleSound}
          title={soundOn ? 'End chime on — tap to mute' : 'Play a soft chime when the timer ends'}
          aria-label={soundOn ? 'Turn end chime off' : 'Turn end chime on'}
          className="focus-ring rounded-lg p-2 text-text-muted transition-colors hover:text-text-primary"
        >
          {soundOn ? <Volume2 className="h-4 w-4" aria-hidden /> : <VolumeX className="h-4 w-4" aria-hidden />}
        </button>
      </div>

      <p className="text-center text-xs text-text-muted">Everything else can wait.</p>
    </div>
  )
}
