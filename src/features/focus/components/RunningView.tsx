import { useEffect, useRef, useState } from 'react'
import { Clock, Pause, Play, Square, Volume2, VolumeX, Zap } from 'lucide-react'
import { Button } from '@/components/ui'
import { track } from '@/features/analytics/track'
import { useWorkspace } from '@/features/workspace/workspace-context'
import { useTasks } from '@/features/tasks/api/useTasks'
import type { FocusSession } from '@/types/database'
import { CircularTimer } from './CircularTimer'
import { useFocusMutations } from '../api/useFocusSessions'
import { POMODORO } from '../pomodoro'
import { shouldTick } from '../ticking'
import {
  elapsedSeconds,
  endStatusFor,
  focusStartAnchorMs,
  formatClock,
  isComplete,
  remainingSeconds,
  resume as resumeTiming,
  resumeAnchorMs,
  type FocusTiming,
} from '../timer'
import { useNow } from '../useNow'
import { setPrefs, usePrefs } from '@/features/settings/prefs'
import { playEndTone, playTick } from '../sound'

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
  // The master switch in Settings wins. Showing "chime on" while Settings has
  // silenced everything would be the button lying about what it does.
  const prefs = usePrefs()
  const soundAllowed = prefs.sound
  const chimeAudible = soundOn && soundAllowed
  // Persisted, unlike the end chime's per-session toggle: continuous audio is a
  // standing choice, and re-arming it every sprint would be the annoying half of
  // the feature. Defaults to false, so nothing changes for anyone who never asks.
  const tickAudible = prefs.tick && soundAllowed
  const endingRef = useRef(false)

  const now = useNow(!paused)
  /*
   * PINNED ONCE PER SESSION, and that is load-bearing.
   *
   * `focusStartAnchorMs` refuses to count from a moment in the client's future
   * (see timer.ts). If it were recomputed every render while the server value is
   * still ahead of the browser clock, the anchor would advance WITH the clock and
   * the countdown would never move at all. A ref keyed on the session id gives
   * one anchor per session and survives every re-render in between.
   */
  const anchorRef = useRef<{ id: string; startedAtMs: number } | null>(null)
  // Read into a local so TypeScript narrows it: a ref's `.current` is a mutable
  // property and is not narrowed by an assignment inside the branch above it.
  let anchor = anchorRef.current
  if (anchor === null || anchor.id !== session.id) {
    anchor = {
      id: session.id,
      startedAtMs: focusStartAnchorMs(Date.parse(session.started_at), Date.now()),
    }
    anchorRef.current = anchor
  }
  const timing: FocusTiming = {
    startedAtMs: anchor.startedAtMs,
    accumulatedPausedSeconds: session.accumulated_paused_seconds,
    pausedAtMs: session.paused_at ? Date.parse(session.paused_at) : null,
  }
  const total = session.planned_minutes * 60
  const elapsed = elapsedSeconds(timing, now)
  const remaining = remainingSeconds(session.planned_minutes, elapsed)
  const progress = total > 0 ? elapsed / total : 0
  const complete = isComplete(session.planned_minutes, elapsed)

  /*
   * THE OPTIONAL COUNTDOWN TICK — driven by the SAME per-second render that
   * draws the clock, never by a timer of its own.
   *
   * That is the whole design. `useNow` already re-renders once a second while
   * the session runs, so emitting a tick when the displayed second CHANGES
   * gives, for free, every behaviour the feature needs: pausing stops the
   * re-renders and therefore the ticks; a backgrounded tab is throttled and
   * comes back with ONE jump in `elapsed`, so it produces one tick rather than a
   * burst of the seconds it missed; and there is no scheduler to duplicate,
   * leak, or tear down. A second `setInterval` here would be a second clock, and
   * two clocks in one feature is the exact bug the timer module was built to
   * avoid.
   *
   * The key carries the session id so a new sprint starts ticking again rather
   * than being suppressed by the previous session's last second.
   */
  const lastTickRef = useRef<string | null>(null)
  const tickingNow = shouldTick({
    enabled: tickAudible,
    masterSound: soundAllowed,
    paused,
    complete,
    ending: endingRef.current,
    status: session.status,
  })
  useEffect(() => {
    if (!tickingNow) {
      lastTickRef.current = null
      return
    }
    const key = `${session.id}:${elapsed}`
    if (lastTickRef.current === key) return
    lastTickRef.current = key
    playTick()
  }, [tickingNow, elapsed, session.id])

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

  /**
   * Auto-complete when the sprint reaches zero — but ONLY if it plausibly just
   * finished.
   *
   * `activeSession` returns any row still marked `running`, of any age, and this
   * effect ran on mount. So a sprint started on Tuesday and abandoned by closing
   * the tab was banked on Friday as a COMPLETED session of its full planned
   * length: real focus minutes in Insights, real points, a real data point for
   * estimation bias, and — at 25 minutes — a certified pomodoro that never
   * happened. Nothing anywhere bounded it.
   *
   * The grace window is the planned duration plus fifteen minutes, mirroring the
   * bound `pomodoroStore` already applies to a resumed break. Beyond that the
   * session is closed as ABANDONED with zero seconds: it is the one write that
   * cannot invent work that was not done. Whether the honest alternative — ask
   * the user what to keep — is worth a screen is a product call, and it is
   * flagged rather than guessed at here.
   */
  useEffect(() => {
    if (!complete || endingRef.current || session.status !== 'running') return
    const startedAt = Date.parse(session.started_at)
    const graceMs = (session.planned_minutes * 60 + 15 * 60) * 1000
    if (Number.isFinite(startedAt) && Date.now() - startedAt > graceMs) {
      end('abandoned', 0, 'stopped')
      return
    }
    if (soundOn) playEndTone()
    end('completed', total, 'finished')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [complete])

  function togglePause() {
    if (paused) {
      const resumeAt = Date.now()
      const pausedAtMs = timing.pausedAtMs ?? resumeAt
      const resumed = resumeTiming(timing, resumeAt)
      /*
       * RE-ANCHOR SO THE COUNTDOWN CONTINUES FROM WHERE IT FROZE.
       *
       * The write below records the pause in WHOLE seconds; the anchor absorbs
       * the sub-second remainder that would otherwise be counted as focus. The
       * first frame after Resume is then identical to the last frame before it,
       * whatever the pause lasted and whatever the round trip costs — and
       * repeated pausing neither gains nor loses time.
       *
       * Display only. A reload still recovers from the database exactly as
       * before.
       */
      const previousAnchor = anchorRef.current
      anchorRef.current = {
        id: session.id,
        // `timing.startedAtMs` rather than `anchor.startedAtMs`: `anchor` is a
        // `let`, so inside this closure TypeScript widens it back to nullable.
        startedAtMs: resumeAnchorMs(timing.startedAtMs, pausedAtMs, resumeAt),
      }
      patchSession.mutate(
        {
          id: session.id,
          patch: { paused_at: null, accumulated_paused_seconds: resumed.accumulatedPausedSeconds },
        },
        {
          // The re-anchor above is optimistic, exactly like the cache patch it
          // accompanies. If the write fails the session goes back to PAUSED, and
          // an anchor computed for the resumed total would then read a whole
          // pause too high. Roll both back together or neither.
          onError: () => {
            anchorRef.current = previousAnchor
          },
        },
      )
    } else {
      /*
       * PAUSE AT THE INSTANT THE DISPLAYED NUMBER WAS COMPUTED FOR — `now`, the
       * value from `useNow` that produced the clock currently on screen — and
       * NOT at `Date.now()`.
       *
       * `useNow` re-renders once a second, so a click lands up to a second after
       * the number it appears to be pausing. Stamping the click makes the pause
       * instant later than the frozen display, and every consumer then has to
       * choose between showing the stale number and showing the true one — which
       * is a visible jump either at Pause or at Resume, whichever end pays for
       * it. Stamping `now` removes the disagreement instead of arbitrating it:
       * the screen, a reload mid-pause, the resume and `actual_seconds` all
       * describe the same instant.
       *
       * The sub-second gap it hands to the pause is real but bounded and
       * CONSERVATIVE — it can only ever under-report focus, never inflate it.
       */
      patchSession.mutate({ id: session.id, patch: { paused_at: new Date(now).toISOString() } })
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

  /*
   * A SEPARATE CONTROL, not a second meaning for the speaker.
   *
   * The speaker already says one thing precisely — "chime when the timer ends".
   * Folding a continuous sound into it would make both settings unreadable from
   * the icon. Two small buttons, two unambiguous labels.
   */
  function toggleTick() {
    const next = !prefs.tick
    setPrefs({ tick: next })
    // Inside the click, so the shared AudioContext is unlocked and the first
    // tick is audible; it also confirms the choice with the sound it enables.
    if (next) playTick()
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
            {pomodoro.completed} done so far, with a {POMODORO.longBreakMinutes}-minute break after{' '}
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
          title={
            !soundAllowed
              ? 'Sounds are switched off in Settings'
              : chimeAudible
                ? 'End chime on, tap to mute'
                : 'Play a soft chime when the timer ends'
          }
          aria-label={chimeAudible ? 'Turn end chime off' : 'Turn end chime on'}
          aria-pressed={chimeAudible}
          className="focus-ring rounded-lg p-2 text-text-muted transition-colors hover:text-text-primary"
        >
          {chimeAudible ? <Volume2 className="h-4 w-4" aria-hidden /> : <VolumeX className="h-4 w-4" aria-hidden />}
        </button>
        <button
          type="button"
          onClick={toggleTick}
          title={
            !soundAllowed
              ? 'Sounds are switched off in Settings'
              : tickAudible
                ? 'Ticking on, tap to silence'
                : 'Tick softly once a second while the timer runs'
          }
          aria-label={tickAudible ? 'Turn countdown ticking off' : 'Turn countdown ticking on'}
          aria-pressed={tickAudible}
          className="focus-ring rounded-lg p-2 text-text-muted transition-colors hover:text-text-primary"
        >
          <Clock className={`h-4 w-4 ${tickAudible ? 'text-text-primary' : ''}`} aria-hidden />
        </button>
      </div>

      <p className="text-center text-xs text-text-muted">Everything else can wait.</p>
    </div>
  )
}
