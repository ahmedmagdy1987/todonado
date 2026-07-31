import { parseISO } from 'date-fns'
import {
  BarChart3,
  CalendarCheck,
  CalendarRange,
  Gauge,
  NotebookPen,
  Ruler,
  Sprout,
  Timer,
  Hourglass,
  ListChecks,
  type LucideIcon,
} from 'lucide-react'
import { isoDateOffset } from '@/lib/date'
import type { FocusSession, QuitHabit, Task, UserChallenge } from '@/types/database'

/**
 * Challenges — pure logic. No React, no I/O — unit-tested.
 *
 * ── THE ONE RULE ─────────────────────────────────────────────────────────────
 * PROGRESS IS DERIVED, NEVER STORED. Every number below is recomputed on render
 * from rows the app already has: tasks, focus sessions, quit habits and journal
 * entries. There is no progress column, no counter to increment, and no daily
 * job — exactly like the planning streak and the points score.
 *
 * That is not just tidiness. A stored counter would drift the moment a task was
 * un-completed or a date corrected, and the only way back would be a repair
 * script. Derived progress has nothing to drift from: undo the task and the bar
 * moves back, because the bar was never anything but a view of the tasks.
 *
 * ── WHAT A CHALLENGE MAY MEASURE ─────────────────────────────────────────────
 * Only data that already exists. That constraint is what keeps this feature from
 * growing tracking machinery of its own, and it is why there is no "meditate 10
 * times" challenge: breathwork is deliberately device-local with no table, so
 * counting it would mean inventing exactly the machinery this avoids.
 */

export type ChallengeKey =
  | 'plan_7'
  | 'streak_14'
  | 'capacity_7'
  | 'estimate_7'
  | 'tasks_50'
  | 'focus_10'
  | 'focus_minutes_300'
  | 'focus_days_5'
  | 'quit_30'
  | 'journal_7'

/** Which existing dataset a challenge reads. Drives what can even be offered. */
export type ChallengeSource = 'tasks' | 'focus' | 'quit' | 'journal'

export interface Challenge {
  key: ChallengeKey
  title: string
  /** One line. What "done" means, in the user's terms. */
  goal: string
  /** The window, in whole local days from the day it was joined. */
  durationDays: number
  target: number
  /** Plural noun for the target, e.g. "tasks". */
  unit: string
  icon: LucideIcon
  source: ChallengeSource
}

/**
 * The catalog. Content, not configuration — it will grow, which is exactly why
 * `challenge_key` has no CHECK constraint in the migration.
 *
 * Every one of these spans something that already ships. None is aspirational,
 * and none needs a new column.
 */
