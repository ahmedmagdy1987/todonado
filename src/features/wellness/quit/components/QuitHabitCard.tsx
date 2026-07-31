import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, Award, Check, Pencil, RotateCcw, Share2, Trash2 } from 'lucide-react'
import { Badge, Button, Card, CardContent, Modal } from '@/components/ui'
import { ShareCardDialog } from '@/features/share/ShareCardDialog'
import { usePrefs } from '@/features/settings/prefs'
import { FEATURES } from '@/lib/config'
import { cn } from '@/lib/utils'
import type { QuitHabit } from '@/types/database'
import {
  bestStreak,
  cleanDays,
  cleanDaysLabel,
  cleanElapsed,
  daysToNextMilestone,
  isMilestoneDay,
  lastMilestone,
  milestoneProgress,
  nextMilestone,
} from '../quitMath'
import { presetFor, replacementLink } from '../presets'
import { useTick } from '../useTick'

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

/**
 * One habit being broken: the live counter, the milestone track, the
 * replacement action, and the two actions that matter (check in, slipped).
 *
 * The headline number is `cleanDays` (local calendar days) while the small
 * clock under it is `cleanElapsed` (real elapsed time). They can disagree by
 * one within a day and that is intended — the milestone is a calendar fact,
 * the clock is a live one.
 */
