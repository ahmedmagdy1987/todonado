import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Check, Flag, Share2, Sparkles, X } from 'lucide-react'
import { Badge, Button, Card, CardContent } from '@/components/ui'
import { useAuth } from '@/features/auth/auth-context'
import { usePlan } from '@/features/billing/usePlan'
import { useWorkspace } from '@/features/workspace/workspace-context'
import { useTasks } from '@/features/tasks/api/useTasks'
import { useFocusSessions } from '@/features/focus/api/useFocusSessions'
import { useQuitHabits } from '@/features/wellness/quit/api/useQuit'
import { ShareCardDialog } from '@/features/share/ShareCardDialog'
import { captureUpgradeIntent } from '@/features/marketing/api/upgradeIntents'
import { FEATURES, FREE_ACTIVE_CHALLENGES } from '@/lib/config'
import { todayISO } from '@/lib/date'
import { cn } from '@/lib/utils'
import type { UserChallenge } from '@/types/database'
import {
  type Challenge,
  type ChallengeData,
  type ChallengePhase,
  type ChallengeProgress,
  canJoinChallenge,
  challengeFor,
  challengeProgress,
  challengeTerms,
  daysLeft,
  offerableChallenges,
  phaseOf,
  progressLabel,
} from './challenges'
import { useChallengeMutations, useUserChallenges } from './api/useChallenges'
import { useJournalEntries } from '@/features/journal/api/useJournal'

/**
 * Challenges — a structured push you opt into, and nothing you are opted into.
 *
 * EVERY NUMBER ON THIS PAGE IS DERIVED. The rows fetched here say only which
 * challenges were joined and when; the bars are recomputed from the task, focus,
 * quit and journal caches that are already loaded. That is why joining a
 * challenge changes nothing about how the rest of the app records your work, and
 * why leaving one loses nothing.
 *
 * NON-SHAMING BY CONSTRUCTION: days that have not happened are not counted as
 * missed, a window that runs out says "ended" and offers a restart, and there is
 * no streak to break, no leaderboard, and no notification when you slip.
 */
