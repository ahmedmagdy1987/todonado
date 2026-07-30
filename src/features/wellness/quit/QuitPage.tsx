import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, ArrowRight, Plus, Sprout, X } from 'lucide-react'
import { Button, Card, CardContent } from '@/components/ui'
import { useToast } from '@/components/common/toast-context'
import { useAuth } from '@/features/auth/auth-context'
import { usePlan } from '@/features/billing/usePlan'
import { FREE_QUIT_HABITS } from '@/lib/config'
import { todayISO } from '@/lib/date'
import type { QuitHabit } from '@/types/database'
import { useQuitCheckins, useQuitHabits } from './api/useQuit'
import { useQuitMutations } from './api/useQuitMutations'
import { checkedDaysForHabit, checkinStreak } from './quitMath'
import { replacementLink } from './presets'
import { QuitHabitCard } from './components/QuitHabitCard'
import { QuitHabitDialog } from './components/QuitHabitDialog'
import { QuitLimitUpsell } from './components/QuitLimitUpsell'
import { SlipDialog } from './components/SlipDialog'
import { SupportNote } from './components/SupportNote'

/**
 * The Quit area — habits the user is BREAKING.
 *
 * Composition only: every number on this page is derived by the pure functions
 * in `quitMath.ts` from rows the two queries already fetched. The page holds no
 * counter of its own, so nothing here can disagree with the card above it.
 *
 * TONE IS A REQUIREMENT, NOT A GARNISH. Someone opens this page on the worst
 * day of a streak as well as the best one. There is no red, no "failed", no
 * loss animation, and no celebration loud enough to be embarrassing. See the
 * naming rule at the top of `presets.ts`.
 */
export function QuitPage() {
  const { user } = useAuth()
  const userId = user?.id ?? ''
  const { isPro } = usePlan()
  const toast = useToast()

  const { data: habitsData, isPending } = useQuitHabits(userId)
  const { data: checkins = [] } = useQuitCheckins(userId)
  const { slip, deleteHabit, checkIn, undoCheckIn } = useQuitMutations(userId)

  const habits = useMemo(() => habitsData?.rows ?? [], [habitsData])
  /** False ONLY when the table is absent (migration pending) — defaults to true
   *  while loading so the Add button doesn't flicker out and back in. */
  const available = habitsData?.available ?? true

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<QuitHabit | null>(null)
  const [slipping, setSlipping] = useState<QuitHabit | null>(null)
  const [showLimit, setShowLimit] = useState(false)
  /** The habit whose day zero was JUST reset — surfaces its replacement action. */
  const [justSlippedId, setJustSlippedId] = useState<string | null>(null)

  const today = todayISO()
  const canCreate = isPro || habits.length < FREE_QUIT_HABITS
  const justSlipped = habits.find((h) => h.id === justSlippedId) ?? null

  function openAdd() {
    if (!canCreate) {
      // The gate is a card in the flow, never a modal — and the editor must not
      // open behind it. Same contract as the personal-template limit.
      setShowLimit(true)
      return
    }
    setShowLimit(false)
    setEditing(null)
    setDialogOpen(true)
  }

  function openEdit(habit: QuitHabit) {
    setEditing(habit)
    setDialogOpen(true)
  }

  function confirmSlip() {
    if (!slipping) return
    const habit = slipping
    // The card updates optimistically, but the CLAIM waits for the write. A
    // rolled-back failure must not leave "your longest run is kept" on screen
    // next to the global error toast — this is the copy that matters most here.
    slip.mutate(habit, {
      onSuccess: () => toast.show('Day zero reset. The record of your longest run is kept.'),
      onError: () => setJustSlippedId(null),
    })
    setSlipping(null)
    setJustSlippedId(habit.id)
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
            <Sprout className="h-5 w-5" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="font-display text-xl font-semibold">Quit tracker</h2>
            <p className="text-sm text-text-muted">
              Count the days since you stopped — and what you do instead.
            </p>
          </div>
          {available && (
            <Button onClick={openAdd} className="shrink-0">
              <Plus className="h-4 w-4" aria-hidden /> Add habit
            </Button>
          )}
        </div>
      </header>

      <SupportNote />

      {showLimit && !canCreate && <QuitLimitUpsell limit={FREE_QUIT_HABITS} />}

      {justSlipped && (
        <AfterSlipCard
          habit={justSlipped}
          onDismiss={() => setJustSlippedId(null)}
          onAddReplacement={() => {
            setJustSlippedId(null)
            openEdit(justSlipped)
          }}
        />
      )}

      {!available ? (
        <NotSwitchedOnCard />
      ) : isPending ? (
        <div className="space-y-3">
          {Array.from({ length: 2 }).map((_, i) => (
            <div
              key={i}
              className="h-56 animate-pulse rounded-2xl border border-white/5 bg-surface-2/40"
            />
          ))}
        </div>
      ) : habits.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-4 py-14 text-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-gradient-soft text-brand">
              <Sprout className="h-6 w-6" aria-hidden />
            </span>
            <div>
              <h3 className="font-display text-lg font-semibold">Nothing being tracked yet</h3>
              <p className="mx-auto mt-1 max-w-sm text-text-muted">
                Pick something you&rsquo;re cutting out. The counter starts today, and a slip just
                starts it again — your longest run stays on the record either way.
              </p>
            </div>
            <Button onClick={openAdd}>
              <Plus className="h-4 w-4" aria-hidden /> Track your first one
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {habits.map((habit) => {
            const checkedDays = checkedDaysForHabit(checkins, habit.id)
            const todayIds = checkins
              .filter((c) => c.habit_id === habit.id && c.checked_on === today)
              .map((c) => c.id)
            const pending =
              (checkIn.isPending && checkIn.variables?.habitId === habit.id) ||
              (undoCheckIn.isPending && undoCheckIn.variables?.habitId === habit.id)
            return (
              <QuitHabitCard
                key={habit.id}
                habit={habit}
                checkedToday={checkedDays.has(today)}
                checkinStreakDays={checkinStreak(checkedDays, today)}
                checkinPending={pending}
                onCheckIn={() => checkIn.mutate({ habitId: habit.id, day: today })}
                onUndoCheckIn={() => undoCheckIn.mutate({ habitId: habit.id, ids: todayIds })}
                onSlip={() => setSlipping(habit)}
                onEdit={() => openEdit(habit)}
                onDelete={() => {
                  if (justSlippedId === habit.id) setJustSlippedId(null)
                  deleteHabit.mutate(habit.id)
                }}
              />
            )
          })}
        </div>
      )}

      <QuitHabitDialog open={dialogOpen} onClose={() => setDialogOpen(false)} habit={editing} />
      <SlipDialog
        open={!!slipping}
        onClose={() => setSlipping(null)}
        habit={slipping}
        onConfirm={confirmSlip}
      />
    </div>
  )
}

