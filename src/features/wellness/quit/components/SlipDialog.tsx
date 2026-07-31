import { Link } from 'react-router-dom'
import { ArrowRight, RotateCcw } from 'lucide-react'
import { Button, Modal } from '@/components/ui'
import type { QuitHabit } from '@/types/database'
import { bestStreak, cleanDays } from '../quitMath'
import { replacementLink } from '../presets'

/**
 * The "I slipped" confirmation.
 *
 * This is the single most important piece of copy in the feature, so the rules
 * are explicit:
 *  - Name what happened without a verdict. "A slip is not a failure" is stated
 *    once, plainly, and never repeated into a lecture.
 *  - Show what is KEPT before what is reset. The longest-streak record and the
 *    days already completed are the reason a reset isn't a wipe, so they are
 *    the first thing on screen.
 *  - Put the replacement action here, prominently. This is the exact moment it
 *    exists for — the user is already in the dialog, already thinking about it.
 *  - No "are you sure?", no red destructive styling, no guilt, no streak-loss
 *    animation. The confirm button is a normal button.
 */
export function SlipDialog({
  open,
  onClose,
  habit,
  onConfirm,
}: {
  open: boolean
  onClose: () => void
  habit: QuitHabit | null
  onConfirm: () => void
}) {
  if (!habit) return null

  const completed = cleanDays(habit.quit_started_at)
  const best = bestStreak(habit.quit_started_at, habit.longest_streak_days)
  const replacement = habit.replacement_action
  const link = replacementLink(replacement)

  return (
    <Modal open={open} onClose={onClose} title="Reset day zero">
      <div className="space-y-5 p-5">
        <p className="text-sm leading-relaxed text-text-primary">
          A slip is not a failure. It&rsquo;s information. Starting the count again is the whole
          point of keeping one.
        </p>

        <div className="rounded-xl border border-white/10 bg-surface-2/40 p-4">
          <p className="text-xs font-medium text-text-muted">What you keep</p>
          <div className="mt-2 flex flex-wrap gap-x-6 gap-y-2">
            <div>
              <p className="font-mono text-lg font-semibold text-text-primary">{completed}</p>
              <p className="text-xs text-text-muted">
                {completed === 1 ? 'day you just did' : 'days you just did'}
              </p>
            </div>
            <div>
              <p className="font-mono text-lg font-semibold text-success">{best}</p>
              <p className="text-xs text-text-muted">longest run, kept on record</p>
            </div>
          </div>
        </div>

        {replacement && (
          <div className="rounded-xl border border-brand/25 bg-brand-gradient-soft p-4">
            <p className="text-xs font-medium text-text-muted">Your do-this-instead</p>
            <p className="mt-1 text-sm font-medium text-text-primary">{replacement}</p>
            {link && (
              <Link
                to={link}
                onClick={onClose}
                className="focus-ring mt-2 inline-flex items-center gap-1.5 rounded-lg text-sm text-accent underline-offset-4 hover:underline"
              >
                Do it now
                <ArrowRight className="h-3.5 w-3.5" aria-hidden />
              </Link>
            )}
          </div>
        )}

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="ghost" onClick={onClose}>
            Not now
          </Button>
          <Button variant="secondary" onClick={onConfirm}>
            <RotateCcw className="h-4 w-4" aria-hidden />
            Reset day zero
          </Button>
        </div>
      </div>
    </Modal>
  )
}