export function QuitHabitCard({
  habit,
  checkedToday,
  checkinStreakDays,
  checkinPending,
  onCheckIn,
  onUndoCheckIn,
  onSlip,
  onEdit,
  onDelete,
}: {
  habit: QuitHabit
  checkedToday: boolean
  checkinStreakDays: number
  checkinPending: boolean
  onCheckIn: () => void
  onUndoCheckIn: () => void
  onSlip: () => void
  onEdit: () => void
  onDelete: () => void
}) {
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [shareOpen, setShareOpen] = useState(false)
  const prefs = usePrefs()
  const now = useTick(1000)

  const preset = presetFor(habit.preset_key)
  const Icon = preset.icon
  const days = cleanDays(habit.quit_started_at, now)
  const elapsed = cleanElapsed(habit.quit_started_at, now)
  const best = bestStreak(habit.quit_started_at, habit.longest_streak_days, now)
  const next = nextMilestone(days)
  const toNext = daysToNextMilestone(days)
  const reached = lastMilestone(days)
  const onMilestone = isMilestoneDay(days)
  const progress = milestoneProgress(days)
  const link = replacementLink(habit.replacement_action)

  return (
    <Card>
      <CardContent className="space-y-5">
        {/* ---- header ---------------------------------------------------- */}
        <div className="flex items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-brand-gradient-soft text-brand">
            <Icon className="h-5 w-5" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="font-display text-base font-semibold">{habit.name}</h3>
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              {best > 0 && (
                <Badge variant="outline">
                  <Award className="h-3 w-3" aria-hidden />
                  Best {best}d
                </Badge>
              )}
              {checkinStreakDays > 1 && (
                <Badge variant="default">{checkinStreakDays} check-ins in a row</Badge>
              )}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={onEdit}
              aria-label={`Edit ${habit.name}`}
              className="focus-ring rounded-lg p-2 text-text-muted transition-colors hover:text-text-primary"
            >
              <Pencil className="h-4 w-4" aria-hidden />
            </button>
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              aria-label={`Stop tracking ${habit.name}`}
              className="focus-ring rounded-lg p-2 text-text-muted transition-colors hover:text-danger"
            >
              <Trash2 className="h-4 w-4" aria-hidden />
            </button>
          </div>
        </div>

        {/* ---- the count -------------------------------------------------- */}
        <div>
          <p
            className={cn(
              'font-display text-3xl font-semibold',
              days > 0 ? 'text-gradient-brand' : 'text-text-primary',
            )}
          >
            {cleanDaysLabel(days)}
          </p>
          <p className="mt-1 font-mono text-xs text-text-muted" aria-live="off">
            {elapsed.days}d {pad(elapsed.hours)}h {pad(elapsed.minutes)}m {pad(elapsed.seconds)}s
          </p>
        </div>

        {/* ---- milestone track -------------------------------------------- */}
        {onMilestone && reached !== null && prefs.celebrations ? (
          <div className="rounded-xl border border-success/25 bg-success/10 p-3">
            <p className="text-sm font-medium text-success">
              {reached === 1 ? 'One full day.' : `${reached} days.`} That&rsquo;s a milestone.
            </p>
            <p className="mt-0.5 text-xs text-text-muted">
              Nothing to claim and nothing to share unless you want to. It just counted.
            </p>
            {/* Sharing is offered, never nudged, and the card carries the NUMBER
                only — never which habit it was. See shareCard.ts. */}
            {FEATURES.shareCards && (
              <Button
                variant="secondary"
                size="sm"
                className="mt-2"
                onClick={() => setShareOpen(true)}
              >
                <Share2 className="h-4 w-4" aria-hidden />
                Make a card
              </Button>
            )}
          </div>
        ) : next !== null ? (
          <div>
            <div className="mb-1.5 flex items-center justify-between text-xs text-text-muted">
              <span>Next milestone</span>
              <span className="font-mono">
                {toNext} {toNext === 1 ? 'day' : 'days'} to {next}
              </span>
            </div>
            <div
              className="h-1.5 overflow-hidden rounded-full bg-surface-2"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(progress * 100)}
              aria-label={`Progress to the ${next}-day milestone`}
            >
              <div
                className="h-full rounded-full bg-brand-gradient transition-[width] duration-500"
                style={{ width: `${Math.round(progress * 100)}%` }}
              />
            </div>
          </div>
        ) : (
          <p className="text-xs text-text-muted">
            Every milestone is behind you. The counter just keeps going.
          </p>
        )}

        {/* ---- replacement action ----------------------------------------- */}
        {habit.replacement_action && (
          <div className="rounded-xl border border-brand/25 bg-brand-gradient-soft p-3">
            <p className="text-xs font-medium text-text-muted">Instead, you do</p>
            <div className="mt-0.5 flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-medium text-text-primary">{habit.replacement_action}</p>
              {link && (
                <Link
                  to={link}
                  className="focus-ring inline-flex shrink-0 items-center gap-1 rounded-lg text-xs text-accent underline-offset-4 hover:underline"
                >
                  Do it now
                  <ArrowRight className="h-3 w-3" aria-hidden />
                </Link>
              )}
            </div>
          </div>
        )}

        {habit.notes && <p className="text-xs leading-relaxed text-text-muted">{habit.notes}</p>}

        {/* ---- actions ----------------------------------------------------- */}
        <div className="flex flex-wrap gap-2">
          {checkedToday ? (
            <Button
              variant="secondary"
              size="sm"
              onClick={onUndoCheckIn}
              disabled={checkinPending}
              className="text-success"
            >
              <Check className="h-4 w-4" aria-hidden />
              Checked in today
            </Button>
          ) : (
            <Button variant="secondary" size="sm" onClick={onCheckIn} disabled={checkinPending}>
              <Check className="h-4 w-4" aria-hidden />
              Still clean today
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={onSlip}>
            <RotateCcw className="h-4 w-4" aria-hidden />
            I slipped
          </Button>
        </div>
      </CardContent>

      <Modal
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title={`Stop tracking ${habit.name}?`}
      >
        <div className="space-y-4 p-5">
          <p className="text-sm text-text-muted">
            This removes the habit, its check-ins and its longest-streak record. It can&rsquo;t be
            undone. Quitting the tracker isn&rsquo;t quitting the habit. You can start again any
            time.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setConfirmDelete(false)}>
              Keep it
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                setConfirmDelete(false)
                onDelete()
              }}
            >
              Stop tracking
            </Button>
          </div>
        </div>
      </Modal>

      {FEATURES.shareCards && (
        // `days`, and deliberately not `habit.name` — the habit's name is the one
        // thing somebody would be mortified to post, so it is never passed in.
        <ShareCardDialog
          open={shareOpen}
          onClose={() => setShareOpen(false)}
          kind="quit"
          days={days}
        />
      )}
    </Card>
  )
}
