import { isoDateOffset } from '@/lib/date'
import { shouldTrackDayReturned } from '@/features/analytics/events'
import type { EstimationBias } from '@/features/insights/insights'
import type { CapacityStatus } from './capacity'
import { sumEffort } from './capacity'
import type { DayPlan, PlanPick } from './autoPlan'
import type { StreakInfo } from './streak'
import { rolloverSpan } from './rollover'
import type { Task, TaskPriority } from '@/types/database'

/**
 * Composition logic for the "Start your day" briefing. Pure, no React, no I/O —
 * fully unit-tested.
 *
 * This is DELIBERATELY NOT a new engine. Every number arrives already computed
 * by the feature that owns it (streak, roll-over, capacity, planDay,
 * estimationBias); this module only decides WHICH sections appear, in what
 * shape, for which plan. That keeps the digest impossible to disagree with the
 * rest of Today — if the meter says 2h free, so does the briefing.
 */

/** Accounts this many local days old (or younger) get the gentler welcome card. */
export const WELCOME_MAX_AGE_DAYS = 1

/** Only genuinely high-priority work raises an overdue alert. */
const HIGH_PRIORITY: TaskPriority = 3

/** How many alerts the card will show before it starts nagging. */
export const MAX_ALERTS = 3

const isOpen = (t: Task) => t.status === 'todo' || t.status === 'in_progress'

export interface DigestAlert {
  task: Task
  /** `overdue` = high-priority and already late. `due_soon` = due within 48h. */
  kind: 'overdue' | 'due_soon'
}

/**
 * Is the briefing hidden right now? Dismissal is scoped to the LOCAL DAY it was
 * dismissed on, so tomorrow it returns on its own — reusing the same
 * "different local day?" comparison that gates the `day_returned` event.
 */
export function isDigestDismissed(dismissedDay: string | null, todayStr: string): boolean {
  return !shouldTrackDayReturned(dismissedDay, todayStr)
}

/**
 * Overdue HIGH-priority work plus anything due inside 48h (today or tomorrow).
 * Overdue first, then soonest deadline, then priority — capped so the card
 * informs rather than nags.
 */
export function selectPriorityAlerts(
  tasks: Task[],
  todayStr: string,
  limit: number = MAX_ALERTS,
): DigestAlert[] {
  const tomorrow = isoDateOffset(1, new Date(`${todayStr}T00:00:00`))
  const alerts: DigestAlert[] = []

  for (const task of tasks) {
    if (!isOpen(task)) continue
    const lateSchedule = task.scheduled_for != null && task.scheduled_for < todayStr
    const lateDue = task.due_date != null && task.due_date < todayStr

    if (task.priority === HIGH_PRIORITY && (lateSchedule || lateDue)) {
      alerts.push({ task, kind: 'overdue' })
      continue // an overdue item is never also "due soon"
    }
    if (task.due_date != null && task.due_date >= todayStr && task.due_date <= tomorrow) {
      alerts.push({ task, kind: 'due_soon' })
    }
  }

  return alerts
    .sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === 'overdue' ? -1 : 1
      const ad = a.task.due_date ?? '9999-12-31'
      const bd = b.task.due_date ?? '9999-12-31'
      if (ad !== bd) return ad < bd ? -1 : 1
      if (a.task.priority !== b.task.priority) return b.task.priority - a.task.priority
      return a.task.id < b.task.id ? -1 : a.task.id > b.task.id ? 1 : 0
    })
    .slice(0, limit)
}

export interface DigestInput {
  todayStr: string
  isPro: boolean
  /** Whole local days since signup; null when unknown (never forces `welcome`). */
  accountAgeDays: number | null
  streak: StreakInfo
  /** Output of selectRolloverTasks — carried over from previous days. */
  rolloverTasks: Task[]
  hasCalendarSource: boolean
  busyMinutes: number
  /** Minutes still free today (tasks + meetings already subtracted). */
  freeMinutes: number
  capacityStatus: CapacityStatus
  /** planDay() for today, or null when auto-plan is off. */
  plan: DayPlan | null
  bias: EstimationBias
  /** Every task in the workspace — alerts are scanned from this. */
  tasks: Task[]
}