export function ChallengesPage() {
  const { user } = useAuth()
  const userId = user?.id ?? ''
  const { isPro } = usePlan()
  // `capacityMinutes` already resolves the profile value or the default, so the
  // capacity challenge and the Today meter can never disagree about what "fits".
  const { workspaceId, profile, capacityMinutes } = useWorkspace()

  const { data: tasks = [] } = useTasks(workspaceId)
  const { data: sessions = [] } = useFocusSessions(workspaceId)
  const { data: quit } = useQuitHabits(userId)

  const { data, isPending } = useUserChallenges(userId)
  const { join, complete, leave } = useChallengeMutations(userId)

  const rows = useMemo(() => data?.rows ?? [], [data])
  /** False ONLY when the table is absent (migration pending). */
  const available = data?.available ?? true
  const today = todayISO()

  const [showLimit, setShowLimit] = useState(false)
  const [sharing, setSharing] = useState<Challenge | null>(null)

  const quitHabits = useMemo(() => quit?.rows ?? [], [quit])
  // `offerableChallenges` hides a challenge whose source does not exist rather
  // than showing it locked, because a locked card reads as a nag. An unmigrated
  // or switched-off journal therefore simply removes `journal_7` from the list.
  const journal = useJournalSource()

  const challengeData: ChallengeData = useMemo(
    () => ({
      tasks,
      sessions,
      quitHabits,
      journalDays: journal.days,
      capacityMinutes,
    }),
    [tasks, sessions, quitHabits, journal.days, capacityMinutes],
  )

  /** Every joined row, resolved against the catalog and scored. */
  const attempts = useMemo(
    () =>
      rows
        .map((row) => {
          const challenge = challengeFor(row.challenge_key)
          if (!challenge) return null
          const progress = challengeProgress(challenge, row.started_at, challengeData, today)
          return { row, challenge, progress, phase: phaseOf(row, challenge, progress, today) }
        })
        .filter((a): a is Attempt => a !== null),
    [rows, challengeData, today],
  )

  const activeCount = attempts.filter((a) => a.phase === 'active').length
  const canJoin = canJoinChallenge(activeCount + (join.isPending ? 1 : 0), isPro, FREE_ACTIVE_CHALLENGES)

  /**
   * Write the outcome once, when the derived number first reaches the target.
   *
   * This is the ONE place a challenge writes anything beyond joining, and it
   * writes the fact of finishing rather than the progress that got there — so
   * the row can never disagree with the tasks behind it. `complete` additionally
   * filters on `status = 'active'`, so a second render, a retry or another tab
   * cannot rewrite a completed_at that already stands.
   */
  useEffect(() => {
    for (const a of attempts) {
      if (a.progress.done && a.row.status === 'active' && !complete.isPending) {
        complete.mutate(a.row.id)
        break
      }
    }
  }, [attempts, complete])

  const joinedKeys = new Set(
    attempts.filter((a) => a.phase === 'active' || a.phase === 'done').map((a) => a.challenge.key),
  )
  const offerable = offerableChallenges({
    hasQuitHabit: quitHabits.length > 0,
    journalAvailable: journal.available,
  })
  const openToJoin = offerable.filter((c) => !joinedKeys.has(c.key))

  function start(challenge: Challenge) {
    if (!canJoin) {
      setShowLimit(true)
      return
    }
    setShowLimit(false)
    join.mutate({ challengeKey: challenge.key, startDay: today })
  }

  const running = attempts.filter((a) => a.phase === 'active')
  const finished = attempts.filter((a) => a.phase === 'done')
  const ended = attempts.filter((a) => a.phase === 'ended')

  return (
    <div className="animate-fade-in space-y-8">
      <header className="flex items-center gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-brand-gradient-soft text-brand">
          <Flag className="h-5 w-5" aria-hidden />
        </span>
        <div className="min-w-0">
          <h2 className="font-display text-xl font-semibold">Challenges</h2>
          <p className="text-sm text-text-muted">
            A short, structured push — counted from the work you were already doing.
          </p>
        </div>
      </header>

      {showLimit && !canJoin && <ChallengeLimitUpsell limit={FREE_ACTIVE_CHALLENGES} />}

      {!available ? (
        <NotSwitchedOnCard />
      ) : isPending ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-36 animate-pulse rounded-2xl border border-white/5 bg-surface-2/40" />
          ))}
        </div>
      ) : (
        <>
          {running.length > 0 && (
            <section aria-labelledby="ch-running" className="space-y-3">
              <h3 id="ch-running" className="font-display text-sm font-semibold text-text-muted">
                In progress
              </h3>
              <div className="grid gap-4 sm:grid-cols-2">
                {running.map((a) => (
                  <AttemptCard key={a.row.id} attempt={a} today={today} onLeave={() => leave.mutate(a.row.id)} />
                ))}
              </div>
            </section>
          )}

          {finished.length > 0 && (
            <section aria-labelledby="ch-done" className="space-y-3">
              <h3 id="ch-done" className="font-display text-sm font-semibold text-text-muted">
                Done
              </h3>
              <div className="grid gap-4 sm:grid-cols-2">
                {finished.map((a) => (
                  <AttemptCard
                    key={a.row.id}
                    attempt={a}
                    today={today}
                    onShare={FEATURES.shareCards ? () => setSharing(a.challenge) : undefined}
                    onLeave={() => leave.mutate(a.row.id)}
                  />
                ))}
              </div>
            </section>
          )}

          {ended.length > 0 && (
            <section aria-labelledby="ch-ended" className="space-y-3">
              <h3 id="ch-ended" className="font-display text-sm font-semibold text-text-muted">
                Ended
              </h3>
              <div className="grid gap-4 sm:grid-cols-2">
                {ended.map((a) => (
                  <AttemptCard
                    key={a.row.id}
                    attempt={a}
                    today={today}
                    onRestart={() => {
                      leave.mutate(a.row.id)
                      start(a.challenge)
                    }}
                    onLeave={() => leave.mutate(a.row.id)}
                  />
                ))}
              </div>
            </section>
          )}

          <section aria-labelledby="ch-open" className="space-y-3">
            <h3 id="ch-open" className="font-display text-sm font-semibold text-text-muted">
              {attempts.length === 0 ? 'Pick one' : 'More to try'}
            </h3>
            {openToJoin.length === 0 ? (
              <Card>
                <CardContent className="py-10 text-center text-sm text-text-muted">
                  That&rsquo;s all of them for now — you&rsquo;re either in or done with every
                  challenge that fits your setup.
                </CardContent>
              </Card>
            ) : (
              <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {openToJoin.map((c) => (
                  <li key={c.key}>
                    <OfferCard challenge={c} onStart={() => start(c)} busy={join.isPending} />
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}

      <ShareCardDialog
        open={!!sharing}
        onClose={() => setSharing(null)}
        kind="challenge"
        days={sharing?.durationDays ?? 0}
        name={profile?.full_name ?? null}
      />
    </div>
  )
}

/**
 * The journal's contribution to challenge progress, behind one seam.
 *
 * It is a hook rather than an inline read so the journal stage has exactly one
 * place to wire, and so this page never has to care whether the journal feature
 * is switched off, unmigrated, or simply empty — all three arrive here as
 * "no source", and `offerableChallenges` then hides `journal_7` entirely.
 */
function useJournalSource(): { days: string[]; available: boolean } {
  const { user } = useAuth()
  const { data } = useJournalEntries(user?.id ?? '')
  // Hooks first, then the flag — an early return above `useJournalEntries` would
  // change the hook order when the flag is flipped.
  if (!FEATURES.journal) return NO_JOURNAL
  return { days: (data?.rows ?? []).map((e) => e.entry_date), available: data?.available ?? false }
}

const NO_JOURNAL = { days: [] as string[], available: false }

interface Attempt {
  row: UserChallenge
  challenge: Challenge
  progress: ChallengeProgress
  phase: ChallengePhase
}

function AttemptCard({
  attempt,
  today,
  onShare,
  onRestart,
  onLeave,
}: {
  attempt: Attempt
  today: string
  onShare?: () => void
  onRestart?: () => void
  onLeave: () => void
}) {
  const { challenge, progress, phase, row } = attempt
  const Icon = challenge.icon
  const left = daysLeft(row.started_at, challenge.durationDays, today)

  return (
    <div className="flex h-full flex-col gap-3 rounded-2xl border border-white/5 bg-surface/60 p-5">
      <div className="flex items-start gap-3">
        <span
          className={cn(
            'inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl',
            phase === 'done' ? 'bg-success/15 text-success' : 'bg-brand-gradient-soft text-brand',
          )}
        >
          {phase === 'done' ? <Check className="h-5 w-5" aria-hidden /> : <Icon className="h-5 w-5" aria-hidden />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-display text-base font-semibold">{challenge.title}</p>
          <p className="mt-0.5 text-xs leading-relaxed text-text-muted">{challenge.goal}</p>
        </div>
        <button
          type="button"
          onClick={onLeave}
          aria-label={`Leave ${challenge.title}`}
          className="tap-44 focus-ring -mr-1 -mt-1 rounded-lg p-1.5 text-text-muted hover:text-danger"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      </div>

      <div className="space-y-1.5">
        <div
          className="h-2 w-full overflow-hidden rounded-full bg-surface-2"
          role="img"
          aria-label={`${progressLabel(progress, challenge.unit)}`}
        >
          <div
            className={cn(
              'h-full rounded-full transition-[width] duration-500 ease-out',
              phase === 'done' ? 'bg-success' : 'bg-brand-gradient',
            )}
            style={{ width: `${Math.round(progress.ratio * 100)}%` }}
          />
        </div>
        <div className="flex items-baseline justify-between gap-2">
          <span className="font-mono text-xs tabular-nums text-text-muted">
            {progressLabel(progress, challenge.unit)}
          </span>
          {phase === 'active' && (
            <span className="font-mono text-[11px] text-text-muted/70">
              {left === 0 ? 'last day' : `${left} ${left === 1 ? 'day' : 'days'} left`}
            </span>
          )}
          {phase === 'done' && <Badge variant="outline">Done</Badge>}
        </div>
      </div>

      {phase === 'ended' && (
        <p className="text-xs leading-relaxed text-text-muted">
          {/* Not "failed". The window closed; that is all that happened. */}
          The {challenge.durationDays} days are up. Nothing is lost — everything you did still
          counts everywhere else in the app.
        </p>
      )}

      <div className="mt-auto flex flex-wrap gap-2 pt-1">
        {onShare && (
          <Button
            size="sm"
            variant="outline"
            onClick={onShare}
            aria-label={`Share ${challenge.title}`}
          >
            <Share2 className="h-4 w-4" aria-hidden /> Share
          </Button>
        )}
        {onRestart && (
          <Button
            size="sm"
            variant="secondary"
            onClick={onRestart}
            aria-label={`Start ${challenge.title} again`}
          >
            Start it again
          </Button>
        )}
      </div>
    </div>
  )
}

function OfferCard({
  challenge,
  onStart,
  busy,
}: {
  challenge: Challenge
  onStart: () => void
  busy: boolean
}) {
  const Icon = challenge.icon
  return (
    <div className="flex h-full flex-col gap-3 rounded-2xl border border-white/5 bg-surface/40 p-5 transition-colors hover:border-brand/25">
      <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-brand-gradient-soft text-brand">
        <Icon className="h-5 w-5" aria-hidden />
      </span>
      <div className="min-w-0">
        <p className="font-display text-base font-semibold">{challenge.title}</p>
        <p className="mt-0.5 text-xs leading-relaxed text-text-muted">{challenge.goal}</p>
      </div>
      <p className="font-mono text-xs text-text-muted">{challengeTerms(challenge)}</p>
      {/* The label names the challenge. A page of nine buttons all called "Join"
          is unusable with a screen reader, and it is exactly as ambiguous for a
          test — which is how this was caught. */}
      <Button
        size="sm"
        className="mt-auto w-full"
        onClick={onStart}
        disabled={busy}
        aria-label={`Join ${challenge.title}`}
      >
        Join
      </Button>
    </div>
  )
}

function ChallengeLimitUpsell({ limit }: { limit: number }) {
  const { user } = useAuth()

  function recordIntent() {
    void captureUpgradeIntent({
      tier: 'pro',
      userId: user?.id ?? null,
      email: user?.email ?? null,
      source: 'challenge_limit',
    }).catch(() => {
      /* signal only — never block the click */
    })
  }

  return (
    <div
      role="note"
      aria-label="Challenge limit reached"
      className="rounded-2xl border border-brand/25 bg-brand-gradient-soft p-4"
    >
      <div className="flex items-start gap-3">
        <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-surface-2 text-brand">
          <Sparkles className="h-4 w-4" aria-hidden />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-medium text-text-primary">
            {limit === 1 ? 'One at a time on Free' : `${limit} at a time on Free`} — Pro runs as many
            as you like
          </p>
          <p className="mt-1 text-xs leading-relaxed text-text-muted">
            Only challenges still running count toward this; finished and ended ones never block a
            new one.{' '}
            <Link
              to="/settings/plan"
              onClick={recordIntent}
              className="focus-ring rounded text-accent underline-offset-4 hover:underline"
            >
              Upgrade
            </Link>{' '}
            to stack them.
          </p>
        </div>
      </div>
    </div>
  )
}

/** The honest state when `user_challenges` does not exist yet. */
function NotSwitchedOnCard() {
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
        <h3 className="font-display text-lg font-semibold">Not switched on yet</h3>
        <p className="mx-auto max-w-md text-sm leading-relaxed text-text-muted">
          Challenges are built and waiting on a database migration. Nothing is missing from your
          account — this page will start working the moment it is applied.
        </p>
      </CardContent>
    </Card>
  )
}
