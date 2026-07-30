import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Coffee, SkipForward, Square, Target, Volume2, VolumeX, Wind } from 'lucide-react'
import { Button } from '@/components/ui'
import { FEATURES } from '@/lib/config'
import { CircularTimer } from './CircularTimer'
import { playEndTone } from '../sound'
import { formatClock } from '../timer'
import { useNow } from '../useNow'
import { usePrefs } from '@/features/settings/prefs'
import {
  POMODORO,
  breakLabel,
  breakProgress,
  breakRemainingSeconds,
  cyclePosition,
  isBreakOver,
  type PomodoroBreak,
} from '../pomodoro'

/**
 * The break between pomodoros.
 *
 * Everything on screen is derived from `brk.startedAtMs` by a pure function, so
 * a reload, a locked phone or a throttled background tab all come back to the
 * correct remaining time — the same contract the sprint clock keeps. Nothing
 * here is written to the database: a break is not work (see the header of
 * `pomodoro.ts`).
 *
 * The break NEVER auto-starts the next interval. Classic pomodoro apps chain
 * automatically, but silently starting a timer that then records a session is a
 * decision the user should make, so when the break is up this asks. Skipping the
 * break is one tap away for anyone who disagrees.
 */
export function BreakView({
  brk,
  completed,
  taskTitle,
  onStartNext,
  onEndChain,
}: {
  brk: PomodoroBreak
  /** Work intervals finished in this chain. */
  completed: number
  taskTitle: string | null
  onStartNext: () => void
  onEndChain: () => void
}) {
  const [soundOn, setSoundOn] = useState(false)
  // Same rule as the sprint timer: the Settings master switch wins, and the
  // button never claims "on" while everything is silenced.
  const soundAllowed = usePrefs().sound
  const chimeAudible = soundOn && soundAllowed
  const chimedRef = useRef(false)

  const now = useNow(true)
  const remaining = breakRemainingSeconds(brk, now)
  const progress = breakProgress(brk, now)
  const over = isBreakOver(brk, now)
  const nextPosition = cyclePosition(completed)
  const label = breakLabel(brk.kind)

  // Chime exactly once when the break runs out. Guarded by a ref rather than by
  // the effect's deps because a user returning to a throttled tab can jump
  // straight past the boundary — the effect must fire at most once either way.
  useEffect(() => {
    if (!over || chimedRef.current) return
    chimedRef.current = true
    if (soundOn) playEndTone()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [over])

  function toggleSound() {
    const next = !soundOn
    setSoundOn(next)
    // Played inside the click so the shared AudioContext is unlocked for the
    // gesture-less chime when the break actually ends.
    if (next) playEndTone()
  }

  return (
    <div className="animate-fade-in flex flex-col items-center space-y-8 pt-4">
      <div className="text-center">
        <p className="text-xs uppercase tracking-[0.2em] text-text-muted">
          {brk.kind === 'long-break' ? 'Long break' : 'Break'}
        </p>
        <h2 className="mt-1 font-display text-xl font-semibold">
          {over ? 'Break’s over' : 'Step away for a minute'}
        </h2>
        <p className="mt-1 text-sm text-text-muted">
          {completed} {completed === 1 ? 'pomodoro' : 'pomodoros'} done
          {taskTitle ? (
            <>
              {' '}
              on <span className="text-text-primary">{taskTitle}</span>
            </>
          ) : null}
        </p>
      </div>

      <CircularTimer progress={progress}>
        <span className="font-mono text-5xl font-semibold tabular-nums text-text-primary">
          {formatClock(remaining)}
        </span>
        <span className="mt-2 font-mono text-xs text-text-muted">
          {brk.minutes}-min {label}
        </span>
      </CircularTimer>

      <div className="flex flex-wrap items-center justify-center gap-2">
        <Button onClick={onStartNext} size={over ? 'lg' : 'md'}>
          <Target className="h-4 w-4" aria-hidden />
          Start pomodoro {nextPosition} of {POMODORO.cyclesBeforeLongBreak}
        </Button>
        {!over && (
          <Button variant="secondary" onClick={onStartNext}>
            <SkipForward className="h-4 w-4" aria-hidden /> Skip the {label}
          </Button>
        )}
        <Button variant="ghost" onClick={onEndChain}>
          <Square className="h-4 w-4" aria-hidden /> End for now
        </Button>
        <button
          type="button"
          onClick={toggleSound}
          title={
            !soundAllowed
              ? 'Sounds are switched off in Settings'
              : chimeAudible
                ? 'Chime on — tap to mute'
                : 'Play a soft chime when the break ends'
          }
          aria-label={chimeAudible ? 'Turn break chime off' : 'Turn break chime on'}
          aria-pressed={chimeAudible}
          className="focus-ring rounded-lg p-2 text-text-muted transition-colors hover:text-text-primary"
        >
          {chimeAudible ? (
            <Volume2 className="h-4 w-4" aria-hidden />
          ) : (
            <VolumeX className="h-4 w-4" aria-hidden />
          )}
        </button>
      </div>

      {brk.kind === 'long-break' && FEATURES.wellness ? (
        <Link
          to="/wellness/breathe"
          className="focus-ring inline-flex items-center gap-1.5 rounded-lg text-sm text-accent underline-offset-4 hover:underline"
        >
          <Wind className="h-4 w-4" aria-hidden />
          Spend it on some breathwork
        </Link>
      ) : (
        <p className="flex items-center gap-1.5 text-center text-xs text-text-muted">
          <Coffee className="h-3.5 w-3.5" aria-hidden />
          Stand up, look out a window, get some water.
        </p>
      )}
    </div>
  )
}
