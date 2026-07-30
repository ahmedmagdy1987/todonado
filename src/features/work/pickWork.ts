import type { Task } from '@/types/database'
import { isBeforeDay, isSameDay } from '@/lib/date'

/**
 * "What should I work on right now?" — pure, no I/O, unit-tested.
 *
 * This is a RANKING, not a new planner. It deliberately does not schedule
 * anything, move anything or write anything: `planDay` owns deciding what fits
 * in a day, and this only answers which of the things already in front of you to
 * open first. So it can be wrong without consequence — the user can always pick
 * something else, which is why the picker returns the whole ordered list too.
 *
 * THE ORDER, AND WHY:
 *  1. Something already IN PROGRESS. Finishing beats starting; if you left
 *     something half-done, that is the thing.
 *  2. OVERDUE work. It is already late, and the app's whole recovery posture is
 *     to surface it rather than let it rot.
 *  3. Scheduled for TODAY. You already committed to it this morning.
 *  4. Anything else open (the backlog) — better than an empty screen.
 *
 * Inside a bucket the tie-break is the repo's existing candidate order —
 * priority, then due date, then effort, then the user's own drag position — the
 * same sequence `planWeek` uses, so two surfaces cannot disagree about which
 * task is "first".
 */

export type WorkReason = 'in_progress' | 'overdue' | 'today' | 'backlog'

export interface WorkPick {
  /** The single best thing to open, or null when there is nothing open at all. */
  top: Task | null
  /** Why `top` won — drives honest one-line copy, never a guess. */
  reason: WorkReason | null
  /** Every eligible task, best first. The "pick something else" list. */
  candidates: Task[]
}

const BUCKETS: WorkReason[] = ['in_progress', 'overdue', 'today', 'backlog']

/** Open = still actionable. Mirrors the selectors' notion of an open task. */
function isOpen(t: Task): boolean {
  return t.status === 'todo' || t.status === 'in_progress'
}

function bucketOf(t: Task, todayStr: string): WorkReason {
  if (t.status === 'in_progress') return 'in_progress'
  if (t.scheduled_for != null && isBeforeDay(t.scheduled_for, todayStr)) return 'overdue'
  if (t.scheduled_for != null && isSameDay(t.scheduled_for, todayStr)) return 'today'
  return 'backlog'
}

/** Nulls last, ascending otherwise. ISO dates (yyyy-MM-dd) compare lexically. */
function cmpDateAsc(a: string | null, b: string | null): number {
  if (a === b) return 0
  if (a == null) return 1
  if (b == null) return -1
  return a < b ? -1 : 1
}

/** Nulls (unestimated) last, ascending otherwise. */
function cmpEffortAsc(a: number | null, b: number | null): number {
  if (a == null && b == null) return 0
  if (a == null) return 1
  if (b == null) return -1
  return a - b
}

export function pickWork(tasks: Task[], todayStr: string): WorkPick {
  const open = tasks.filter(isOpen)
  if (open.length === 0) return { top: null, reason: null, candidates: [] }

  const rank = new Map<string, number>()
  for (const t of open) rank.set(t.id, BUCKETS.indexOf(bucketOf(t, todayStr)))

  const candidates = open.slice().sort((a, b) => {
    const byBucket = (rank.get(a.id) ?? 0) - (rank.get(b.id) ?? 0)
    if (byBucket !== 0) return byBucket
    // High priority first.
    if (a.priority !== b.priority) return b.priority - a.priority
    const byDue = cmpDateAsc(a.due_date, b.due_date)
    if (byDue !== 0) return byDue
    const byEffort = cmpEffortAsc(a.effort_minutes, b.effort_minutes)
    if (byEffort !== 0) return byEffort
    // The order the user dragged them into, then id so the result is total.
    if (a.position !== b.position) return a.position - b.position
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
  })

  const top = candidates[0]
  return { top, reason: bucketOf(top, todayStr), candidates }
}

/** One honest line explaining the pick. Never congratulatory, never vague. */
export function reasonLabel(reason: WorkReason): string {
  switch (reason) {
    case 'in_progress':
      return 'You already started this one'
    case 'overdue':
      return 'This one is overdue'
    case 'today':
      return 'You planned this for today'
    case 'backlog':
      return 'Nothing is scheduled for today, so this is next up'
  }
}
