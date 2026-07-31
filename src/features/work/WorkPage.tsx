import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowRight, Inbox, Play, Timer, Wind } from 'lucide-react'
import { Badge, Button, Card, CardContent, Select } from '@/components/ui'
import { LoadError } from '@/components/common/LoadError'
import { useTasks } from '@/features/tasks/api/useTasks'
import { useWorkspace } from '@/features/workspace/workspace-context'
import { POMODORO } from '@/features/focus/pomodoro'
import { RunningPacer } from '@/features/wellness/breathwork/BreathPacer'
import { getPattern } from '@/features/wellness/breathwork/breathing'
import { FEATURES } from '@/lib/config'
import { todayISO } from '@/lib/date'
import { formatDateShort } from '@/lib/format'
import { cn } from '@/lib/utils'
import { pickWork, reasonLabel } from './pickWork'

/** The 60-second reset uses the simplest pattern — 4 in, 4 out, seven rounds. */
const RESET_PATTERN = getPattern('simple')
const RESET_MINUTES = 1

/**
 * "Get to work" — the one-tap route from wanting to start to actually starting.
 *
 * COMPOSITION ONLY. It owns no data, starts no timer and writes nothing: it
 * ranks what is already in the cache (`pickWork`), optionally renders the
 * EXISTING breathwork pacer for sixty seconds, and then hands off to the
 * existing Focus route. Everything it can do, the user could already do — it
 * just removes the three decisions between "I should start" and starting.
 *
 * The breathing step is gated by FEATURES.wellness as well as FEATURES.getToWork,
 * so switching the wellness suite off really does remove the whole suite rather
 * than leaving one of its components embedded here.
 */
export function WorkPage() {
  const navigate = useNavigate()
  const { workspaceId } = useWorkspace()
  const { data: tasks = [], isPending, isError, refetch } = useTasks(workspaceId)

  const today = todayISO()
  const pick = useMemo(() => pickWork(tasks, today), [tasks, today])

  const [chosenId, setChosenId] = useState<string | null>(null)
  // Explicitly boolean: FEATURES is `as const`, so the flag's type is the literal
  // `true` and an inferred state type would reject setPomodoro(false).
  const [pomodoro, setPomodoro] = useState<boolean>(FEATURES.pomodoro)
  const [breathing, setBreathing] = useState(false)
  const [cleared, setCleared] = useState(false)

  // `chosenId` is only an override; until the user picks, the top pick wins —
  // so a background refetch that changes the ranking is reflected immediately
  // rather than pinning a stale choice.
  const selected =
    (chosenId ? pick.candidates.find((t) => t.id === chosenId) : null) ?? pick.top

  function startFocus() {
    const params = new URLSearchParams()
    if (selected) params.set('task', selected.id)
    if (pomodoro && FEATURES.pomodoro) params.set('pomodoro', '1')
    navigate(`/focus?${params.toString()}`)
  }

  if (breathing) {
    return (
      <div className="animate-fade-in space-y-8">
        <header className="text-center">
          <h2 className="font-display text-2xl font-bold tracking-tight">Sixty seconds</h2>
          <p className="mt-1 text-text-muted">Follow the circle. Then we start.</p>
        </header>
        <RunningPacer
          pattern={RESET_PATTERN}
          durationMin={RESET_MINUTES}
          onFinish={() => {
            // `natural === false` (they pressed End) lands here too, on purpose:
            // stopping early is a decision, not a failure, and it should not
            // trap anyone in a breathing exercise on their way to work.
            setBreathing(false)
            setCleared(true)
          }}
        />
      </div>
    )
  }

  return (
    <div className="animate-fade-in space-y-8">
      <header>
        <h2 className="font-display text-2xl font-bold tracking-tight">Get to work</h2>
        <p className="mt-1 text-text-muted">One thing, one timer. Everything else can wait.</p>
      </header>

      {isError ? (
        // Without this a failed fetch fell through to "Nothing open to work on
        // — everything is done or cancelled", which is a cheerful lie with no
        // way back but a manual reload.
        <LoadError message="We couldn't work out what to start." onRetry={() => void refetch()} />
      ) : isPending ? (
        <div className="h-64 animate-pulse rounded-2xl border border-white/5 bg-surface-2/40" />
      ) : !selected ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-4 py-14 text-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-gradient-soft text-brand">
              <Inbox className="h-6 w-6" aria-hidden />
            </span>
            <div>
              <h3 className="font-display text-lg font-semibold">Nothing open to work on</h3>
              <p className="mx-auto mt-1 max-w-sm text-text-muted">
                Everything is done or cancelled. Capture the next thing and it will show up here.
              </p>
            </div>
            <Link to="/inbox">
              <Button>
                <Inbox className="h-4 w-4" aria-hidden /> Go to Inbox
              </Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="space-y-6">
            {/* ---- the pick ------------------------------------------------ */}
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-text-muted">Up next</p>
              <h3 className="mt-1.5 font-display text-2xl font-semibold">{selected.title}</h3>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {pick.reason && !chosenId && (
                  <span className="text-sm text-text-muted">{reasonLabel(pick.reason)}</span>
                )}
                {selected.effort_minutes ? (
                  <Badge variant="outline">{selected.effort_minutes} min</Badge>
                ) : null}
                {selected.due_date ? (
                  <Badge variant="outline">Due {formatDateShort(selected.due_date)}</Badge>
                ) : null}
              </div>
            </div>

            {pick.candidates.length > 1 && (
              <label className="block space-y-1.5">
                <span className="text-xs font-medium text-text-muted">Work on something else</span>
                <Select
                  value={selected.id}
                  onChange={(e) => setChosenId(e.target.value)}
                  aria-label="Choose what to work on"
                >
                  {pick.candidates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.title}
                    </option>
                  ))}
                </Select>
              </label>
            )}

            {/* ---- rhythm --------------------------------------------------- */}
            {FEATURES.pomodoro && (
              <fieldset className="space-y-2">
                <legend className="text-xs font-medium text-text-muted">Rhythm</legend>
                <div className="flex flex-wrap gap-2">
                  <RhythmButton active={pomodoro} onClick={() => setPomodoro(true)}>
                    <Timer className="h-3.5 w-3.5" aria-hidden />
                    Pomodoro {POMODORO.workMinutes}/{POMODORO.breakMinutes}
                  </RhythmButton>
                  <RhythmButton active={!pomodoro} onClick={() => setPomodoro(false)}>
                    One sprint
                  </RhythmButton>
                </div>
              </fieldset>
            )}

            {/* ---- go ------------------------------------------------------- */}
            <div className="flex flex-col gap-3">
              <Button onClick={startFocus} size="lg" className="w-full">
                <Play className="h-4 w-4" aria-hidden />
                Start focusing
              </Button>

              {FEATURES.wellness && (
                <button
                  type="button"
                  onClick={() => setBreathing(true)}
                  className="focus-ring inline-flex items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-sm text-text-muted transition-colors hover:text-text-primary"
                >
                  <Wind className="h-4 w-4" aria-hidden />
                  {cleared ? 'Another 60 seconds first' : 'Clear your head first (60 seconds)'}
                  <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                </button>
              )}

              {cleared && (
                <p className="text-center text-xs text-text-muted">
                  Head cleared. Whenever you&rsquo;re ready.
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function RhythmButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'focus-ring inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border px-4 py-2 text-sm font-medium transition-colors md:min-h-0',
        active
          ? 'border-transparent bg-brand-gradient text-white'
          : 'border-white/10 text-text-muted hover:text-text-primary',
      )}
    >
      {children}
    </button>
  )
}