export interface DigestSuggestion {
  picks: PlanPick[]
  taskCount: number
  totalMinutes: number
}

export interface Digest {
  /** `welcome` softens the card for a day-1/day-2 account. */
  variant: 'welcome' | 'standard'
  /** 0 ⇒ hide the streak entirely (never shame a missing streak). */
  streakCount: number
  streakIncludesToday: boolean
  /**
   * `span` reuses the roll-over banner's own logic so a two-day-old task is
   * never mislabelled "yesterday".
   */
  rollover: { count: number; minutes: number; span: 'yesterday' | 'earlier' } | null
  meetings: { minutes: number } | null
  freeMinutes: number
  capacityStatus: CapacityStatus
  /** PRO: a ready-made plan to accept in one tap. */
  suggestion: DigestSuggestion | null
  /** PRO: honest estimation-bias nudge; null unless it's both known and useful. */
  bias: { direction: 'under' | 'over'; pct: number } | null
  /** PRO: overdue high-priority + imminent deadlines. */
  alerts: DigestAlert[]
  /** FREE: one quiet line saying a suggested day exists behind Pro. */
  proTeaser: boolean
  /** Today is already at capacity — the CTA becomes informational. */
  dayAlreadyPlanned: boolean
}

/** True when the planner actually produced something worth offering. */
function hasOfferablePlan(plan: DayPlan | null): plan is DayPlan {
  return plan != null && !plan.capacityFull && plan.picks.length > 0
}

/**
 * Build the briefing.
 *
 * FREE gets greeting + streak + roll-over + meetings + the capacity headline +
 * the existing "Plan my day" action — genuinely useful on its own.
 * PRO adds the pre-computed plan, the bias nudge and priority alerts.
 */
export function composeDigest(input: DigestInput): Digest {
  const {
    todayStr,
    isPro,
    accountAgeDays,
    streak,
    rolloverTasks,
    hasCalendarSource,
    busyMinutes,
    freeMinutes,
    capacityStatus,
    plan,
    bias,
    tasks,
  } = input

  const variant =
    accountAgeDays != null && accountAgeDays <= WELCOME_MAX_AGE_DAYS ? 'welcome' : 'standard'
  const offerable = hasOfferablePlan(plan)

  return {
    variant,
    streakCount: streak.count,
    streakIncludesToday: streak.includesToday,
    rollover:
      rolloverTasks.length > 0
        ? {
            count: rolloverTasks.length,
            minutes: sumEffort(rolloverTasks),
            // 'none' is unreachable here (the list is non-empty), but narrow it
            // explicitly rather than casting.
            span: rolloverSpan(rolloverTasks, todayStr) === 'earlier' ? 'earlier' : 'yesterday',
          }
        : null,
    meetings: hasCalendarSource && busyMinutes > 0 ? { minutes: busyMinutes } : null,
    freeMinutes: Math.max(0, Math.round(freeMinutes)),
    capacityStatus,
    suggestion:
      isPro && offerable
        ? { picks: plan.picks, taskCount: plan.picks.length, totalMinutes: plan.totalMinutes }
        : null,
    // The sample threshold is the real guard here, not the account age: a new
    // account simply has no samples, so this stays null on its own.
    bias:
      isPro && bias.hasEnough && bias.biasPct != null &&
      (bias.direction === 'under' || bias.direction === 'over')
        ? { direction: bias.direction, pct: Math.abs(bias.biasPct) }
        : null,
    // Deliberately NOT gated on the welcome variant. Alerts are about what's
    // coming, not what's happened — a day-one user with something due tomorrow
    // should see it, and withholding it would be the "empty shell" we're avoiding.
    alerts: isPro ? selectPriorityAlerts(tasks, todayStr) : [],
    proTeaser: !isPro && offerable,
    dayAlreadyPlanned: plan?.capacityFull ?? false,
  }
}