export const CHALLENGES: readonly Challenge[] = [
  {
    key: 'plan_7',
    title: 'Seven days of showing up',
    goal: 'Plan or finish something every day for a week.',
    durationDays: 7,
    target: 7,
    unit: 'days',
    icon: CalendarCheck,
    source: 'tasks',
  },
  {
    key: 'streak_14',
    title: 'A fortnight of it',
    goal: 'The same again, for two weeks straight.',
    durationDays: 14,
    target: 14,
    unit: 'days',
    icon: CalendarRange,
    source: 'tasks',
  },
  {
    key: 'capacity_7',
    title: 'A week inside your capacity',
    goal: 'Seven planned days that each fit the time you actually have.',
    durationDays: 7,
    target: 7,
    unit: 'days',
    icon: Gauge,
    source: 'tasks',
  },
  {
    key: 'estimate_7',
    title: 'Estimate everything',
    goal: 'Seven days where every task you planned carried an estimate.',
    durationDays: 7,
    target: 7,
    unit: 'days',
    icon: Ruler,
    source: 'tasks',
  },
  {
    key: 'tasks_50',
    title: 'Fifty finished',
    goal: 'Complete 50 tasks within a month.',
    durationDays: 30,
    target: 50,
    unit: 'tasks',
    icon: ListChecks,
    source: 'tasks',
  },
  {
    key: 'focus_10',
    title: 'Ten focus sessions',
    goal: 'Ten finished sessions in a week — pomodoros count.',
    durationDays: 7,
    target: 10,
    unit: 'sessions',
    icon: Timer,
    source: 'focus',
  },
  {
    key: 'focus_minutes_300',
    title: 'Five focused hours',
    goal: '300 minutes of real focus in a week.',
    durationDays: 7,
    target: 300,
    unit: 'minutes',
    icon: Hourglass,
    source: 'focus',
  },
  {
    key: 'focus_days_5',
    title: 'Focus on five days',
    goal: 'Not how long — how often. One session on five separate days.',
    durationDays: 7,
    target: 5,
    unit: 'days',
    icon: BarChart3,
    source: 'focus',
  },
  {
    key: 'quit_30',
    title: 'Thirty days clean',
    goal: 'A full month on the habit you are breaking.',
    durationDays: 30,
    target: 30,
    unit: 'days',
    icon: Sprout,
    source: 'quit',
  },
  {
    key: 'journal_7',
    title: 'Seven days written down',
    goal: 'Seven journal entries in a fortnight.',
    durationDays: 14,
    target: 7,
    unit: 'entries',
    icon: NotebookPen,
    source: 'journal',
  },
] as const

export function challengeFor(key: string): Challenge | null {
  return CHALLENGES.find((c) => c.key === key) ?? null
}

// ---------------------------------------------------------------------------
//  Windows
// ---------------------------------------------------------------------------