/**
 * What shows immediately AFTER a reset. The dialog offered the replacement
 * action before confirming; this is the same action still on screen once the
 * dialog is gone, because the minute after a slip is exactly when it is
 * supposed to be reachable — not buried in a card the user has to scroll to.
 *
 * If they never set one, this is the moment to ask: the prompt is an offer, not
 * a reprimand, and it is the only nudge the feature makes.
 */
function AfterSlipCard({
  habit,
  onDismiss,
  onAddReplacement,
}: {
  habit: QuitHabit
  onDismiss: () => void
  onAddReplacement: () => void
}) {
  const link = replacementLink(habit.replacement_action)

  return (
    <section
      aria-label="Day zero reset"
      className="rounded-2xl border border-brand/25 bg-brand-gradient-soft p-4"
    >
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-text-primary">
            Day zero for {habit.name}. The count starts again from here.
          </p>
          {habit.replacement_action ? (
            <>
              <p className="mt-2 text-xs font-medium text-text-muted">Do this instead</p>
              <div className="mt-0.5 flex flex-wrap items-center gap-3">
                <p className="text-sm font-medium text-text-primary">{habit.replacement_action}</p>
                {link && (
                  <Link
                    to={link}
                    className="focus-ring inline-flex items-center gap-1 rounded-lg text-xs text-accent underline-offset-4 hover:underline"
                  >
                    Do it now
                    <ArrowRight className="h-3 w-3" aria-hidden />
                  </Link>
                )}
              </div>
            </>
          ) : (
            <div className="mt-2">
              <p className="text-xs leading-relaxed text-text-muted">
                You haven&rsquo;t set a do-this-instead yet. Having one specific, easy action ready
                tends to work better than willpower alone.
              </p>
              <Button variant="secondary" size="sm" className="mt-2" onClick={onAddReplacement}>
                Add one now
              </Button>
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss"
          className="focus-ring shrink-0 rounded-lg p-1.5 text-text-muted transition-colors hover:text-text-primary"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      </div>
    </section>
  )
}

/**
 * The honest state when `quit_habits` does not exist yet. The migration ships
 * committed but unapplied (CLAUDE.md §7), so this is what the page shows until
 * `supabase db push` runs — an explanation rather than an Add button that could
 * only ever fail. It disappears by itself the moment the table exists.
 */
function NotSwitchedOnCard() {
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
        <h3 className="font-display text-lg font-semibold">Not switched on yet</h3>
        <p className="mx-auto max-w-md text-sm leading-relaxed text-text-muted">
          The quit tracker is built and waiting on its database migration. Nothing is missing from
          your account and nothing has been lost — this page will simply start working once the
          migration is applied.
        </p>
      </CardContent>
    </Card>
  )
}
