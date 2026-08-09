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
import { countdownTickControl, endChimeControl } from '../audioControls'
import { nextTickGate } from '../tickGate'
import { IDLE_INTERRUPTION, reduceInterruption, type InterruptionState } from '../interruption'
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
import {
  installAudioUnlock,
  playEndTone,
  playInterruptionTone,
  playTick,
  unlockAudio,
} from '../sound'

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
  // Set only when the browser refuses to give us an AudioContext at all, so the
  // failure is stated rather than swallowed.
  const [audioUnavailable, setAudioUnavailable] = useState(false)
  // The master switch in Settings wins. Showing "chime on" while Settings has
  // silenced everything would be the button lying about what it does.
  const prefs = usePrefs()
  const soundAllowed = prefs.sound
  // Persisted, unlike the end chime's per-session toggle: continuous audio is a
  // standing choice, and re-arming it every sprint would be the annoying half of
  // the feature. Defaults to false, so nothing changes for anyone who never asks.
  const tickAudible = prefs.tick && soundAllowed
  // The two controls' wording and pressed state, from one place so the label,
  // the tooltip, `aria-pressed` and the highlight cannot disagree.
  const chime = endChimeControl({ enabled: soundOn, masterSound: soundAllowed })
  const tick = countdownTickControl({ enabled: prefs.tick, masterSound: soundAllowed })
  const endingRef = useRef(false)

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
  /*
   * TICK ON THE COUNTDOWN'S OWN SECOND BOUNDARY, not on a cadence unrelated to
   * it. `elapsedSeconds` changes value whenever `now - startedAt - paused`
   * crosses a whole second, so this is the instant it last did.
   *
   * That alignment is what lets Pause stamp the TRUE click instant below without
   * the clock appearing to move: between two renders the displayed second cannot
   * have changed, so the value on screen is never stale even though the render
   * is. Ticking on an arbitrary phase instead forces a choice between a visible
   * jump and quietly attributing up to a second of real focus to every pause —
   * which compounds, at ~0.5s per pause.
   */
  const now = useNow(!paused, timing.startedAtMs + timing.accumulatedPausedSeconds * 1000)
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
    const gate = nextTickGate(lastTickRef.current, {
      allowed: tickingNow,
      sessionId: session.id,
      elapsed,
    })
    lastTickRef.current = gate.key
    if (gate.emit) playTick()
  }, [tickingNow, elapsed, session.id])

  /*
   * UNLOCK AUDIO ON THE NEXT GESTURE, because ticking is a PERSISTED preference
   * and the session survives a reload.
   *
   * The path this exists for: the preference is already on from a previous
   * sprint, the tab is reloaded mid-session, and the timer starts ticking with
   * no click having happened on this page. The shared context is then created
   * inside a timer callback, the autoplay policy starts it suspended, its clock
   * never runs, and every tick of the sprint is scheduled against a frozen
   * `currentTime`. Silent, with nothing to see in the console.
   *
   * One listener, fired at most once, removed as soon as the context is running.
   * It is NOT a clock and adds no cadence — `useNow` remains the only timing
   * source in this component.
   */
  useEffect(() => {
    if (!tickAudible) return
    return installAudioUnlock()
  }, [tickAudible])

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
       * STAMP THE TRUE CLICK INSTANT. The pause began when the user pressed the
       * button, and recording anything else silently mis-attributes real time.
       *
       * Stamping the last RENDER instead was tried, to guarantee the frozen
       * value matched the screen. It does — and it hands the gap between that
       * render and the click to the pause, which is up to a second of focus lost
       * PER PAUSE: 19.9s over 40 pause/resume cycles, 97.9s over 200, growing
       * strictly with how often you pause. The countdown looked perfect while
       * `actual_seconds` drifted underneath it.
       *
       * Ticking on the countdown's own boundary (above) removes the trade-off
       * rather than picking a side: the displayed second cannot change between
       * two renders, so the true value at the click IS the value on screen.
       */
      patchSession.mutate({ id: session.id, patch: { paused_at: new Date().toISOString() } })
    }
  }

  /*
   * The confirmation sound means RECORDED, never "button pressed" — so it is
   * emitted from `onSuccess` and from nowhere else. `interruption.ts` holds the
   * rule (and the reason the unlock has to happen here, in the click, while the
   * page still has user activation to spend).
   */
  const interruptionRef = useRef<InterruptionState>(IDLE_INTERRUPTION)

  function logInterruption() {
    const click = reduceInterruption(interruptionRef.current, 'click')
    interruptionRef.current = click.state
    if (!click.log) return
    if (click.unlock) unlockAudio()
    patchSession.mutate(
      { id: session.id, patch: { interruptions: session.interruptions + 1 } },
      {
        onSuccess: () => {
          const settled = reduceInterruption(interruptionRef.current, 'success')
          interruptionRef.current = settled.state
          if (settled.confirm) playInterruptionTone()
        },
        // The mutation's own onError still rolls the optimistic patch back; this
        // only reopens the gate so the user can try again. No sound.
        onError: () => {
          interruptionRef.current = reduceInterruption(interruptionRef.current, 'error').state
        },
      },
    )
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
    if (prefs.tick) {
      setPrefs({ tick: false })
      return
    }
    /*
     * UNLOCK FIRST, INSIDE THE CLICK. This is the one moment the browser will
     * let us start an AudioContext, and everything after it — the preview below
     * and every gesture-less per-second tick for the rest of the sprint — runs
     * on the context started here.
     *
     * If the browser will not give us one at all, the control does NOT switch
     * on. Leaving it lit while nothing can ever play is precisely the failure
     * that took two rounds of retuning to notice.
     */
    if (unlockAudio() === 'unavailable') {
      setAudioUnavailable(true)
      return
    }
    setAudioUnavailable(false)
    setPrefs({ tick: true })
    // A preview, so enabling it is confirmed by the sound it enables.
    playTick()
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
        {/*
          NAMED, not just iconographic. A speaker beside a clock reads as "all
          sound" beside "something about time"; the labels are what make it
          obvious that one is the ending and the other is the running.

          The text is hidden below `sm` because five controls with labels do not
          fit a 390px row — but `aria-label` and `title` are unconditional, so
          the narrow layout loses the visible word and nothing else.

          `secondary` when on / `ghost` when off is the existing pair used for a
          selected-vs-idle control elsewhere in the app: a filled surface rather
          than a colour, which keeps both of these visually behind Pause, Log
          interruption and End early.
        */}
        <Button
          variant={chime.pressed ? 'secondary' : 'ghost'}
          size="sm"
          onClick={toggleSound}
          title={chime.title}
          aria-label={chime.ariaLabel}
          aria-pressed={chime.pressed}
        >
          {chime.pressed ? (
            <Volume2 className="h-4 w-4" aria-hidden />
          ) : (
            <VolumeX className="h-4 w-4" aria-hidden />
          )}
          <span className="hidden sm:inline">{chime.label}</span>
        </Button>
        <Button
          variant={tick.pressed ? 'secondary' : 'ghost'}
          size="sm"
          onClick={toggleTick}
          title={tick.title}
          aria-label={tick.ariaLabel}
          aria-pressed={tick.pressed}
        >
          <Clock className="h-4 w-4" aria-hidden />
          <span className="hidden sm:inline">{tick.label}</span>
        </Button>
      </div>

      {audioUnavailable && (
        <p role="status" className="text-center text-xs text-warning">
          This browser blocked audio, so ticking stayed off. Check the site&apos;s sound permission
          and try again.
        </p>
      )}

      <p className="text-center text-xs text-text-muted">Everything else can wait.</p>
    </div>
  )
}