/** Local day key (yyyy-MM-dd) of a timestamp, or null if unparseable. */
export function localDay(ts: string | null): string | null {
  if (!ts) return null
  const d = new Date(ts)
  if (Number.isNaN(d.getTime())) return null
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** The last day an attempt started on `startDay` can still count. */
export function lastDayOf(startDay: string, durationDays: number): string {
  return isoDateOffset(durationDays - 1, parseISO(startDay))
}

/**
 * The days that count so far: from the day it was joined up to today, never past
 * the end of the window. Counting only up to TODAY is what makes a part-finished
 * challenge read as "3 of 7" rather than "3 of 7, 4 already missed" — the days
 * ahead have not been failed, they simply have not happened.
 */
export function elapsedDays(startDay: string, durationDays: number, todayStr: string): string[] {
  const days: string[] = []
  for (let i = 0; i < durationDays; i += 1) {
    const day = isoDateOffset(i, parseISO(startDay))
    if (day > todayStr) break
    days.push(day)
  }
  return days
}

// ---------------------------------------------------------------------------
//  The data a challenge may read
// ---------------------------------------------------------------------------

export interface ChallengeData {
  tasks: Task[]
  sessions: FocusSession[]
  quitHabits: QuitHabit[]
  /** Local day keys that carry a journal entry. */
  journalDays: string[]
  /** The user's daily planning capacity, for `capacity_7`. */
  capacityMinutes: number
}

export interface ChallengeProgress {
  current: number
  target: number
  /** 0–1, clamped. */
  ratio: number
  done: boolean
}

/** Days with something scheduled for them or completed on them. */
function activeDays(tasks: Task[]): Set<string> {
  const days = new Set<string>()
  for (const t of tasks) {
    if (t.scheduled_for) days.add(t.scheduled_for)
    if (t.status === 'done') {
      const d = localDay(t.completed_at)
      if (d) days.add(d)
    }
  }
  return days
}

/** Minutes of work scheduled onto each day, from the CURRENT plan. */
function plannedMinutesByDay(tasks: Task[]): Map<string, number> {
  const map = new Map<string, number>()
  for (const t of tasks) {
    if (!t.scheduled_for) continue
    map.set(t.scheduled_for, (map.get(t.scheduled_for) ?? 0) + (t.effort_minutes ?? 0))
  }
  return map
}

/**
 * The current clean run's day zero, across every tracked habit — the EARLIEST,
 * i.e. the longest run still going. With several habits the alternative would be
 * to pick one arbitrarily or to demand the user nominate one at join time, and
 * neither is worth a dialog for a number that is meant to be encouraging.
 *
 * A slip moves this forward, so days before the new day zero stop counting.
 * That is correct and it is not a punishment: the challenge is thirty days
 * clean, and it can be restarted the same afternoon.
 */
function cleanSince(habits: QuitHabit[]): string | null {
  let earliest: string | null = null
  for (const h of habits) {
    const day = localDay(h.quit_started_at)
    if (!day) continue
    if (!earliest || day < earliest) earliest = day
  }
  return earliest
}

/**
 * Progress for one attempt. Pure: same inputs, same answer, every render.
 *
 * Each metric is a couple of lines because each reads data that already exists
 * in exactly the shape it needs. That is the point — anything that needed a new
 * column would not be in the catalog.
 */
export function challengeProgress(
  challenge: Challenge,
  startDay: string,
  data: ChallengeData,
  todayStr: string,
): ChallengeProgress {
  const days = elapsedDays(startDay, challenge.durationDays, todayStr)
  const inWindow = new Set(days)
  let current = 0

  switch (challenge.key) {
    case 'plan_7':
    case 'streak_14': {
      const active = activeDays(data.tasks)
      current = days.filter((d) => active.has(d)).length
      break
    }
    case 'capacity_7': {
      // A day counts when work was planned AND it fitted. An empty day is not a
      // win here — "inside your capacity" has to mean you planned something.
      const planned = plannedMinutesByDay(data.tasks)
      current = days.filter((d) => {
        const minutes = planned.get(d) ?? 0
        return minutes > 0 && minutes <= data.capacityMinutes
      }).length
      break
    }
    case 'estimate_7': {
      // Every task touching the day must carry an estimate. A day with no tasks
      // cannot count — otherwise doing nothing would score.
      const byDay = new Map<string, Task[]>()
      for (const t of data.tasks) {
        const keys = new Set<string>()
        if (t.scheduled_for) keys.add(t.scheduled_for)
        if (t.status === 'done') {
          const d = localDay(t.completed_at)
          if (d) keys.add(d)
        }
        for (const k of keys) {
          if (!inWindow.has(k)) continue
          const list = byDay.get(k) ?? []
          list.push(t)
          byDay.set(k, list)
        }
      }
      current = days.filter((d) => {
        const list = byDay.get(d) ?? []
        return list.length > 0 && list.every((t) => (t.effort_minutes ?? 0) > 0)
      }).length
      break
    }
    case 'tasks_50': {
      current = data.tasks.filter((t) => {
        if (t.status !== 'done') return false
        const d = localDay(t.completed_at)
        return !!d && inWindow.has(d)
      }).length
      break
    }
    case 'focus_10': {
      current = data.sessions.filter((s) => {
        if (s.status !== 'completed') return false
        const d = localDay(s.started_at)
        return !!d && inWindow.has(d)
      }).length
      break
    }
    case 'focus_minutes_300': {
      let seconds = 0
      for (const s of data.sessions) {
        if (s.status !== 'completed') continue
        const d = localDay(s.started_at)
        if (!d || !inWindow.has(d)) continue
        seconds += s.actual_seconds
      }
      current = Math.floor(seconds / 60)
      break
    }
    case 'focus_days_5': {
      const hit = new Set<string>()
      for (const s of data.sessions) {
        if (s.status !== 'completed') continue
        const d = localDay(s.started_at)
        if (d && inWindow.has(d)) hit.add(d)
      }
      current = hit.size
      break
    }
    case 'quit_30': {
      const since = cleanSince(data.quitHabits)
      current = since ? days.filter((d) => d >= since).length : 0
      break
    }
    case 'journal_7': {
      const written = new Set(data.journalDays)
      current = days.filter((d) => written.has(d)).length
      break
    }
    default:
      current = 0
  }

  const capped = Math.min(current, challenge.target)
  return {
    current: capped,
    target: challenge.target,
    ratio: challenge.target > 0 ? Math.min(1, Math.max(0, capped / challenge.target)) : 0,
    done: capped >= challenge.target,
  }
}

// ---------------------------------------------------------------------------
//  Attempt state
// ---------------------------------------------------------------------------

/**
 * `active`   — running, inside its window.
 * `done`     — the target was reached.
 * `ended`    — the window passed without reaching it.
 * `left`     — the user chose to stop.
 *
 * NOTE WHAT IS ABSENT: "failed". A window that runs out is `ended`, the copy
 * says so plainly, and the only thing offered is to start again. The row is
 * never rewritten to say abandoned just because time passed — that would be the
 * app forming an opinion about a quiet fortnight.
 */
export type ChallengePhase = 'active' | 'done' | 'ended' | 'left'

export function phaseOf(
  row: Pick<UserChallenge, 'status' | 'started_at'>,
  challenge: Challenge,
  progress: ChallengeProgress,
  todayStr: string,
): ChallengePhase {
  if (row.status === 'abandoned') return 'left'
  if (row.status === 'completed' || progress.done) return 'done'
  return todayStr > lastDayOf(row.started_at, challenge.durationDays) ? 'ended' : 'active'
}

/** Days left in the window, floored at 0. */
export function daysLeft(startDay: string, durationDays: number, todayStr: string): number {
  const elapsed = elapsedDays(startDay, durationDays, todayStr).length
  return Math.max(0, durationDays - elapsed)
}

/**
 * Which challenges may be OFFERED right now.
 *
 * A challenge whose data source does not exist is hidden rather than shown
 * greyed-out: "30 days clean" means nothing to someone not tracking a habit, and
 * a locked card would read as a nag to start one. It reappears by itself the
 * moment there is something to count.
 */
export function offerableChallenges(opts: {
  hasQuitHabit: boolean
  journalAvailable: boolean
}): Challenge[] {
  return CHALLENGES.filter((c) => {
    if (c.source === 'quit') return opts.hasQuitHabit
    if (c.source === 'journal') return opts.journalAvailable
    return true
  })
}

/**
 * May this user start ANOTHER challenge?
 *
 * Unlike the app's other caps this one is about attention, not storage: someone
 * running six at once is not really doing any of them. Only genuinely RUNNING
 * attempts count — a finished or lapsed one never blocks starting something new,
 * which is what stops the limit from feeling like a punishment for not finishing.
 */
/**
 * ARITHMETIC ONLY — not the page-facing decision.
 *
 * This answers "is the count under the limit", which is a different question
 * from "may this user create one". It cannot know whether its inputs have
 * LOADED, and a cap judged on data that has not arrived is not a cap. Pages
 * must go through capDecision() in src/features/billing/gate.ts, which has a
 * third answer for exactly that.
 */
export function canJoinChallenge(activeCount: number, isPro: boolean, limit: number): boolean {
  if (isPro) return true
  return activeCount < limit
}

/**
 * The terms, in one line: "50 tasks in 30 days", or "every day for 7 days" when
 * the target IS the window. Without the special case a day-counting challenge
 * reads "7 days · 7 days", which says the same thing twice and explains neither.
 */
export function challengeTerms(challenge: Challenge): string {
  const { durationDays, target, unit } = challenge
  if (unit === 'days' && target === durationDays) return `every day for ${durationDays} days`
  if (unit === 'days') return `${target} days out of ${durationDays}`
  return `${target} ${unit} in ${durationDays} days`
}

/** Human "3 of 7 days" / "120 of 300 minutes". */
export function progressLabel(progress: ChallengeProgress, unit: string): string {
  return `${progress.current} of ${progress.target} ${unit}`
}
